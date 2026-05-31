import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { RouterControlService } from '../routers-control/router-control.service';
import { decrypt } from '../common/crypto.util';
import { STOP_LIMIT, ABUSE_STOPS, ABUSE_WINDOW_MS } from '../common/config';

const HEARTBEAT_TIMEOUT_MS = Number(process.env.HEARTBEAT_TIMEOUT_MS ?? 60_000);
const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS ?? 30_000);
const HEALTH_TIMEOUT_MS = 4000;

/**
 * 주기 작업 + 연결 수명주기. 이용권/시간/정지는 사용자(User) 단위.
 *  - 공유기 헬스체크
 *  - 시간제 차감(연결 중 또는 정지페널티)
 *  - 하트비트 끊김/이용권 만료 → 연결해제 + 공유기 강제해제 + 텔레그램
 */
@Injectable()
export class LifecycleService implements OnModuleInit {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly routerControl: RouterControlService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.sweep().catch((e) => this.logger.error('스위프 오류', e));
    }, SWEEP_INTERVAL_MS);
  }

  private async sweep() {
    await this.healthCheck();
    await this.processUsers();
  }

  // ---------- 공유기 헬스체크 ----------
  private async healthCheck() {
    const routers = await this.prisma.vpnIp.findMany({
      select: { id: true, host: true, port: true, ipAddress: true, online: true, region: true },
    });
    for (const r of routers) {
      const alive = await this.tcpProbe(r.host, r.port);
      if (alive !== r.online) {
        await this.prisma.vpnIp.update({ where: { id: r.id }, data: { online: alive, lastCheckedAt: new Date() } });
        if (!alive) {
          await this.prisma.alert.create({
            data: { type: 'router_offline', username: '-', message: `공유기 오프라인 — ${r.ipAddress}${r.region ? ` (${r.region})` : ''}` },
          });
        }
      } else {
        await this.prisma.vpnIp.update({ where: { id: r.id }, data: { lastCheckedAt: new Date() } });
      }
    }
  }

  // ---------- 사용자 수명주기 ----------
  private async processUsers() {
    const now = Date.now();
    const users = await this.prisma.user.findMany({
      where: { planType: { not: null } },
      include: {
        account: { include: { vpnIp: true, currentGame: { select: { name: true } } } },
      },
    });

    for (const u of users) {
      const stale =
        !u.lastHeartbeat || now - new Date(u.lastHeartbeat).getTime() > HEARTBEAT_TIMEOUT_MS;

      // 1) 시간제 차감 (연결 중 OR 정지페널티)
      if (u.planType === 'time') {
        const activeConnected = u.connected && !stale;
        if (activeConnected || u.timePenalty) {
          if (!u.lastTickAt) {
            await this.prisma.user.update({ where: { id: u.id }, data: { lastTickAt: new Date() } });
          } else {
            const used = Math.floor((now - new Date(u.lastTickAt).getTime()) / 1000);
            if (used > 0) {
              const remain = Math.max(0, (u.remainingSeconds ?? 0) - used);
              await this.prisma.user.update({ where: { id: u.id }, data: { remainingSeconds: remain, lastTickAt: new Date() } });
              u.remainingSeconds = remain;
            }
          }
        }
      }

      // 2) 만료
      const timeExpired = u.planType === 'time' && (u.remainingSeconds ?? 0) <= 0;
      const monthlyExpired = u.planType === 'monthly' && u.expiresAt != null && new Date(u.expiresAt).getTime() <= now;
      if (timeExpired || monthlyExpired) {
        await this.expire(u);
        continue;
      }

      // 3) 하트비트 끊김
      if (u.connected && stale) {
        await this.drop(u);
      }
    }
  }

  /**
   * 정지(끄기) 1회 등록 — 시간제 전용 (사용자 단위).
   *  - STOP_LIMIT 초과 → timePenalty(연결 안 해도 시간 흐름)
   *  - 윈도우 내 ABUSE_STOPS회 → blocked + 알림(패널+텔레그램)
   */
  async registerStop(userId: number) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { account: { include: { vpnIp: { select: { ipAddress: true } } } } },
    });
    if (!u || u.planType !== 'time') return;

    const now = Date.now();
    let abuseStart = u.abuseWindowStart ? new Date(u.abuseWindowStart).getTime() : 0;
    let abuseCount: number;
    if (abuseStart && now - abuseStart < ABUSE_WINDOW_MS) abuseCount = u.abuseCount + 1;
    else { abuseStart = now; abuseCount = 1; }

    const stopsUsed = u.stopsUsed + 1;
    const timePenalty = u.timePenalty || stopsUsed >= STOP_LIMIT;
    // 어뷰징 자동차단은 '허용량을 다 쓴 뒤'에만 적용 → 잔여 횟수를 높게 주면 그만큼 차단도 풀림
    const exhausted = stopsUsed >= STOP_LIMIT;
    const newlyBlocked = !u.blocked && exhausted && abuseCount >= ABUSE_STOPS;

    await this.prisma.user.update({
      where: { id: u.id },
      data: { stopsUsed, timePenalty, blocked: u.blocked || newlyBlocked, abuseWindowStart: new Date(abuseStart), abuseCount },
    });

    if (newlyBlocked) {
      const ip = u.account?.vpnIp.ipAddress ?? '-';
      const reason = `${Math.round(ABUSE_WINDOW_MS / 60000)}분 내 ${abuseCount}회 정지`;
      await this.prisma.alert.create({
        data: { type: 'abuse_blocked', username: u.username, message: `${u.username} 반복 정지 차단 — ${ip} (${reason})` },
      });
      await this.telegram.send(
        `🚫 <b>반복 정지 차단</b>\n유저: <code>${u.username}</code>\nIP: <code>${ip}</code>\n계정: <code>${u.account?.username ?? '-'}</code>\n사유: ${reason}`,
      );
      this.logger.warn(`반복 정지 차단: ${u.username} (${reason})`);
    }
  }

  /** 하트비트 끊김 — 연결 해제 + 정지 1회 + 강제해제 + 텔레그램 */
  private async drop(u: any) {
    await this.endConnection(u.id);
    await this.registerStop(u.id);
    await this.notifyAndForceDisconnect(u, '하트비트 끊김', 'heartbeat_lost');
    this.logger.warn(`하트비트 끊김 → 해제: ${u.username}`);
  }

  /** 이용권 만료 — 연결 해제 + 슬롯 반납 + 플랜 제거 + 강제해제 + 텔레그램 */
  private async expire(u: any) {
    await this.notifyAndForceDisconnect(u, '이용시간 만료', 'plan_expired');
    await this.prisma.session.updateMany({ where: { userId: u.id, endedAt: null }, data: { endedAt: new Date() } });
    await this.prisma.vpnAccount.updateMany({
      where: { assignedTo: u.id },
      data: { status: 'available', assignedTo: null, assignedAt: null, currentGameId: null },
    });
    await this.prisma.user.update({
      where: { id: u.id },
      data: {
        planType: null, remainingSeconds: null, expiresAt: null, lastTickAt: null,
        connected: false, lastHeartbeat: null,
        stopsUsed: 0, timePenalty: false, abuseWindowStart: null, abuseCount: 0,
      },
    });
    this.logger.warn(`이용권 만료 → 해제: ${u.username}`);
  }

  /** 공유기 강제해제 시도 + 텔레그램 알림(IP·VPN ID·비번 포함) + 패널 알림 */
  private async notifyAndForceDisconnect(u: any, reason: string, alertType: string) {
    const acc = u.account;
    if (acc) {
      await this.routerControl.disconnectSession(acc.vpnIp, acc.username);
      await this.telegram.notifyDisconnect({
        reason,
        username: u.username,
        game: acc.currentGame?.name ?? '(미선택)',
        ipAddress: acc.vpnIp.ipAddress,
        vpnUsername: acc.username,
        vpnPassword: decrypt(acc.passwordEnc),
      });
    }
    await this.prisma.alert.create({
      data: {
        type: alertType,
        username: u.username,
        message: `${u.username} ${reason} — ${acc ? acc.vpnIp.ipAddress : '계정없음'} VPN 해제`,
      },
    });
  }

  /** 연결 종료 (사용자 connected 해제 + 세션 종료 + 슬롯 풀 반납) */
  async endConnection(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { connected: false, lastHeartbeat: null, lastTickAt: null },
    });
    await this.prisma.session.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: new Date() },
    });
    // 점유 슬롯 풀로 완전 반납 (그 IP에서 게임 풀림 + 계정 재사용 가능)
    await this.prisma.vpnAccount.updateMany({
      where: { assignedTo: userId },
      data: { status: 'available', assignedTo: null, assignedAt: null, currentGameId: null },
    });
  }

  /** 만료 즉시 판정 */
  isExpired(p: { planType: string | null; remainingSeconds: number | null; expiresAt: Date | null }) {
    if (p.planType === 'time') return (p.remainingSeconds ?? 0) <= 0;
    if (p.planType === 'monthly') return p.expiresAt != null && new Date(p.expiresAt).getTime() <= Date.now();
    return false;
  }

  private tcpProbe(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net') as typeof import('net');
      const socket = new net.Socket();
      let done = false;
      const finish = (ok: boolean) => { if (done) return; done = true; socket.destroy(); resolve(ok); };
      socket.setTimeout(HEALTH_TIMEOUT_MS);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, host);
    });
  }
}
