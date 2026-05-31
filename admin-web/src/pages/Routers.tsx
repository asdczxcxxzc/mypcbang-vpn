import { useEffect, useMemo, useState } from 'react';
import { api, Router, NewRouter } from '../api';

const EMPTY: NewRouter = {
  ipAddress: '', host: '', port: 1701, protocol: 'l2tp', psk: '',
  adminUrl: '', adminUsername: '', adminPassword: '',
  brand: 'iptime', model: '', region: '', memo: '',
};

type SortKey = 'ipAddress' | 'region' | 'brand' | 'protocol' | 'online' | 'availableAccounts';
type SortDir = 'asc' | 'desc';

function exportCsv(routers: Router[]) {
  const headers = ['상태', '공인IP', '지역', '브랜드', '모델', '포트', '프로토콜', '가용계정', '전체계정', '비고'];
  const rows = routers.map(r => [
    r.online ? '온라인' : '오프라인',
    r.ipAddress, r.region ?? '', r.brand ?? '', r.model ?? '',
    String(r.port), r.protocol,
    String(r.availableAccounts), String(r.totalAccounts),
    r.memo ?? '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `routers_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export default function Routers() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [form, setForm] = useState<NewRouter>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [reveal, setReveal] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ipAddress');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  async function load() { setRouters(await api.ips()); }
  useEffect(() => {
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, []);

  function set<K extends keyof NewRouter>(k: K, v: NewRouter[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function resetForm() { setForm({ ...EMPTY, brand: form.brand }); setEditId(null); setErr(''); }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortTh({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    return (
      <th onClick={() => handleSort(k)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {label} {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
      </th>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const payload = { ...form, host: form.host || form.ipAddress, port: Number(form.port) };
      if (editId) {
        const patch: Partial<NewRouter> = { ...payload };
        if (!form.psk) delete patch.psk;
        if (!form.adminPassword) delete patch.adminPassword;
        await api.updateIp(editId, patch);
      } else {
        await api.createIp(payload);
      }
      resetForm(); load();
    } catch (e: any) { setErr(e.message); }
  }

  async function startEdit(r: Router) {
    const c = await api.ipCredentials(r.id);
    setForm({
      ipAddress: r.ipAddress, host: r.host, port: r.port, protocol: r.protocol,
      psk: c.psk ?? '', adminUrl: r.adminUrl ?? '', adminUsername: r.adminUsername ?? '',
      adminPassword: c.adminPassword ?? '', brand: r.brand ?? 'iptime', model: r.model ?? '',
      region: r.region ?? '', memo: r.memo ?? '',
    });
    setEditId(r.id); setErr(''); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function del(id: number, ip: string) {
    if (!confirm(`공유기 ${ip} 와 그 계정들이 모두 삭제됩니다. 진행할까요?`)) return;
    await api.deleteIp(id); if (editId === id) resetForm(); load();
  }
  async function showCreds(id: number) { setReveal(await api.ipCredentials(id)); }

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = q
      ? routers.filter(r => [r.ipAddress, r.region, r.brand, r.model].filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
      : [...routers];

    filtered.sort((a, b) => {
      let av: any = a[sortKey as keyof Router];
      let bv: any = b[sortKey as keyof Router];
      if (typeof av === 'boolean') { av = av ? 1 : 0; bv = bv ? 1 : 0; }
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av ?? '').localeCompare(String(bv ?? ''))
        : String(bv ?? '').localeCompare(String(av ?? ''));
    });
    return filtered;
  }, [routers, search, sortKey, sortDir]);

  return (
    <div>
      <div className="page-title">공유기(IP) 관리</div>
      <div className="page-sub">
        IP + 관리자 ID/PW만 입력하면 <b>PSK와 VPN 계정 5개가 자동 생성</b>됩니다. (게임은 유저가 연결 시 선택)
      </div>

      <div className="card" style={editId ? { borderColor: 'var(--brand)' } : undefined}>
        <h3>{editId ? `공유기 수정 (#${editId})` : '공유기 등록'}</h3>
        <form onSubmit={submit}>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="field"><label>공인 IP</label>
              <input value={form.ipAddress} onChange={(e) => set('ipAddress', e.target.value)} placeholder="211.200.1.50" /></div>
            <div className="field"><label>호스트(선택)</label>
              <input value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="비우면 공인 IP" /></div>
            <div className="field" style={{ maxWidth: 100 }}><label>포트</label>
              <input type="number" value={form.port} onChange={(e) => set('port', Number(e.target.value))} /></div>
            <div className="field" style={{ maxWidth: 120 }}><label>프로토콜</label>
              <select value={form.protocol} onChange={(e) => set('protocol', e.target.value)}>
                <option value="l2tp">L2TP</option><option value="pptp">PPTP</option>
                <option value="openvpn">OpenVPN</option><option value="socks5">SOCKS5</option>
              </select></div>
          </div>

          <div className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>공유기 관리자 접속정보 (하트비트 끊김 시 강제 세션해제용 · 선택)</div>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="field"><label>관리자 URL</label>
              <input value={form.adminUrl} onChange={(e) => set('adminUrl', e.target.value)} placeholder="http://211.200.1.50:8080" /></div>
            <div className="field"><label>관리자 ID</label>
              <input value={form.adminUsername} onChange={(e) => set('adminUsername', e.target.value)} placeholder="admin" /></div>
            <div className="field"><label>관리자 비번</label>
              <input value={form.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} placeholder={editId ? '비우면 기존 유지' : '비밀번호'} /></div>
          </div>

          <div className="row">
            <div className="field" style={{ maxWidth: 140 }}><label>브랜드</label>
              <select value={form.brand} onChange={(e) => set('brand', e.target.value)}>
                <option value="iptime">iptime</option><option value="dlink">D-Link</option>
                <option value="tplink">TP-Link</option><option value="etc">기타</option>
              </select></div>
            <div className="field" style={{ maxWidth: 150 }}><label>모델(선택)</label>
              <input value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="A3004" /></div>
            <div className="field" style={{ maxWidth: 130 }}><label>지역(선택)</label>
              <input value={form.region} onChange={(e) => set('region', e.target.value)} placeholder="서울" /></div>
            <div className="field"><label>비고(선택)</label>
              <input value={form.memo} onChange={(e) => set('memo', e.target.value)} placeholder="메모 입력" /></div>
            <button className="btn-primary">{editId ? '수정 저장' : '공유기 추가'}</button>
            {editId && <button type="button" className="btn-ghost" onClick={resetForm}>취소</button>}
          </div>
          {err && <div className="error-msg">{err}</div>}
        </form>
      </div>

      <div className="card">
        <div className="topbar">
          <h3 style={{ margin: 0 }}>등록된 공유기 ({view.length})</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input style={{ width: 200 }} placeholder="IP·지역·브랜드 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-ghost" onClick={() => exportCsv(view)}>📥 엑셀 추출</button>
          </div>
        </div>
        <table>
          <thead><tr>
            <SortTh k="online" label="상태" />
            <SortTh k="ipAddress" label="공인 IP" />
            <SortTh k="region" label="지역" />
            <SortTh k="brand" label="브랜드" />
            <SortTh k="protocol" label="포트/프로토콜" />
            <SortTh k="availableAccounts" label="계정(가용/전체)" />
            <th>비고</th><th></th>
          </tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} style={editId === r.id ? { background: 'var(--card-hover)' } : undefined}>
                <td><span className={`pill ${r.online ? 'available' : 'warn'}`}>{r.online ? '● 온라인' : '● 오프라인'}</span></td>
                <td className="mono">{r.ipAddress}</td>
                <td>{r.region ?? '-'}</td>
                <td>{r.brand ?? '-'}</td>
                <td className="mono">{r.port}/{r.protocol}</td>
                <td>{r.availableAccounts}/{r.totalAccounts}</td>
                <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.memo ?? '-'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-ghost" style={{ marginRight: 4 }} onClick={() => startEdit(r)}>수정</button>
                  <button className="btn-ghost" style={{ marginRight: 4 }} onClick={() => showCreds(r.id)}>설정</button>
                  <button className="btn-danger" onClick={() => del(r.id, r.ipAddress)}>삭제</button>
                </td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={8} className="empty">등록된 공유기가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      {reveal && (
        <div onClick={() => setReveal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 50, overflowY: 'auto' }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 500, margin: '20px auto' }}>
            <h3>공유기 설정 정보 — {reveal.ipAddress}</h3>
            <p className="muted" style={{ marginBottom: 14 }}>VPN 서버 설정 + 공유기 관리자 접속정보</p>
            <Cred k="호스트" v={reveal.host} /><Cred k="포트" v={String(reveal.port)} />
            <Cred k="프로토콜" v={reveal.protocol} /><Cred k="PSK(비밀키)" v={reveal.psk ?? '-'} />
            <Cred k="관리자 URL" v={reveal.adminUrl ?? '-'} /><Cred k="관리자 ID" v={reveal.adminUsername ?? '-'} />
            <Cred k="관리자 비번" v={reveal.adminPassword ?? '-'} />

            {reveal.accounts?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontWeight: 600, marginBottom: 8 }}>VPN 접속 계정 ({reveal.accounts.length}개)</p>
                <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>공유기 VPN 서버에 아래 계정들을 등록하세요</p>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>아이디</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>비밀번호</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>상태</th>
                  </tr></thead>
                  <tbody>
                    {reveal.accounts.map((a: any, i: number) => (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '4px 8px', color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'monospace', userSelect: 'all' }}>{a.username}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'monospace', userSelect: 'all' }}>{a.password}</td>
                        <td style={{ padding: '4px 8px' }}><span className={`pill ${a.status === 'available' ? 'available' : 'warn'}`}>{a.status === 'available' ? '사용가능' : '사용중'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
