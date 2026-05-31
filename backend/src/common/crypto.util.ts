import * as crypto from 'crypto';

/**
 * 공유기 L2TP 비밀번호 같은 민감정보를 AES-256-GCM 으로 암호화/복호화.
 *
 * 키는 환경변수 ENC_KEY (32바이트 hex = 64자) 에서 가져온다.
 * 없으면 개발용 기본키를 쓰되, 운영에서는 반드시 설정해야 한다.
 */
const RAW_KEY =
  process.env.ENC_KEY ??
  '0000000000000000000000000000000000000000000000000000000000000000';
const KEY = Buffer.from(RAW_KEY, 'hex');

if (KEY.length !== 32) {
  // 잘못된 키 길이면 시작 시점에 알 수 있도록 경고
  // (운영에서는 32바이트 hex 키를 ENC_KEY 로 넣어야 함)
  // eslint-disable-next-line no-console
  console.warn(
    '[crypto] ENC_KEY 가 32바이트(hex 64자)가 아닙니다. 운영 전 반드시 설정하세요.',
  );
}

/** 평문 → "iv:tag:cipher" (모두 hex) */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const key = KEY.length === 32 ? KEY : crypto.createHash('sha256').update(RAW_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** "iv:tag:cipher" → 평문 */
export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const key = KEY.length === 32 ? KEY : crypto.createHash('sha256').update(RAW_KEY).digest();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

/** 무작위 안전 문자열 (PSK/비밀번호 자동 생성용) */
export function randomSecret(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * 무작위 영숫자 문자열 — 헷갈리는 문자(0/O/1/l/I) 제외.
 * L2TP 계정 ID/비밀번호/PSK 자동 생성에 사용.
 */
export function randomAlnum(len = 12): string {
  const charset = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += charset[bytes[i] % charset.length];
  return out;
}

/** L2TP 계정 한 벌 자동 생성 */
export function generateL2tpCredentials() {
  return {
    username: 'vpn' + randomAlnum(6),
    password: randomAlnum(14),
    psk: randomAlnum(20),
  };
}
