import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/** 컨트롤러/핸들러에 @Roles('admin') 으로 필요한 권한을 지정 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * @Roles() 로 지정된 권한을 req.user.role 과 비교.
 * JwtAuthGuard 다음에 동작해야 한다.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const role = req.user?.role;
    if (!required.includes(role)) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }
    return true;
  }
}
