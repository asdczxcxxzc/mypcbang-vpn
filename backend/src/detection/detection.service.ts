import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DetectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 클라이언트가 "지금 실행 중인 게임"을 보고 (방법 B).
   * 현재 할당된 게임과 비교해 일치 여부를 기록한다.
   * 불일치여도 차단하지 않고 기록만 남긴다(정책: 기록 + 관리자 알림).
   */
  async report(userId: number, detectedGame: string) {
    // 현재 이 사용자가 선택한 게임이 "할당 게임"
    const acc = await this.prisma.vpnAccount.findFirst({
      where: { assignedTo: userId, status: 'assigned' },
      include: { currentGame: { select: { name: true } } },
    });
    const assignedGame = acc?.currentGame?.name ?? '(없음)';
    const matched =
      assignedGame !== '(없음)' && assignedGame === detectedGame;

    await this.prisma.detectionLog.create({
      data: { userId, assignedGame, detectedGame, matched },
    });

    return { matched, assignedGame, detectedGame };
  }

  /** 불일치 로그 목록 (관리자 알림 대시보드용) */
  async mismatches(limit = 100) {
    return this.prisma.detectionLog.findMany({
      where: { matched: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { username: true } } },
    });
  }

  /** 안 읽은(최근) 불일치 개수 — 관리자 패널 배지용 */
  async mismatchCount() {
    const count = await this.prisma.detectionLog.count({
      where: { matched: false },
    });
    return { count };
  }
}
