import { useEffect, useState } from 'react';
import { api } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Games from './pages/Games';
import Routers from './pages/Routers';
import Accounts from './pages/Accounts';
import Users from './pages/Users';
import Live from './pages/Live';
import Sessions from './pages/Sessions';
import Alerts from './pages/Alerts';
import Detections from './pages/Detections';
import Settings from './pages/Settings';
import { ICONS } from './components/Icons';

type Tab =
  | 'dashboard' | 'games' | 'routers' | 'accounts' | 'users'
  | 'live' | 'sessions' | 'alerts' | 'detections' | 'settings';

const NAV: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'games', label: '게임 관리' },
  { key: 'routers', label: '공유기(IP) 관리' },
  { key: 'accounts', label: 'VPN 계정' },
  { key: 'users', label: '사용자 관리' },
  { key: 'live', label: '실시간 현황' },
  { key: 'sessions', label: '세션 기록' },
  { key: 'alerts', label: '시스템 알림' },
  { key: 'detections', label: '불일치 감지' },
  { key: 'settings', label: '설정' },
];
const TAB_KEYS = NAV.map((n) => n.key);

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('token'));
  const initial = (location.hash.replace('#', '') as Tab) || 'dashboard';
  const [tab, setTabState] = useState<Tab>(TAB_KEYS.includes(initial) ? initial : 'dashboard');
  const setTab = (t: Tab) => { setTabState(t); location.hash = t; };
  const [alertCount, setAlertCount] = useState(0);
  const [mismatchCount, setMismatchCount] = useState(0);

  useEffect(() => {
    if (!authed) return;
    let stop = false;
    const tick = async () => {
      try {
        const [a, m] = await Promise.all([api.alertCount(), api.mismatchCount()]);
        if (!stop) { setAlertCount(a.count); setMismatchCount(m.count); }
      } catch { /* 무시 */ }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { stop = true; clearInterval(id); };
  }, [authed, tab]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  function logout() {
    localStorage.removeItem('token');
    setAuthed(false);
  }
  const badge = (key: Tab) =>
    key === 'alerts' ? alertCount : key === 'detections' ? mismatchCount : 0;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo" style={{ marginBottom: 24, paddingLeft: 6 }}>
          <span className="dot" /> VPN Console
        </div>
        {NAV.map((n) => {
          const Icon = ICONS[n.key];
          return (
            <button
              key={n.key}
              className={`nav-item ${tab === n.key ? 'active' : ''}`}
              onClick={() => setTab(n.key)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Icon size={18} />
                {n.label}
              </span>
              {badge(n.key) > 0 && <span className="badge">{badge(n.key)}</span>}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <div className="muted" style={{ padding: '0 8px 10px' }}>
          {localStorage.getItem('username')} (관리자)
        </div>
        <button className="btn-ghost" onClick={logout}>로그아웃</button>
      </aside>

      <main className="main">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'games' && <Games />}
        {tab === 'routers' && <Routers />}
        {tab === 'accounts' && <Accounts />}
        {tab === 'users' && <Users />}
        {tab === 'live' && <Live />}
        {tab === 'sessions' && <Sessions />}
        {tab === 'alerts' && <Alerts />}
        {tab === 'detections' && <Detections />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}
