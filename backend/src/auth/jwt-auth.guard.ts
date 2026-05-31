import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 요청 헤더의 Bearer 토큰을 검증하고,
 * 통과하면 req.user 에 { userId, username, role, sid } 을 채운다.
 * 단일 세션: 일반 사용자는 토큰의 sid 가 DB의 최신 sessionId 와 일치해야 함
 * (다른 PC에서 로그인하면 기존 토큰 무효 → 강제 로그아웃).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }
    const token = auth.slice('Bearer '.length);
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    // 단일 세션 검증 (일반 사용자만 — 관리자는 다기기 허용)
    if (payload.role === 'user') {
      const u = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { sessionId: true },
      });
      if (u?.sessionId && payload.sid && u.sessionId !== payload.sid) {
        throw new UnauthorizedException({
          code: 'SESSION_REPLACED',
          message: '다른 기기에서 로그인되어 연결이 종료되었습니다.',
        });
      }
    }

    (req as any).user = {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      sid: payload.sid,
    };
    return true;
  }
}
