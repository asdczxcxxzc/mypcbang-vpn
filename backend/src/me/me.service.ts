import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { TelegramService } from '../telegram/telegram.service';
import { decrypt } from '../common/crypto.util';
import { STOP_LIMIT } from '../common/config';

const VPN_FAIL_LIMIT = 3; // 3회 실패 시 오프라인 처리

/**
 * 클라이언트(사용자) 전용.
 * 유저는 게임만 선택 → 빈 슬롯(계정/IP) 자동 할당. IP는 미선택.
 * 같은 IP에서 같은 게임 동시 1명. 자리 없으면 NO_SLOT.
 * IP/계정 자격증명은 status 에 노출하지 않음(연결 시에만 전달, 앱은 미표시).
 */
@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);
  private vpnFailures = new Map<number, number>(); // vpnIpId → 연속 실패 횟수

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: LifecycleService,
    private readonly telegram: TelegramService,
  ) {}

  private user(userId: number) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
  /** 현재 연결로 점유 중인 계정 (연결 중에만 존재) */
  private heldAccount(userId: number) {
    return this.prisma.vpnAccount.findFirst({
      where: { assignedTo: userId },
      include: { vpnIp: true, currentGame: { select: { id: true, name: true } } },
    });
  }
  private stopInfo(u: { planType: string | null; stopsUsed: number; timePenalty: boolean; blocked: boolean }) {
    if (u.planType !== 'time') return null;
    return {
      stopLimit: STOP_LIMIT, stopsUsed: u.stopsUsed,
      stopsRemaining: Math.max(0, STOP_LIMIT - u.stopsUsed),
      timePenalty: u.timePenalty, blocked: u.blocked,
    };
  }

  /** 상태 — IP/자격증명은 노출하지 않음 */
  async status(userId: number) {
    const u = await this.user(userId);
    if (!u) throw new BadRequestException('사용자를 찾을 수 없습니다.');
    const held = u.connected ? await this.heldAccount(userId) : null;
    return {
      hasPlan: !!u.planType,
      planType: u.planType,
      remainingSeconds: u.remainingSeconds,
      expiresAt: u.expiresAt,
      connected: u.connected,
      currentGame: held?.currentGame?.name ?? null,
      blocked: u.blocked,
      suspended: u.suspended,
      stop: this.stopInfo(u),
    };
  }

  /** 내 사용량 (최근 N일 일별 사용 분) — 그래프용 */
  async usage(userId: number, days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);
    const sessions = await this.prisma.session.findMany({
      where: { userId, startedAt: { gte: since } },
      select: { startedAt: true, endedAt: true },
    });
    const key = (d: Date) => {
      const m = `${d.getMonth() + 1}`.padStart(2, '0');
      const day = `${d.getDate()}`.padStart(2, '0');
      return `${m}-${day}`;
    };
    const map = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      map.set(key(d), 0);
    }
    const now = Date.now();
    for (const s of sessions) {
      const k = key(new Date(s.startedAt));
      if (!map.has(k)) continue;
      const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
      const mins = Math.max(0, Math.round((end - new Date(s.startedAt).getTime()) / 60000));
      map.set(k, (map.get(k) ?? 0) + mins);
    }
    return [...map.entries()].map(([label, minutes]) => ({ label, minutes }));
  }

  /** 게임 목록 + 현재 자리 있음 여부 (자리 없으면 available:false) */
  async availableGames(userId: number) {
    const games = await this.prisma.game.findMany({ orderBy: { id: 'asc' } });
    // 자리 있는 IP 후보: status available 계정이 있는 IP 집합
    const freeAccounts = await this.prisma.vpnAccount.findMany({
      where: { status: 'available' },
      select: { vpnIpId: true },
    });
    const freeIpCount = new Map<number, number>();
    for (const a of freeAccounts) freeIpCount.set(a.vpnIpId, (freeIpCount.get(a.vpnIpId) ?? 0) + 1);

    // 게임별로 점유된 IP
    const occupied = await this.prisma.vpnAccount.findMany({
      where: { currentGameId: { not: null } },
      select: { vpnIpId: true, currentGameId: true },
    });

    return games.map((g) => {
      const takenIps = new Set(
        occupied.filter((o) => o.currentGameId === g.id).map((o) => o.vpnIpId),
      );
      // 자유 계정이 있고, 그 IP가 이 게임으로 점유돼 있지 않은 IP가 하나라도 있으면 available
      let available = false;
      for (const [ipId, cnt] of freeIpCount) {
        if (cnt > 0 && !takenIps.has(ipId)) { available = true; break; }
      }
      return { id: g.id, name: g.name, image: g.image, available };
    });
  }

  /** VPN ON — 게임 선택 → 빈 슬롯 자동 할당. 자리 없으면 NO_SLOT */
  async connect(userId: number, gameId: number) {
    const u = await this.user(userId);
    if (!u) throw new BadRequestException('사용자를 찾을 수 없습니다.');
    if (u.blocked) throw new ForbiddenException({ code: 'BLOCKED', message: '차단된 계정입니다. 관리자에게 문의하세요.' });
    if (u.suspended) throw new ForbiddenException({ code: 'SUSPENDED', message: '정지된 계정입니다. 관리자에게 문의하세요.' });
    if (!u.planType) throw new BadRequestException('이용권이 없습니다. 관리자에게 문의하세요.');
    if (this.lifecycle.isExpired(u)) throw new BadRequestException('이용권이 만료되었습니다.');

    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new BadRequestException('게임을 선택하세요.');

    // 이전 연결/점유 슬롯이 남아있으면 정리하고 새로 연결 (끊김/응답없음 후 재연결 대비)
    const held = await this.heldAccount(userId);
    if (held) {
      await this.releaseAccount(held.id);
      await this.prisma.user.update({ where: { id: userId }, data: { connected: false } });
    }

    // 이 게임으로 이미 점유된 IP 집합
    const occupied = await this.prisma.vpnAccount.findMany({
      where: { currentGameId: gameId },
      select: { vpnIpId: true },
    });
    const takenIps = new Set(occupied.map((o) => o.vpnIpId));

    // 후보: status available 이고, 그 IP가 이 게임으로 점유돼 있지 않은 계정
    const candidates = await this.prisma.vpnAccount.findMany({
      where: { status: 'available', vpnIpId: { notIn: [...takenIps] } },
      include: { vpnIp: true },
      orderBy: { id: 'asc' },
      take: 30,
    });

    const now = new Date();
    for (const cand of candidates) {
      // 원자적 클레임
      const claimed = await this.prisma.vpnAccount.updateMany({
        where: { id: cand.id, status: 'available' },
        data: { status: 'assigned', assignedTo: userId, assignedAt: now, currentGameId: gameId },
      });
      if (claimed.count === 1) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { connected: true, lastHeartbeat: now, lastTickAt: now },
        });
        await this.prisma.session.create({ data: { userId, gameId, vpnAccountId: cand.id } });
        // 연결 성공 시 해당 공유기 실패 카운터 초기화
        this.vpnFailures.delete(cand.vpnIpId);
        return {
          game: game.name,
          connection: {
            // 클라이언트가 내부적으로 L2TP 연결에만 사용 (앱 화면에 표시 금지)
            vpnIpId: cand.vpnIpId,
            host: cand.vpnIp.host, port: cand.vpnIp.port, protocol: cand.vpnIp.protocol,
            username: cand.username, password: decrypt(cand.passwordEnc),
            psk: cand.vpnIp.pskEnc ? decrypt(cand.vpnIp.pskEnc) : null,
          },
          plan: { type: u.planType, remainingSeconds: u.remainingSeconds, expiresAt: u.expiresAt },
          stop: this.stopInfo(u),
        };
      }
    }

    // 빈 자리 없음
    throw new ConflictException({
      code: 'NO_SLOT',
      message: '현재 자리가 없습니다. 고객센터에 문의주세요.',
    });
  }

  async heartbeat(userId: number) {
    const u = await this.user(userId);
    if (!u || !u.planType) throw new BadRequestException('이용권이 없습니다.');
    await this.prisma.user.update({
      where: { id: userId },
      data: { connected: true, lastHeartbeat: new Date(), ...(u.lastTickAt ? {} : { lastTickAt: new Date() }) },
    });
    if (this.lifecycle.isExpired(u)) return { ok: false, expired: true };
    return {
      ok: true, expired: false, planType: u.planType,
      remainingSeconds: u.remainingSeconds, expiresAt: u.expiresAt, stop: this.stopInfo(u),
    };
  }

  /** VPN OFF — 슬롯 반납(풀로) + 정지 1회(시간제) */
  async disconnect(userId: number) {
    const u = await this.user(userId);
    if (!u) return { ok: true };
    await this.lifecycle.registerStop(userId);
    await this.lifecycle.endConnection(userId); // 내부에서 슬롯 반납
    const after = await this.user(userId);
    return { ok: true, stop: after ? this.stopInfo(after) : null };
  }

  /** VPN 다이얼 실패 보고 — N회 누적 시 공유기 오프라인 + 텔레그램 알림 */
  async reportVpnFailed(userId: number, vpnIpId: number) {
    await this.lifecycle.endConnection(userId);
    const fails = (this.vpnFailures.get(vpnIpId) ?? 0) + 1;
    this.vpnFailures.set(vpnIpId, fails);
    this.logger.warn(`공유기 #${vpnIpId} VPN 연결 실패 ${fails}/${VPN_FAIL_LIMIT}회`);

    if (fails >= VPN_FAIL_LIMIT) {
      const router = await this.prisma.vpnIp.findUnique({ where: { id: vpnIpId } });
      if (router && router.online) {
        await this.prisma.vpnIp.update({ where: { id: vpnIpId }, data: { online: false } });
        await this.prisma.alert.create({
          data: {
            type: 'router_offline',
            username: '-',
            message: `공유기 오프라인(연결 실패 ${VPN_FAIL_LIMIT}회) — ${router.ipAddress}${router.region ? ` (${router.region})` : ''}`,
          },
        });
        await this.telegram.send(`⚠️ 공유기 오프라인\nIP: ${router.ipAddress}\n연결 실패 ${VPN_FAIL_LIMIT}회 누적 → 자동 비활성화`);
        this.vpnFailures.delete(vpnIpId);
      }
    }
    return { ok: true, fails };
  }

  private async releaseAccount(accountId: number) {
    await this.prisma.session.updateMany({ where: { vpnAccountId: accountId, endedAt: null }, data: { endedAt: new Date() } });
    await this.prisma.vpnAccount.update({
      where: { id: accountId },
      data: { status: 'available', assignedTo: null, assignedAt: null, currentGameId: null },
    });
  }
}
