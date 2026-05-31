import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  encrypt,
  decrypt,
  randomAlnum,
  generateL2tpCredentials,
} from '../common/crypto.util';

/** 공유기 등록 시 자동 생성할 VPN 계정 수 */
const AUTO_ACCOUNTS = Number(process.env.AUTO_ACCOUNTS ?? 5);

export interface CreateRouterInput {
  ipAddress: string;
  host?: string;
  port?: number;
  protocol?: string;
  psk?: string; // 없으면 자동생성
  adminUrl?: string;
  adminUsername?: string;
  adminPassword?: string;
  brand?: string;
  model?: string;
  region?: string;
  pcName?: string;
  memo?: string;
}

/**
 * 공유기(라우터) 관리 — 게임/계정은 별도(VpnAccount).
 * PSK·공유기 관리자 비번은 암호화 저장.
 */
@Injectable()
export class IpsService {
  constructor(private readonly prisma: PrismaService) {}

  private publicSelect = {
    id: true,
    ipAddress: true,
    host: true,
    port: true,
    protocol: true,
    adminUrl: true,
    adminUsername: true,
    brand: true,
    model: true,
    region: true,
    pcName: true,
    memo: true,
    online: true,
    lastCheckedAt: true,
  };

  /**
   * 공유기 등록. PSK 없으면 자동생성하고, VPN 계정 5개(게임 없이)를 자동 생성.
   */
  async create(input: CreateRouterInput) {
    const dup = await this.prisma.vpnIp.findUnique({
      where: { ipAddress: input.ipAddress },
    });
    if (dup) throw new ConflictException('이미 등록된 IP입니다.');

    const psk = input.psk || randomAlnum(20); // PSK 자동생성

    const router = await this.prisma.vpnIp.create({
      data: {
        ipAddress: input.ipAddress,
        host: input.host || input.ipAddress,
        port: input.port ?? 1701,
        protocol: input.protocol || 'l2tp',
        pskEnc: encrypt(psk),
        adminUrl: input.adminUrl,
        adminUsername: input.adminUsername,
        adminPasswordEnc: input.adminPassword
          ? encrypt(input.adminPassword)
          : null,
        brand: input.brand,
        model: input.model,
        region: input.region,
        pcName: input.pcName,
        memo: input.memo,
      },
      select: this.publicSelect,
    });

    // VPN 계정 5개 자동 생성 (게임은 유저가 연결 시 선택)
    for (let i = 0; i < AUTO_ACCOUNTS; i++) {
      const gen = generateL2tpCredentials();
      await this.prisma.vpnAccount.create({
        data: {
          vpnIpId: router.id,
          username: gen.username,
          passwordEnc: encrypt(gen.password),
        },
      });
    }

    return { ...router, createdAccounts: AUTO_ACCOUNTS };
  }

  /** 공유기 목록 + 계정 통계(전체/사용가능) */
  async list() {
    const routers = await this.prisma.vpnIp.findMany({
      orderBy: { id: 'asc' },
      select: {
        ...this.publicSelect,
        _count: { select: { accounts: true } },
      },
    });
    const avail = await this.prisma.vpnAccount.groupBy({
      by: ['vpnIpId'],
      where: { status: 'available' },
      _count: { _all: true },
    });
    const availMap = new Map(avail.map((a) => [a.vpnIpId, a._count._all]));
    return routers.map((r) => ({
      ...r,
      totalAccounts: r._count.accounts,
      availableAccounts: availMap.get(r.id) ?? 0,
    }));
  }

  async update(id: number, patch: Partial<CreateRouterInput>) {
    const r = await this.prisma.vpnIp.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('공유기를 찾을 수 없습니다.');
    const data: any = {};
    if (patch.ipAddress !== undefined) data.ipAddress = patch.ipAddress;
    if (patch.host !== undefined) data.host = patch.host || patch.ipAddress;
    if (patch.port !== undefined) data.port = patch.port;
    if (patch.protocol !== undefined) data.protocol = patch.protocol;
    if (patch.psk !== undefined)
      data.pskEnc = patch.psk ? encrypt(patch.psk) : null;
    if (patch.adminUrl !== undefined) data.adminUrl = patch.adminUrl;
    if (patch.adminUsername !== undefined)
      data.adminUsername = patch.adminUsername;
    if (patch.adminPassword) data.adminPasswordEnc = encrypt(patch.adminPassword);
    if (patch.brand !== undefined) data.brand = patch.brand;
    if (patch.model !== undefined) data.model = patch.model;
    if (patch.region !== undefined) data.region = patch.region;
    if (patch.pcName !== undefined) data.pcName = patch.pcName;
    if (patch.memo !== undefined) data.memo = patch.memo;
    return this.prisma.vpnIp.update({
      where: { id },
      data,
      select: this.publicSelect,
    });
  }

  async remove(id: number) {
    const r = await this.prisma.vpnIp.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('공유기를 찾을 수 없습니다.');
    await this.prisma.vpnIp.delete({ where: { id } });
    return { ok: true };
  }

  /** PSK·관리자 비번·VPN 계정 복호화 (수동 설정/확인용, 관리자 전용) */
  async revealCredentials(id: number) {
    const r = await this.prisma.vpnIp.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('공유기를 찾을 수 없습니다.');
    const accounts = await this.prisma.vpnAccount.findMany({
      where: { vpnIpId: id },
      select: { id: true, username: true, passwordEnc: true, status: true },
      orderBy: { id: 'asc' },
    });
    return {
      id: r.id,
      ipAddress: r.ipAddress,
      host: r.host,
      port: r.port,
      protocol: r.protocol,
      psk: r.pskEnc ? decrypt(r.pskEnc) : null,
      adminUrl: r.adminUrl,
      adminUsername: r.adminUsername,
      adminPassword: r.adminPasswordEnc ? decrypt(r.adminPasswordEnc) : null,
      accounts: accounts.map(a => ({
        id: a.id,
        username: a.username,
        password: decrypt(a.passwordEnc),
        status: a.status,
      })),
    };
  }
}
