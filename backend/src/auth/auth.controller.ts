import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 회원가입 (공개) */
  @Post('register')
  register(@Body() dto: LoginDto) {
    return this.auth.register(dto.username, dto.password);
  }

  /** 로그인 → 토큰 발급 (관리자/사용자 공통) */
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  /** 현재 로그인한 사용자 정보 확인 (토큰 유효성 체크용) */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
