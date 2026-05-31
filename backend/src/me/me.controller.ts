import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsInt } from 'class-validator';
import { MeService } from './me.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

class ConnectDto {
  @IsInt() gameId: number;
}

/** 클라이언트(사용자) 전용 — 로그인만 되어 있으면 사용 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('status')
  status(@CurrentUser() u: AuthUser) {
    return this.me.status(u.userId);
  }

  /** 내 IP에서 선택 가능한 게임 목록 */
  @Get('games')
  games(@CurrentUser() u: AuthUser) {
    return this.me.availableGames(u.userId);
  }

  /** 내 사용량 (그래프) */
  @Get('usage')
  usage(@CurrentUser() u: AuthUser) {
    return this.me.usage(u.userId);
  }

  @Post('connect')
  connect(@CurrentUser() u: AuthUser, @Body() dto: ConnectDto) {
    return this.me.connect(u.userId, dto.gameId);
  }

  @Post('heartbeat')
  heartbeat(@CurrentUser() u: AuthUser) {
    return this.me.heartbeat(u.userId);
  }

  @Post('disconnect')
  disconnect(@CurrentUser() u: AuthUser) {
    return this.me.disconnect(u.userId);
  }
}
