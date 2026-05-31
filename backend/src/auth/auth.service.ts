import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** 로그인 실패 잠금 정책 */
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS ?? 5);
const LOCK_MS = Number(process.env.LOGIN_LOCK_MS ?? 10 * 60_000); // 10분

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** 아이디별 로그인 실패 추적(메모리). 5회 실패 → 10분 잠금. */
  private failures = new Map<string, { count: number; lockedUntil: number }>();

  /** 회원가입 (사용자 셀프 등록) — 가입 후 관리자가 결제확인+계정부여 */
  async register(username: string, password: string) {
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new ConflictException('이미 사용 중인 아이디입니다.');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { username, passwordHash, role: 'user' },
    });
    return { id: user.id, username: user.username };
  }

  /** 아이디/비번 검증 후 JWT 발급 (실패 잠금 + 단일 세션 적용) */
  async login(username: string, password: string) {
    const now = Date.now();

    // 1) 잠금 확인
    const f = this.failures.get(username);
    if (f && f.lockedUntil > now) {
      const mins = Math.ceil((f.lockedUntil - now) / 60000);
      throw new UnauthorizedException({
        code: 'LOCKED',
        message: `비밀번호 ${MAX_FAILS}회 오류로 잠겼습니다. ${mins}분 후 다시 시도하세요.`,
      });
    }

    // 2) 자격 검증
    const user = await this.prisma.user.findUnique({ where: { username } });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) {
      let cur = f ?? { count: 0, lockedUntil: 0 };
      // 만료된 잠금(lockedUntil>0 이고 지났음)이면 카운터 리셋
      if (cur.lockedUntil && cur.lockedUntil <= now) cur = { count: 0, lockedUntil: 0 };
      cur.count += 1;
      if (cur.count >= MAX_FAILS) {
        cur.lockedUntil = now + LOCK_MS;
        cur.count = 0;
        this.failures.set(username, cur);
        throw new UnauthorizedException({
          code: 'LOCKED',
          message: `비밀번호 ${MAX_FAILS}회 오류로 잠겼습니다. ${Math.ceil(LOCK_MS / 60000)}분 후 다시 시도하세요.`,
        });
      }
      this.failures.set(username, cur);
      throw new UnauthorizedException(
        `아이디 또는 비밀번호가 올바르지 않습니다. (남은 시도 ${MAX_FAILS - cur.count}회)`,
      );
    }

    // 3) 성공 — 실패기록 초기화 + 새 세션 발급(기존 기기 무효화)
    this.failures.delete(username);
    const sid = randomBytes(16).toString('hex');
    await this.prisma.user.update({ where: { id: user.id }, data: { sessionId: sid } });

    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
      sid,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        blocked: user.blocked,
        suspended: user.suspended,
      },
    };
  }
}
