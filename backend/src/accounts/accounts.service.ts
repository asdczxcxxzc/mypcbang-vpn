import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  encrypt,
  decrypt,
  generateL2tpCredentials,
} from '../common/crypto.util';

/**
 * VPN 계정 = 연결 슬롯(IP+로그인). 게임은 유저가 연결 시 선택(currentGame).
 * 이용권/시간/정지는 사용자(User)가 보유.
 */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private pub = {
    id: true,
    vpnIpId: true,
    username: true,
    status: true,
    assignedTo: true,
    assignedAt: true,
    currentGameId: true,
  };

  /** 계정 생성 (게임 없이) */
  async create(vpnIpId: number, username?: string, password?: string) {
    const ip = await this.prisma.vpnIp.findUnique({ where: { id: vpnIpId } });
    if (!ip) throw new NotFoundException('공유기를 찾을 수 없습니다.');
    const gen = generateL2tpCredentials();
    const u = username || gen.username;
    const dup = await this.prisma.vpnAccount.findUnique({ where: { username: u } });
    if (dup) throw new ConflictException(`이미 존재하는 계정 ID: ${u}`);
    return this.prisma.vpnAccount.create({
      data: { vpnIpId, username: u, passwordEnc: encrypt(password || gen.password) },
      select: this.pub,
    });
  }

  /** 한 공유기에 계정 N개 추가 생성 */
  async createBatch(vpnIpId: number, count: number) {
    const out: any[] = [];
    for (let i = 0; i < count; i++) out.push(await this.create(vpnIpId));
    return out;
  }

  async list(opts: { vpnIpId?: number; status?: string }) {
    return this.prisma.vpnAccount.findMany({
      where: { vpnIpId: opts.vpnIpId, status: opts.status },
      orderBy: { id: 'asc' },
      select: {
        ...this.pub,
        currentGame: { select: { name: true } },
        vpnIp: { select: { ipAddress: true, region: true, online: true } },
        user: {
          select: {
            username: true, connected: true, blocked: true,
            planType: true, remainingSeconds: true, expiresAt: true,
          },
        },
      },
    });
  }

  /** 현재 연결 중 현황 (유저 connected + 현재 게임) */
  async connectedStatus() {
    const accs = await this.prisma.vpnAccount.findMany({
      where: { status: 'assigned', user: { connected: true } },
      select: {
        id: true, username: true, assignedAt: true,
        currentGame: { select: { name: true } },
        vpnIp: { select: { ipAddress: true, region: true, online: true } },
        user: {
          select: {
            id: true, username: true, lastHeartbeat: true,
            planType: true, remainingSeconds: true, expiresAt: true,
            stopsUsed: true, timePenalty: true, blocked: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });
    return accs.map((a) => ({
      accountId: a.id,
      user: a.user?.username ?? '-',
      userId: a.user?.id,
      game: a.currentGame?.name ?? '(미선택)',
      ipAddress: a.vpnIp.ipAddress,
      region: a.vpnIp.region,
      online: a.vpnIp.online,
      planType: a.user?.planType ?? null,
      remainingSeconds: a.user?.remainingSeconds ?? null,
      expiresAt: a.user?.expiresAt ?? null,
      stopsUsed: a.user?.stopsUsed ?? 0,
      timePenalty: a.user?.timePenalty ?? false,
      blocked: a.user?.blocked ?? false,
      lastHeartbeat: a.user?.lastHeartbeat ?? null,
    }));
  }

  async update(id: number, patch: { username?: string; password?: string }) {
    const acc = await this.prisma.vpnAccount.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException('계정을 찾을 수 없습니다.');
    const data: any = {};
    if (patch.username !== undefined) data.username = patch.username;
    if (patch.password) data.passwordEnc = encrypt(patch.password);
    return this.prisma.vpnAccount.update({ where: { id }, data, select: this.pub });
  }

  async remove(id: number) {
    const acc = await this.prisma.vpnAccount.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException('계정을 찾을 수 없습니다.');
    await this.prisma.vpnAccount.delete({ where: { id } });
    return { ok: true };
  }

  async reveal(id: number) {
    const acc = await this.prisma.vpnAccount.findUnique({
      where: { id },
      include: { vpnIp: true, currentGame: { select: { name: true } } },
    });
    if (!acc) throw new NotFoundException('계정을 찾을 수 없습니다.');
    return {
      id: acc.id, ipAddress: acc.vpnIp.ipAddress, host: acc.vpnIp.host,
      port: acc.vpnIp.port, protocol: acc.vpnIp.protocol,
      currentGame: acc.currentGame?.name ?? null,
      username: acc.username, password: decrypt(acc.passwordEnc),
      psk: acc.vpnIp.pskEnc ? decrypt(acc.vpnIp.pskEnc) : null,
    };
  }

  generateCredentials() {
    return generateL2tpCredentials();
  }
}
