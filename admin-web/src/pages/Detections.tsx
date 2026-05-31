import { useEffect, useState } from 'react';
import { api, Mismatch } from '../api';

export default function Detections() {
  const [rows, setRows] = useState<Mismatch[]>([]);

  async function load() {
    setRows(await api.mismatches());
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  function fmt(iso: string) {
    return new Date(iso).toLocaleString('ko-KR');
  }

  return (
    <div>
      <div className="page-title">불일치 감지</div>
      <div className="page-sub">
        할당받은 게임과 실제 실행 중인 게임이 다른 경우 (방법 B · 프로세스 감지)
      </div>

      <div className="card">
        <h3>불일치 기록 ({rows.length})</h3>
        <table>
          <thead>
            <tr>
              <th>사용자</th>
              <th>할당 게임</th>
              <th>감지된 게임</th>
              <th>시각</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.user.username}</td>
                <td>{m.assignedGame}</td>
                <td>
                  <span className="pill warn">{m.detectedGame}</span>
                </td>
                <td className="muted">{fmt(m.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  불일치 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
