// 이용권/시간 포맷 헬퍼
export function fmtDuration(sec: number | null): string {
  if (sec === null || sec === undefined) return '-';
  if (sec <= 0) return '0초';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

export function fmtPlan(
  planType: string | null,
  remainingSeconds: number | null,
  expiresAt: string | null,
): string {
  if (!planType) return '-';
  if (planType === 'time') return `시간제 · 남은 ${fmtDuration(remainingSeconds)}`;
  if (planType === 'monthly') {
    if (!expiresAt) return '월정액';
    const d = new Date(expiresAt);
    return `월정액 · ~${d.toLocaleDateString('ko-KR')}`;
  }
  return planType;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR');
}

export function ago(iso: string | null): string {
  if (!iso) return '-';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  return `${Math.round(s / 3600)}시간 전`;
}
