import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 게임 목록 + 현재 동시 사용 중 수(currentGame 점유) */
  async list() {
    const games = await this.prisma.game.findMany({ orderBy: { id: 'asc' } });
    const inUse = await this.prisma.vpnAccount.groupBy({
      by: ['currentGameId'],
      where: { currentGameId: { not: null } },
      _count: { _all: true },
    });
    const useMap = new Map(inUse.map((a) => [a.currentGameId, a._count._all]));
    return games.map((g) => ({
      id: g.id,
      name: g.name,
      image: g.image,
      inUse: useMap.get(g.id) ?? 0,
    }));
  }

  /** 게임 등록 */
  async create(name: string, image?: string) {
    const exists = await this.prisma.game.findUnique({ where: { name } });
    if (exists) throw new ConflictException('이미 존재하는 게임입니다.');
    return this.prisma.game.create({ data: { name, image: image || null } });
  }

  /** 게임 이미지 변경 */
  async setImage(id: number, image: string | null) {
    const g = await this.prisma.game.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('게임을 찾을 수 없습니다.');
    await this.prisma.game.update({ where: { id }, data: { image: image || null } });
    return { ok: true };
  }

  /** 게임 삭제 — 연결된 계정이 있으면 막는다(먼저 계정 삭제 필요) */
  async remove(id: number) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('게임을 찾을 수 없습니다.');
    const cnt = await this.prisma.vpnAccount.count({ where: { currentGameId: id } });
    if (cnt > 0) {
      throw new ConflictException(
        `이 게임을 현재 사용 중인 계정 ${cnt}개가 있습니다. 잠시 후 다시 시도하세요.`,
      );
    }
    await this.prisma.game.delete({ where: { id } });
    return { ok: true };
  }
}
