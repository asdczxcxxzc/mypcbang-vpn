import { Injectable, Logger } from '@nestjs/common';
import { decrypt } from '../common/crypto.util';

export interface RouterInfo {
  ipAddress: string;
  brand: string | null;
  adminUrl: string | null;
  adminUsername: string | null;
  adminPasswordEnc: string | null;
}

/**
 * 공유기 관리자 페이지에 접속해 특정 VPN(L2TP) 세션을 강제 해제한다.
 *
 * ⚠️ 공유기 브랜드/모델/펌웨어마다 관리자 인터페이스가 달라 어댑터가 필요하며,
 *    실제 기기 없이는 검증이 불가능하다. 여기서는 골격 + iptime 자리만 제공하고,
 *    실패해도(미구현/접속불가) 상위 로직은 계속 진행한다(하트비트/텔레그램으로 보완).
 */
@Injectable()
export class RouterControlService {
  private readonly logger = new Logger(RouterControlService.name);

  /** 브랜드에 맞는 어댑터로 세션 해제 시도. 성공 여부 반환(실패해도 throw 안 함). */
  async disconnectSession(
    router: RouterInfo,
    vpnUsername: string,
  ): Promise<boolean> {
    if (!router.adminUrl || !router.adminUsername || !router.adminPasswordEnc) {
      this.logger.warn(
        `[${router.ipAddress}] 공유기 관리자 접속정보 미등록 → 강제해제 생략`,
      );
      return false;
    }
    const adminPassword = decrypt(router.adminPasswordEnc);
    const ctx = {
      url: router.adminUrl,
      username: router.adminUsername,
      password: adminPassword,
      vpnUsername,
      ip: router.ipAddress,
    };
    try {
      switch ((router.brand ?? '').toLowerCase()) {
        case 'iptime':
          return await this.iptime(ctx);
        case 'dlink':
          return await this.dlink(ctx);
        case 'tplink':
          return await this.tplink(ctx);
        default:
          this.logger.warn(`[${router.ipAddress}] 미지원 브랜드(${router.brand})`);
          return false;
      }
    } catch (e) {
      this.logger.error(`[${router.ipAddress}] 강제해제 오류`, e as any);
      return false;
    }
  }

  // ----- 브랜드별 어댑터 (실기기 테스트 필요) -----

  private async iptime(ctx: Ctx): Promise<boolean> {
    // TODO(실기기): iptime 관리자 로그인 → VPN 서버 → 접속자 목록 → 해당 계정 끊기.
    //  iptime 펌웨어는 보통 sess_id 쿠키 로그인 후 cgi 호출 구조.
    //  실제 모델/펌웨어 확인 후 요청 시퀀스를 채워야 한다.
    this.logger.warn(
      `[iptime ${ctx.ip}] 강제해제 미구현(실기기 시퀀스 필요) — 계정 ${ctx.vpnUsername}`,
    );
    return false;
  }

  private async dlink(ctx: Ctx): Promise<boolean> {
    this.logger.warn(`[dlink ${ctx.ip}] 강제해제 미구현 — 계정 ${ctx.vpnUsername}`);
    return false;
  }

  private async tplink(ctx: Ctx): Promise<boolean> {
    this.logger.warn(`[tplink ${ctx.ip}] 강제해제 미구현 — 계정 ${ctx.vpnUsername}`);
    return false;
  }
}

interface Ctx {
  url: string;
  username: string;
  password: string;
  vpnUsername: string;
  ip: string;
}
