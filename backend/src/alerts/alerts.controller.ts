import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  /** 알림 목록 */
  @Get()
  list() {
    return this.alerts.list();
  }

  /** 안 읽은 개수 (배지) */
  @Get('count')
  count() {
    return this.alerts.unreadCount();
  }

  /** 모두 읽음 */
  @Post('read-all')
  readAll() {
    return this.alerts.markAllRead();
  }
}
