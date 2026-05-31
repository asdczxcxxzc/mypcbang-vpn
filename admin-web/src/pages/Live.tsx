import { useEffect, useState } from 'react';
import { api, ConnRow } from '../api';
import { fmtPlan, ago } from '../format';

export default function Live() {
  const [rows, setRows] = useState<ConnRow[]>([]);
  async function load() { setRows(await api.accountStatus()); }
  useEffect(() => { load(); const id = setInterval(load, 3000); return () => clearInterval(id); }, []);

  return (
    <div>
      <div className="page-title">실시간 현황</div>
      <div className="page-sub">현재 VPN 접속 중인 계정 · 3초마다 자동 갱신</div>
      <div className="card">
        <h3>접속 중 ({rows.length}명)</h3>
        <table>
          <thead><tr>
            <th>사용자</th><th>게임</th><th>IP</th><th>지역</th><th>이용권</th><th>정지</th><th>마지막 하트비트</th><th>상태</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.accountId}>
                <td>{r.user}</td><td>{r.game}</td><td className="mono">{r.ipAddress}</td><td>{r.region ?? '-'}</td>
                <td className="muted">{fmtPlan(r.planType, r.remainingSeconds, r.expiresAt)}</td>
                <td className="muted">{r.planType === 'time' ? `${r.stopsUsed}회${r.timePenalty ? '(P)' : ''}` : '-'}</td>
                <td className="muted">{ago(r.lastHeartbeat)}</td>
                <td>{r.blocked ? <span className="pill warn">차단</span> : <span className={`pill ${r.online ? 'assigned' : 'warn'}`}>{r.online ? '연결됨' : '응답없음'}</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="empty">현재 접속 중인 사용자가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
