import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { DetectionService } from './detection.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

class ReportDto {
  @IsString()
  detectedGame: string; // 클라이언트가 감지한 실행 게임 이름 (없으면 "unknown")
}

@Controller('detection')
@UseGuards(JwtAuthGuard)
export class DetectionController {
  constructor(private readonly detection: DetectionService) {}

  /** 클라이언트 → 실행 게임 보고 (사용자) */
  @Post('report')
  report(@CurrentUser() user: AuthUser, @Body() dto: ReportDto) {
    return this.detection.report(user.userId, dto.detectedGame);
  }

  /** 불일치 목록 (관리자) */
  @Get('mismatches')
  @UseGuards(RolesGuard)
  @Roles('admin')
  mismatches() {
    return this.detection.mismatches();
  }

  /** 불일치 개수 배지 (관리자) */
  @Get('mismatches/count')
  @UseGuards(RolesGuard)
  @Roles('admin')
  count() {
    return this.detection.mismatchCount();
  }
}
