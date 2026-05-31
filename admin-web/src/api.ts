// 백엔드 v2 API 호출 헬퍼. (vite 프록시 /api → localhost:3000)
const BASE = '/api';

function token() {
  return localStorage.getItem('token') ?? '';
}

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message ?? '요청 실패');
  return data;
}

export const api = {
  // 인증
  login: (username: string, password: string) =>
    req('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username: string, password: string) =>
    req('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),

  // 게임
  games: (): Promise<Game[]> => req('/games'),
  createGame: (name: string, image?: string) => req('/games', { method: 'POST', body: JSON.stringify({ name, image }) }),
  setGameImage: (id: number, image: string) => req(`/games/${id}/image`, { method: 'PATCH', body: JSON.stringify({ image }) }),
  deleteGame: (id: number) => req(`/games/${id}`, { method: 'DELETE' }),

  // 공유기(IP)
  ips: (): Promise<Router[]> => req('/ips'),
  createIp: (r: NewRouter) => req('/ips', { method: 'POST', body: JSON.stringify(r) }),
  updateIp: (id: number, patch: Partial<NewRouter>) =>
    req(`/ips/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteIp: (id: number) => req(`/ips/${id}`, { method: 'DELETE' }),
  ipCredentials: (id: number) => req(`/ips/${id}/credentials`),

  // VPN 계정
  accounts: (q: { vpnIpId?: number; status?: string } = {}): Promise<Account[]> => {
    const p = new URLSearchParams();
    if (q.vpnIpId) p.set('vpnIpId', String(q.vpnIpId));
    if (q.status) p.set('status', q.status);
    const s = p.toString();
    return req(`/accounts${s ? `?${s}` : ''}`);
  },
  createAccount: (vpnIpId: number, username?: string, password?: string) =>
    req('/accounts', { method: 'POST', body: JSON.stringify({ vpnIpId, username, password }) }),
  batchAccounts: (vpnIpId: number, count: number) =>
    req('/accounts/batch', { method: 'POST', body: JSON.stringify({ vpnIpId, count }) }),
  genCredentials: (): Promise<{ username: string; password: string; psk: string }> =>
    req('/accounts/gen-credentials'),
  accountStatus: (): Promise<ConnRow[]> => req('/accounts/status'),
  accountReveal: (id: number) => req(`/accounts/${id}/credentials`),
  updateAccount: (id: number, patch: { gameId?: number; username?: string; password?: string }) =>
    req(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteAccount: (id: number) => req(`/accounts/${id}`, { method: 'DELETE' }),

  // 사용자
  users: (): Promise<AdminUser[]> => req('/users'),
  createUser: (username: string, password: string, role: string) =>
    req('/users', { method: 'POST', body: JSON.stringify({ username, password, role }) }),
  changeUserPassword: (id: number, password: string) =>
    req(`/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }),
  setPaid: (id: number, paid: boolean) =>
    req(`/users/${id}/paid`, { method: 'PATCH', body: JSON.stringify({ paid }) }),
  deleteUser: (id: number) => req(`/users/${id}`, { method: 'DELETE' }),
  // 이용권(사용자 단위)
  grantPlan: (id: number, planType: 'time' | 'monthly', amount: number) =>
    req(`/users/${id}/grant`, { method: 'POST', body: JSON.stringify({ planType, amount }) }),
  addUserTime: (id: number, amount: number) =>
    req(`/users/${id}/add-time`, { method: 'POST', body: JSON.stringify({ amount }) }),
  revokeUser: (id: number) => req(`/users/${id}/revoke`, { method: 'POST' }),
  unblockUser: (id: number) => req(`/users/${id}/unblock`, { method: 'POST' }),
  setStops: (id: number, stopsRemaining: number) =>
    req(`/users/${id}/stops`, { method: 'PATCH', body: JSON.stringify({ stopsRemaining }) }),
  setStatus: (id: number, status: 'normal' | 'blocked' | 'suspended') =>
    req(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // 세션 / 알림 / 감지
  sessions: (): Promise<SessionRow[]> => req('/sessions'),
  sessionStats: (): Promise<DailyStat[]> => req('/sessions/stats'),
  alerts: (): Promise<Alert[]> => req('/alerts'),
  alertCount: (): Promise<{ count: number }> => req('/alerts/count'),
  markAlertsRead: () => req('/alerts/read-all', { method: 'POST' }),
  mismatches: (): Promise<Mismatch[]> => req('/detection/mismatches'),
  mismatchCount: (): Promise<{ count: number }> => req('/detection/mismatches/count'),
};

export type Game = { id: number; name: string; image: string | null; inUse: number };
export type NewRouter = {
  ipAddress: string; host?: string; port: number; protocol?: string; psk?: string;
  adminUrl?: string; adminUsername?: string; adminPassword?: string;
  brand?: string; model?: string; region?: string;
  memo?: string;
};
export type Router = {
  id: number; ipAddress: string; host: string; port: number; protocol: string;
  adminUrl: string | null; adminUsername: string | null;
  brand: string | null; model: string | null; region: string | null;
  memo: string | null;
  online: boolean; lastCheckedAt: string | null;
  totalAccounts: number; availableAccounts: number;
};
export type Account = {
  id: number; vpnIpId: number; username: string;
  status: string; assignedTo: number | null; assignedAt: string | null;
  currentGameId: number | null;
  currentGame: { name: string } | null;
  vpnIp: { ipAddress: string; region: string | null; online: boolean };
  user: null | {
    username: string; connected: boolean; blocked: boolean;
    planType: string | null; remainingSeconds: number | null; expiresAt: string | null;
  };
};
export type ConnRow = {
  accountId: number; user: string; userId: number; game: string;
  ipAddress: string; region: string | null; online: boolean;
  planType: string | null; remainingSeconds: number | null; expiresAt: string | null;
  assignedAt: string; lastHeartbeat: string; stopsUsed: number; timePenalty: boolean; blocked: boolean;
};
export type AdminUser = {
  id: number; username: string; role: string; paid: boolean; createdAt: string;
  online: boolean; totalSessions: number;
  planType: string | null; remainingSeconds: number | null; expiresAt: string | null;
  stopsUsed: number; stopsRemaining: number; timePenalty: boolean;
  blocked: boolean; suspended: boolean; status: 'normal' | 'blocked' | 'suspended';
  account: null | { id: number; game: string; ipAddress: string };
};
export type SessionRow = {
  id: number; user: string; game: string; ipAddress: string; region: string | null;
  startedAt: string; endedAt: string | null; durationSec: number | null;
};
export type DailyStat = { date: string; count: number };
export type Alert = { id: number; type: string; username: string; message: string; read: boolean; createdAt: string };
export type Mismatch = { id: number; assignedGame: string; detectedGame: string; createdAt: string; user: { username: string } };
