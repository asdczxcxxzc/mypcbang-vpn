import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 알림 목록 (최신순) */
  list(limit = 100) {
    return this.prisma.alert.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** 안 읽은 알림 개수 (사이드바 배지용) */
  async unreadCount() {
    const count = await this.prisma.alert.count({ where: { read: false } });
    return { count };
  }

  /** 모두 읽음 처리 */
  async markAllRead() {
    await this.prisma.alert.updateMany({
      where: { read: false },
      data: { read: true },
    });
    return { ok: true };
  }
}
