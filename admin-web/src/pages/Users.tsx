import { useEffect, useState } from 'react';
import { api, AdminUser } from '../api';
import { fmtPlan } from '../format';

export default function Users() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [err, setErr] = useState('');
  const [grantFor, setGrantFor] = useState<AdminUser | null>(null);

  async function load() { setUsers(await api.users()); }
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await api.createUser(username.trim(), password, role); setUsername(''); setPassword(''); setRole('user'); load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function togglePaid(u: AdminUser) { await api.setPaid(u.id, !u.paid); load(); }
  async function addTime(u: AdminUser) {
    const unit = u.planType === 'monthly' ? '일' : '분';
    const v = prompt(`추가할 ${unit}`, u.planType === 'monthly' ? '30' : '60'); if (!v) return;
    await api.addUserTime(u.id, Number(v)); load();
  }
  async function revoke(u: AdminUser) {
    if (!confirm(`${u.username} 의 이용권을 회수할까요? (연결도 종료)`)) return;
    await api.revokeUser(u.id); load();
  }
  async function setStatus(u: AdminUser, status: 'normal' | 'blocked' | 'suspended') {
    if (status === u.status) return;
    if ((status === 'blocked' || status === 'suspended') && u.online &&
      !confirm(`'${u.username}' 을(를) ${status === 'blocked' ? '차단' : '정지'}하면 현재 연결이 즉시 종료됩니다. 진행할까요?`)) return;
    try { await api.setStatus(u.id, status); load(); } catch (e: any) { alert(e.message); }
  }
  async function editStops(u: AdminUser) {
    const v = prompt(`'${u.username}' 접속 잔여 횟수 설정 (현재 ${u.stopsRemaining}회)\n남길 횟수를 입력하세요. 0보다 크면 시간 페널티도 해제됩니다.`, String(u.stopsRemaining));
    if (v === null) return;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) { alert('0 이상의 정수를 입력하세요.'); return; }
    try { await api.setStops(u.id, n); load(); } catch (e: any) { alert(e.message); }
  }
  async function changePw(u: AdminUser) {
    const pw = prompt(`'${u.username}' 새 비밀번호 (4자+)`); if (!pw) return;
    try { await api.changeUserPassword(u.id, pw); alert('변경되었습니다.'); } catch (e: any) { alert(e.message); }
  }
  async function del(u: AdminUser) {
    if (!confirm(`'${u.username}' 삭제?`)) return;
    try { await api.deleteUser(u.id); load(); } catch (e: any) { alert(e.message); }
  }
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR');

  return (
    <div>
      <div className="page-title">사용자 계정 관리</div>
      <div className="page-sub">시간/이용권은 <b>사용자 단위</b>로 관리됩니다 (게임/계정을 바꿔도 남은시간 유지).</div>

      <div className="card">
        <h3>사용자 추가</h3>
        <form className="row" onSubmit={add}>
          <div className="field"><label>아이디</label><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3자 이상" /></div>
          <div className="field"><label>비밀번호</label><input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="4자 이상" /></div>
          <div className="field" style={{ maxWidth: 130 }}><label>권한</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}><option value="user">사용자</option><option value="admin">관리자</option></select></div>
          <button className="btn-primary" disabled={username.length < 3 || password.length < 4}>추가</button>
        </form>
        {err && <div className="error-msg">{err}</div>}
      </div>

      <div className="card">
        <h3>사용자 목록 ({users.length})</h3>
        <table>
          <thead><tr>
            <th>아이디</th><th>권한</th><th>결제</th><th>이용권</th><th>현재 접속</th><th>차단</th><th>접속 잔여 횟수</th><th>가입</th><th></th>
          </tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}{u.online ? <span className="pill assigned" style={{ marginLeft: 6 }}>●</span> : ''}</td>
                <td><span className={`pill ${u.role === 'admin' ? 'assigned' : 'available'}`}>{u.role === 'admin' ? '관리자' : '사용자'}</span></td>
                <td>
                  {u.role === 'admin' ? <span className="muted">-</span> :
                    <button className={u.paid ? 'pill available' : 'pill warn'} style={{ border: 'none', cursor: 'pointer' }} onClick={() => togglePaid(u)}>
                      {u.paid ? '결제완료' : '미결제'}
                    </button>}
                </td>
                <td className="muted">{u.role === 'admin' ? '-' : fmtPlan(u.planType, u.remainingSeconds, u.expiresAt)}</td>
                <td className="muted">{u.online && u.account ? `${u.account.game}` : '미접속'}</td>
                {/* 상태: 정상/차단/정지 선택 */}
                <td>{u.role === 'admin'
                  ? <span className="muted">-</span>
                  : <select value={u.status} onChange={(e) => setStatus(u, e.target.value as any)}
                      style={{ padding: '3px 8px', fontSize: 12, fontWeight: 600,
                        color: u.status === 'blocked' ? '#ff6b6b' : u.status === 'suspended' ? '#ffb648' : '#37d39b' }}>
                      <option value="normal">정상</option>
                      <option value="blocked">차단</option>
                      <option value="suspended">정지</option>
                    </select>}</td>
                {/* 접속 잔여 횟수 (모든 사용자 편집 가능) */}
                <td>{u.role === 'admin'
                  ? <span className="muted">-</span>
                  : <button className="btn-ghost" style={{ padding: '2px 9px', fontSize: 12 }} title="클릭하여 접속 잔여 횟수 설정" onClick={() => editStops(u)}>
                      {u.stopsRemaining}회{u.timePenalty ? ' (P)' : ''} ✎
                    </button>}</td>
                <td className="muted">{fmt(u.createdAt)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {u.role === 'user' && <>
                    <button className="btn-primary" style={{ padding: '6px 10px', marginRight: 4 }} onClick={() => setGrantFor(u)}>이용권</button>
                    {u.planType && <button className="btn-ghost" style={{ marginRight: 4 }} onClick={() => addTime(u)}>충전</button>}
                    {u.planType && <button className="btn-ghost" style={{ marginRight: 4 }} onClick={() => revoke(u)}>회수</button>}
                  </>}
                  <button className="btn-ghost" style={{ marginRight: 4 }} onClick={() => changePw(u)}>비번</button>
                  <button className="btn-danger" onClick={() => del(u)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {grantFor && <GrantModal user={grantFor} onClose={() => setGrantFor(null)} onDone={() => { setGrantFor(null); load(); }} />}
    </div>
  );
}

function GrantModal({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const [planType, setPlanType] = useState<'time' | 'monthly'>('time');
  const [amount, setAmount] = useState(60);
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await api.grantPlan(user.id, planType, Number(amount)); onDone(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
      <form className="card" onClick={(e) => e.stopPropagation()} style={{ width: 420, margin: 0 }} onSubmit={submit}>
        <h3>이용권 부여 — {user.username}</h3>
        <p className="muted" style={{ marginBottom: 12 }}>기존 이용권을 덮어씁니다(정지/차단 초기화). 추가 충전은 '충전' 버튼.</p>
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="field"><label>요금제</label>
            <select value={planType} onChange={(e) => setPlanType(e.target.value as any)}>
              <option value="time">시간제(분 · 종량)</option>
              <option value="monthly">월정액(일)</option>
            </select></div>
          <div className="field"><label>{planType === 'time' ? '시간(분)' : '기간(일)'}</label>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        </div>
        {err && <div className="error-msg">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary">부여</button>
        </div>
      </form>
    </div>
  );
}
