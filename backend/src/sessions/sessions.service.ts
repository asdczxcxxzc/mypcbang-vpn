import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 최근 세션 기록 (사용자/게임/IP/시간) */
  async list(limit = 200) {
    const sessions = await this.prisma.session.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        user: { select: { username: true } },
        game: { select: { name: true } },
      },
    });

    // vpnAccountId → 계정 → 공유기(ipAddress/region) 매핑
    const accIds = [...new Set(sessions.map((s) => s.vpnAccountId))];
    const accs = await this.prisma.vpnAccount.findMany({
      where: { id: { in: accIds } },
      select: {
        id: true,
        vpnIp: { select: { ipAddress: true, region: true } },
      },
    });
    const ipMap = new Map(
      accs.map((a) => [a.id, { ipAddress: a.vpnIp.ipAddress, region: a.vpnIp.region }]),
    );

    return sessions.map((s) => {
      const ip = ipMap.get(s.vpnAccountId);
      const durationSec = s.endedAt
        ? Math.round(
            (new Date(s.endedAt).getTime() -
              new Date(s.startedAt).getTime()) /
              1000,
          )
        : null;
      return {
        id: s.id,
        user: s.user.username,
        game: s.game.name,
        ipAddress: ip?.ipAddress ?? '(삭제됨)',
        region: ip?.region ?? null,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSec, // 진행 중이면 null
      };
    });
  }

  /** 최근 14일 일별 세션 수 (대시보드 그래프용) */
  async dailyStats(days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const sessions = await this.prisma.session.findMany({
      where: { startedAt: { gte: since } },
      select: { startedAt: true },
    });

    // 날짜별 카운트 (YYYY-MM-DD)
    const counts = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      counts.set(this.dateKey(d), 0);
    }
    for (const s of sessions) {
      const key = this.dateKey(new Date(s.startedAt));
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()].map(([date, count]) => ({ date, count }));
  }

  private dateKey(d: Date) {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
}
