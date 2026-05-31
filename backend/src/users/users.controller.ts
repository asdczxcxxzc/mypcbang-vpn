import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

class CreateUserDto {
  @IsString() @MinLength(3) username: string;
  @IsString() @MinLength(4) password: string;
  @IsOptional() @IsIn(['user', 'admin']) role?: string;
}
class PasswordDto {
  @IsString() @MinLength(4) password: string;
}
class PaidDto {
  paid: boolean;
}
class GrantDto {
  @IsIn(['time', 'monthly']) planType: 'time' | 'monthly';
  @IsInt() @Min(1) amount: number; // time=분, monthly=일
}
class AddTimeDto {
  @IsInt() @Min(1) amount: number;
}
class StopsDto {
  @IsInt() @Min(0) stopsRemaining: number;
}
class StatusDto {
  @IsIn(['normal', 'blocked', 'suspended']) status: 'normal' | 'blocked' | 'suspended';
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto.username, dto.password, dto.role ?? 'user');
  }

  @Patch(':id/password')
  changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PasswordDto,
  ) {
    return this.users.changePassword(id, dto.password);
  }

  @Patch(':id/paid')
  setPaid(@Param('id', ParseIntPipe) id: number, @Body() dto: PaidDto) {
    return this.users.setPaid(id, !!dto.paid);
  }

  /** 이용권 부여/설정 */
  @Post(':id/grant')
  grant(@Param('id', ParseIntPipe) id: number, @Body() dto: GrantDto) {
    const plan =
      dto.planType === 'time'
        ? ({ type: 'time', minutes: dto.amount } as const)
        : ({ type: 'monthly', days: dto.amount } as const);
    return this.users.grantPlan(id, plan);
  }

  /** 시간/기간 추가 */
  @Post(':id/add-time')
  addTime(@Param('id', ParseIntPipe) id: number, @Body() dto: AddTimeDto) {
    return this.users.addTime(id, dto.amount);
  }

  /** 이용권 회수 */
  @Post(':id/revoke')
  revoke(@Param('id', ParseIntPipe) id: number) {
    return this.users.revokePlan(id);
  }

  /** 접속(정지) 잔여 횟수 수정 */
  @Patch(':id/stops')
  setStops(@Param('id', ParseIntPipe) id: number, @Body() dto: StopsDto) {
    return this.users.setStops(id, dto.stopsRemaining);
  }

  /** 계정 상태 설정 (정상/차단/정지) */
  @Patch(':id/status')
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: StatusDto) {
    return this.users.setStatus(id, dto.status);
  }

  /** 차단 해제 */
  @Post(':id/unblock')
  unblock(@Param('id', ParseIntPipe) id: number) {
    return this.users.unblock(id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() me: AuthUser,
  ) {
    return this.users.remove(id, me.userId);
  }
}
