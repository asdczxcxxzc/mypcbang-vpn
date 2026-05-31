import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: number;
  username: string;
  role: string;
}

/** 핸들러에서 @CurrentUser() user: AuthUser 로 로그인 사용자 정보를 받는다 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
