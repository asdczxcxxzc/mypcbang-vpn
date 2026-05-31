import { useEffect, useState, useMemo, Fragment } from 'react';
import { api, Account, Router } from '../api';
import { fmtPlan } from '../format';

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [fRouter, setFRouter] = useState(0);
  const [fStatus, setFStatus] = useState('');
  const [err, setErr] = useState('');
  const [reveal, setReveal] = useState<any | null>(null);
  const [newRouter, setNewRouter] = useState(0);
  const [count, setCount] = useState(5);
  const [openIps, setOpenIps] = useState<Record<string, boolean>>({});
  const toggleIp = (ip: string) => setOpenIps((o) => ({ ...o, [ip]: !o[ip] }));

  // IP(공유기)별로 묶기
  const groups = useMemo(() => {
    const m = new Map<string, Account[]>();
    for (const a of accounts) {
      const ip = a.vpnIp.ipAddress;
      if (!m.has(ip)) m.set(ip, []);
      m.get(ip)!.push(a);
    }
    return Array.from(m.entries());
  }, [accounts]);

  async function load() {
    const [a, r] = await Promise.all([
      api.accounts({ vpnIpId: fRouter || undefined, status: fStatus || undefined }),
      api.ips(),
    ]);
    setAccounts(a); setRouters(r);
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fRouter, fStatus]);

  async function addAccounts(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    if (!newRouter) return setErr('공유기를 선택하세요.');
    try { await api.batchAccounts(newRouter, Number(count)); load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function del(a: Account) {
    if (!confirm(`계정 ${a.username} 삭제?`)) return;
    await api.deleteAccount(a.id); load();
  }
  async function showCreds(id: number) { setReveal(await api.accountReveal(id)); }

  const inUse = accounts.filter((a) => a.status === 'assigned').length;
  const free = accounts.filter((a) => a.status === 'available').length;

  return (
    <div>
      <div className="page-title">VPN 계정 (슬롯 풀)</div>
      <div className="page-sub">
        공유기 등록 시 5개 자동 생성. 유저가 게임을 고르면 <b>빈 슬롯이 자동 할당</b>됩니다(수동 배정 없음).
      </div>

      <div className="card">
        <h3>계정 추가 생성</h3>
        <form className="row" onSubmit={addAccounts}>
          <div className="field" style={{ maxWidth: 300 }}>
            <label>공유기</label>
            <select value={newRouter} onChange={(e) => setNewRouter(Number(e.target.value))}>
              <option value={0}>공유기 선택</option>
              {routers.map((r) => <option key={r.id} value={r.id}>{r.ipAddress} ({r.region ?? '-'}) · 계정 {r.totalAccounts}</option>)}
            </select>
          </div>
          <div className="field" style={{ maxWidth: 100 }}><label>개수</label>
            <input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} /></div>
          <button className="btn-primary">추가 (ID·비번 자동)</button>
        </form>
        {err && <div className="error-msg">{err}</div>}
      </div>

      <div className="card">
        <div className="topbar">
          <h3 style={{ margin: 0 }}>계정 풀 ({accounts.length}) · 사용 중 {inUse} / 대기 {free}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ width: 160 }} value={fRouter} onChange={(e) => setFRouter(Number(e.target.value))}>
              <option value={0}>전체 공유기</option>
              {routers.map((r) => <option key={r.id} value={r.id}>{r.ipAddress}</option>)}
            </select>
            <select style={{ width: 120 }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">전체 상태</option>
              <option value="available">대기</option>
              <option value="assigned">사용 중</option>
            </select>
          </div>
        </div>
        <table>
          <thead><tr>
            <th>계정 ID</th><th>IP</th><th>상태</th><th>현재 사용자</th><th>현재 게임</th><th>이용권</th><th></th>
          </tr></thead>
          <tbody>
            {groups.map(([ip, accs]) => {
              const used = accs.filter((a) => a.status === 'assigned').length;
              const open = openIps[ip] ?? false;
              const users = accs.filter((a) => a.status === 'assigned' && a.user).map((a) => a.user!.username);
              return (
                <Fragment key={ip}>
                  {/* 공유기(IP) 그룹 헤더 — 클릭 시 펼침/접힘 */}
                  <tr onClick={() => toggleIp(ip)} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.04)' }}>
                    <td colSpan={7} style={{ fontWeight: 600 }}>
                      <span style={{ display: 'inline-block', width: 16, color: 'var(--accent, #4f8cff)' }}>{open ? '▾' : '▸'}</span>
                      <span className="mono" style={{ fontSize: 15 }}>{ip}</span>
                      <span className="pill assigned" style={{ marginLeft: 12 }}>사용 중 {used}</span>
                      <span className="pill available" style={{ marginLeft: 6 }}>대기 {accs.length - used}</span>
                      {used > 0 && <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>· 현재 이용: {users.join(', ')}</span>}
                    </td>
                  </tr>
                  {/* 펼치면 해당 IP의 계정 목록 */}
                  {open && accs.map((a) => (
                    <tr key={a.id}>
                      <td className="mono" style={{ paddingLeft: 28 }}>{a.username}</td>
                      <td className="muted" style={{ fontSize: 12 }}>↳ {ip}</td>
                      <td>{a.status === 'assigned'
                        ? <span className="pill assigned">사용 중</span>
                        : <span className="pill available">대기</span>}</td>
                      <td>{a.user ? <>{a.user.username}{a.user.connected ? ' ●' : ''}{a.user.blocked ? ' ⛔' : ''}</> : <span className="muted">-</span>}</td>
                      <td>{a.currentGame ? <span className="pill assigned">{a.currentGame.name}</span> : <span className="muted">-</span>}</td>
                      <td className="muted">{a.user ? fmtPlan(a.user.planType, a.user.remainingSeconds, a.user.expiresAt) : '-'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn-ghost" style={{ marginRight: 4 }} onClick={() => showCreds(a.id)}>설정</button>
                        <button className="btn-danger" onClick={() => del(a)}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {accounts.length === 0 && <tr><td colSpan={7} className="empty">계정이 없습니다.</td></tr>}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>※ 시간/이용권은 <b>사용자 관리</b>에서 부여. 같은 IP에서 같은 게임은 동시 1명만.</p>
      </div>

      {reveal && (
        <div onClick={() => setReveal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 420, margin: 0 }}>
            <h3>계정 설정 정보 — {reveal.username}</h3>
            <p className="muted" style={{ marginBottom: 14 }}>이 값을 공유기 L2TP 서버에 등록하세요. (유저에겐 노출 안 됨)</p>
            <Cred k="현재 게임" v={reveal.currentGame ?? '(미선택)'} />
            <Cred k="IP/호스트" v={`${reveal.ipAddress} / ${reveal.host}`} />
            <Cred k="포트/프로토콜" v={`${reveal.port} / ${reveal.protocol}`} />
            <Cred k="로그인 ID" v={reveal.username} /><Cred k="비밀번호" v={reveal.password} />
            <Cred k="PSK" v={reveal.psk ?? '-'} />
            <button className="btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => setReveal(null)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Cred({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted">{k}</span><span className="mono" style={{ userSelect: 'all' }}>{v}</span>
    </div>
  );
}
