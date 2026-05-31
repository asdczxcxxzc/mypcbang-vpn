import { useEffect, useState } from 'react';
import { api, Alert } from '../api';

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  heartbeat_lost: { label: '하트비트 끊김', cls: 'warn' },
  router_offline: { label: '공유기 오프라인', cls: 'warn' },
  plan_expired: { label: '이용권 만료', cls: 'assigned' },
  abuse_blocked: { label: '반복정지 차단', cls: 'warn' },
};

export default function Alerts() {
  const [rows, setRows] = useState<Alert[]>([]);

  async function load() {
    setRows(await api.alerts());
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  async function readAll() {
    await api.markAlertsRead();
    load();
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleString('ko-KR');
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">시스템 알림</div>
          <div className="page-sub">
            하트비트 끊김 · 공유기 오프라인 등 자동 감지 이벤트
          </div>
        </div>
        <button className="btn-ghost" onClick={readAll}>
          모두 읽음 처리
        </button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>유형</th>
              <th>대상</th>
              <th>내용</th>
              <th>시각</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const t = TYPE_LABEL[a.type] ?? { label: a.type, cls: 'assigned' };
              return (
                <tr
                  key={a.id}
                  style={{ opacity: a.read ? 0.55 : 1 }}
                >
                  <td>
                    <span className={`pill ${t.cls}`}>{t.label}</span>
                  </td>
                  <td>{a.username}</td>
                  <td>{a.message}</td>
                  <td className="muted">{fmt(a.createdAt)}</td>
                  <td>
                    {a.read ? (
                      <span className="muted">읽음</span>
                    ) : (
                      <span className="pill warn">NEW</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  알림이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
