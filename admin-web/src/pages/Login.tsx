import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setMsg(''); setLoading(true);
    try {
      if (mode === 'signup') {
        await api.register(username, password);
        setMsg('회원가입 완료! 관리자 결제확인·계정부여 후 이용할 수 있습니다.');
        setMode('login');
      } else {
        const res = await api.login(username, password);
        if (res.user.role !== 'admin') {
          throw new Error('관리자 계정으로만 패널에 로그인할 수 있습니다.');
        }
        localStorage.setItem('token', res.accessToken);
        localStorage.setItem('username', res.user.username);
        onLogin();
      }
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
        <div className="login-sub">
          {mode === 'login' ? '관리자 패널 로그인' : '회원가입'}
        </div>

        <div className="field">
          <label>아이디</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="아이디" autoFocus />
        </div>
        <div className="field">
          <label>비밀번호</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>

        {err && <div className="error-msg">{err}</div>}
        {msg && <div style={{ color: 'var(--green)', fontSize: 13, margin: '10px 0' }}>{msg}</div>}

        <button className="btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
          {loading ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            type="button"
            className="btn-ghost"
            style={{ border: 'none' }}
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(''); setMsg(''); }}
          >
            {mode === 'login' ? '회원가입' : '로그인으로'}
          </button>
        </div>
      </form>
    </div>
  );
}
