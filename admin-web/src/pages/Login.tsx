import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const res = await api.login(username, password);
      if (res.user.role !== 'admin') {
        throw new Error('관리자 계정으로만 패널에 로그인할 수 있습니다.');
      }
      localStorage.setItem('token', res.accessToken);
      localStorage.setItem('username', res.user.username);
      onLogin();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="logo"><span className="dot" /> VPN Console</div>
        <div className="login-sub">관리자 패널 로그인</div>

        <div className="field">
          <label>아이디</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="아이디" autoFocus />
        </div>
        <div className="field">
          <label>비밀번호</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>

        {err && <div className="error-msg">{err}</div>}

        <button className="btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
          {loading ? '처리 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
