import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** 최근 세션 기록 */
  @Get()
  list() {
    return this.sessions.list();
  }

  /** 일별 통계 (그래프) */
  @Get('stats')
  stats() {
    return this.sessions.dailyStats();
  }
}
