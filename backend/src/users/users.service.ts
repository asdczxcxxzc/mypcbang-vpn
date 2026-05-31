import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { STOP_LIMIT } from '../common/config';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 사용자 목록 (이용권·차단·배정계정 포함) */
  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        username: true,
        role: true,
        paid: true,
        createdAt: true,
        planType: true,
        remainingSeconds: true,
        expiresAt: true,
        connected: true,
        stopsUsed: true,
        timePenalty: true,
        blocked: true,
        suspended: true,
        _count: { select: { sessions: true } },
        account: {
          select: {
            id: true,
            currentGame: { select: { name: true } },
            vpnIp: { select: { ipAddress: true } },
          },
        },
      },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      paid: u.paid,
      createdAt: u.createdAt,
      online: u.connected,
      planType: u.planType,
      remainingSeconds: u.remainingSeconds,
      expiresAt: u.expiresAt,
      stopsUsed: u.stopsUsed,
      stopsRemaining: STOP_LIMIT - u.stopsUsed,
      timePenalty: u.timePenalty,
      blocked: u.blocked,
      suspended: u.suspended,
      status: u.blocked ? 'blocked' : u.suspended ? 'suspended' : 'normal',
      totalSessions: u._count.sessions,
      account: u.account
        ? { id: u.account.id, game: u.account.currentGame?.name ?? '(미선택)', ipAddress: u.account.vpnIp.ipAddress }
        : null,
    }));
  }

  /** 이용권 부여/설정 (기존 이용권 덮어쓰기 + 정지/차단 초기화) */
  async grantPlan(
    id: number,
    plan: { type: 'time'; minutes: number } | { type: 'monthly'; days: number },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    const data: any = {
      stopsUsed: 0, timePenalty: false, blocked: false,
      abuseWindowStart: null, abuseCount: 0, lastTickAt: null,
    };
    if (plan.type === 'time') {
      data.planType = 'time';
      data.remainingSeconds = Math.round(plan.minutes * 60);
      data.expiresAt = null;
    } else {
      data.planType = 'monthly';
      const exp = new Date();
      exp.setDate(exp.getDate() + plan.days);
      data.expiresAt = exp;
      data.remainingSeconds = null;
    }
    await this.prisma.user.update({ where: { id }, data });
    return { ok: true };
  }

  /** 시간/기간 추가 (시간제=분, 월정액=일) */
  async addTime(id: number, amount: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    if (!user.planType) throw new BadRequestException('이용권이 없습니다. 먼저 부여하세요.');
    if (user.planType === 'time') {
      await this.prisma.user.update({
        where: { id },
        data: { remainingSeconds: (user.remainingSeconds ?? 0) + amount * 60 },
      });
    } else {
      const base = user.expiresAt && user.expiresAt > new Date() ? new Date(user.expiresAt) : new Date();
      base.setDate(base.getDate() + amount);
      await this.prisma.user.update({ where: { id }, data: { expiresAt: base } });
    }
    return { ok: true };
  }

  /** 이용권 회수 (시간/플랜 제거 + 연결 종료) */
  async revokePlan(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    await this.prisma.session.updateMany({ where: { userId: id, endedAt: null }, data: { endedAt: new Date() } });
    // 배정/점유된 계정도 풀로 반납
    await this.prisma.vpnAccount.updateMany({
      where: { assignedTo: id },
      data: { status: 'available', assignedTo: null, assignedAt: null, currentGameId: null },
    });
    await this.prisma.user.update({
      where: { id },
      data: {
        planType: null, remainingSeconds: null, expiresAt: null, lastTickAt: null,
        connected: false, lastHeartbeat: null,
        stopsUsed: 0, timePenalty: false, blocked: false, abuseWindowStart: null, abuseCount: 0,
      },
    });
    return { ok: true };
  }

  /** 접속(정지) 잔여 횟수 직접 설정 (관리자). remaining 만큼 남도록 stopsUsed 역산.
   *  remaining > 기본한도면 stopsUsed 가 음수가 되어 추가 허용. 잔여가 있으면 페널티 해제. */
  async setStops(id: number, stopsRemaining: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    const remaining = Math.max(0, Math.floor(stopsRemaining));
    const stopsUsed = STOP_LIMIT - remaining;
    await this.prisma.user.update({
      where: { id },
      data: { stopsUsed, ...(remaining > 0 ? { timePenalty: false } : {}) },
    });
    return { ok: true, stopsRemaining: remaining };
  }

  /** 계정 상태 설정 (정상/차단/정지). 차단·정지 시 현재 연결도 강제 종료. */
  async setStatus(id: number, status: 'normal' | 'blocked' | 'suspended') {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    const blocked = status === 'blocked';
    const suspended = status === 'suspended';
    const data: any = { blocked, suspended };
    if (status === 'normal') { data.abuseWindowStart = null; data.abuseCount = 0; }
    if (blocked || suspended) {
      // 연결 종료 + 점유 슬롯 반납
      data.connected = false;
      await this.prisma.session.updateMany({ where: { userId: id, endedAt: null }, data: { endedAt: new Date() } });
      await this.prisma.vpnAccount.updateMany({
        where: { assignedTo: id },
        data: { status: 'available', assignedTo: null, assignedAt: null, currentGameId: null },
      });
    }
    await this.prisma.user.update({ where: { id }, data });
    return { ok: true, status };
  }

  /** 차단 해제 */
  async unblock(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    await this.prisma.user.update({
      where: { id },
      data: { blocked: false, abuseWindowStart: null, abuseCount: 0 },
    });
    return { ok: true };
  }

  /** 사용자 추가 */
  async create(username: string, password: string, role: string) {
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new ConflictException('이미 존재하는 아이디입니다.');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { username, passwordHash, role: role === 'admin' ? 'admin' : 'user' },
    });
    return { id: user.id, username: user.username, role: user.role };
  }

  /** 결제확인 표시 토글 */
  async setPaid(id: number, paid: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    await this.prisma.user.update({ where: { id }, data: { paid } });
    return { ok: true, paid };
  }

  /** 비밀번호 변경 */
  async changePassword(id: number, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { ok: true };
  }

  /** 사용자 삭제 (마지막 관리자 보호) */
  async remove(id: number, requesterId: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    if (id === requesterId) {
      throw new BadRequestException('자기 자신은 삭제할 수 없습니다.');
    }
    if (user.role === 'admin') {
      const adminCount = await this.prisma.user.count({
        where: { role: 'admin' },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('마지막 관리자는 삭제할 수 없습니다.');
      }
    }
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}
