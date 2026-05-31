import { useEffect, useState } from 'react';
import { api, Game, Router, Account, ConnRow, DailyStat } from '../api';
import { fmtPlan } from '../format';
import BarChart from '../components/BarChart';

export default function Dashboard() {
  const [games, setGames] = useState<Game[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [live, setLive] = useState<ConnRow[]>([]);
  const [stats, setStats] = useState<DailyStat[]>([]);

  async function load() {
    const [g, r, a, l, s] = await Promise.all([
      api.games(), api.ips(), api.accounts(), api.accountStatus(), api.sessionStats(),
    ]);
    setGames(g); setRouters(r); setAccounts(a); setLive(l); setStats(s);
  }
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, []);

  const onlineRouters = routers.filter((r) => r.online).length;
  const assigned = accounts.filter((a) => a.status === 'assigned').length;
  const available = accounts.filter((a) => a.status === 'available').length;
  const blocked = accounts.filter((a) => a.user?.blocked).length;

  return (
    <div>
      <div className="page-title">대시보드</div>
      <div className="page-sub">전체 시스템 한눈에 보기 · 5초마다 자동 갱신</div>

      <div className="stat-grid">
        <Stat num={routers.length} lbl="공유기" sub={`온라인 ${onlineRouters}`} />
        <Stat num={accounts.length} lbl="전체 계정" />
        <Stat num={available} lbl="미부여 계정" color="var(--green)" />
        <Stat num={assigned} lbl="부여됨" color="var(--brand)" />
        <Stat num={live.length} lbl="현재 접속" color="var(--brand)" />
        <Stat num={blocked} lbl="차단 계정" color="var(--red)" />
      </div>

      <div className="card">
        <h3>최근 14일 사용량 추이</h3>
        <BarChart data={stats.map((s) => ({ label: s.date.slice(5), value: s.count }))} />
      </div>

      <div className="card">
        <h3>게임별 현재 동시 사용</h3>
        <table>
          <thead><tr><th>게임</th><th>현재 사용 중</th></tr></thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>{g.inUse > 0 ? <span className="pill assigned">{g.inUse}명</span> : <span className="muted">0</span>}</td>
              </tr>
            ))}
            {games.length === 0 && <tr><td colSpan={2} className="empty">등록된 게임이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>현재 접속 중 ({live.length}명)</h3>
        <table>
          <thead><tr><th>사용자</th><th>게임</th><th>IP</th><th>이용권</th><th>상태</th></tr></thead>
          <tbody>
            {live.map((l) => (
              <tr key={l.accountId}>
                <td>{l.user}</td><td>{l.game}</td><td className="mono">{l.ipAddress}</td>
                <td className="muted">{fmtPlan(l.planType, l.remainingSeconds, l.expiresAt)}</td>
                <td><span className={`pill ${l.online ? 'assigned' : 'warn'}`}>{l.online ? '연결됨' : '응답없음'}</span></td>
              </tr>
            ))}
            {live.length === 0 && <tr><td colSpan={5} className="empty">현재 접속 중인 사용자가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ num, lbl, color, sub }: { num: number; lbl: string; color?: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="num" style={{ color: color ?? 'var(--text)' }}>{num}</div>
      <div className="lbl">{lbl}{sub ? ` · ${sub}` : ''}</div>
    </div>
  );
}
