// 시간제(분당) 요금제 정지/어뷰징 정책 (env로 조정 가능)

/** 정지(끄기) 허용 횟수 — 초과 시 정지해도 시간이 계속 흐름 */
export const STOP_LIMIT = Number(process.env.STOP_LIMIT ?? 5);

/** 반복 어뷰징: 윈도우(기본 5분) 내 정지 횟수가 이 값 이상이면 차단 */
export const ABUSE_STOPS = Number(process.env.ABUSE_STOPS ?? 5);
export const ABUSE_WINDOW_MS = Number(process.env.ABUSE_WINDOW_MS ?? 5 * 60_000);
