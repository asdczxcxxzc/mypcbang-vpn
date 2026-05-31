import { Injectable, Logger } from '@nestjs/common';

/**
 * 텔레그램 봇 알림.
 * 환경변수 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 가 있어야 실제 전송.
 * 없으면 로그만 남기고 무시(개발 편의).
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token = process.env.TELEGRAM_BOT_TOKEN;
  private readonly chatId = process.env.TELEGRAM_CHAT_ID;

  get enabled() {
    return !!(this.token && this.chatId);
  }

  /** 메시지 전송 (실패해도 throw 하지 않음) */
  async send(text: string) {
    if (!this.enabled) {
      this.logger.warn(`[텔레그램 미설정] 전송 생략: ${text}`);
      return;
    }
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text,
            parse_mode: 'HTML',
          }),
        },
      );
      if (!res.ok) {
        this.logger.error(`텔레그램 전송 실패: ${res.status}`);
      }
    } catch (e) {
      this.logger.error('텔레그램 전송 오류', e as any);
    }
  }

  /** 연결 해제/만료 알림 (IP·VPN ID·비번 포함 — 운영 수동확인용) */
  async notifyDisconnect(params: {
    reason: string; // "하트비트 끊김" | "이용시간 만료" 등
    username: string;
    game: string;
    ipAddress: string;
    vpnUsername: string;
    vpnPassword: string;
  }) {
    const msg =
      `⚠️ <b>VPN 연결 해제</b> (${params.reason})\n` +
      `유저: <code>${params.username}</code>\n` +
      `게임: ${params.game}\n` +
      `IP: <code>${params.ipAddress}</code>\n` +
      `VPN ID: <code>${params.vpnUsername}</code>\n` +
      `VPN 비번: <code>${params.vpnPassword}</code>`;
    await this.send(msg);
  }
}
