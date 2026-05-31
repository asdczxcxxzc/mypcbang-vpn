import { useEffect, useState } from 'react';
import { api, SessionRow, DailyStat } from '../api';
import BarChart from '../components/BarChart';

export default function Sessions() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [stats, setStats] = useState<DailyStat[]>([]);

  async function load() {
    const [s, st] = await Promise.all([api.sessions(), api.sessionStats()]);
    setRows(s);
    setStats(st);
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  function fmt(iso: string) {
    return new Date(iso).toLocaleString('ko-KR');
  }
  function dur(sec: number | null) {
    if (sec === null) return <span className="pill assigned">진행 중</span>;
    if (sec < 60) return `${sec}초`;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}분 ${sec % 60}초`;
    return `${Math.floor(m / 60)}시간 ${m % 60}분`;
  }

  return (
    <div>
      <div className="page-title">세션 기록</div>
      <div className="page-sub">VPN 사용 이력 · 일별 사용량 추이</div>

      <div className="card">
        <h3>최근 14일 일별 세션 수</h3>
        <BarChart
          data={stats.map((s) => ({ label: s.date.slice(5), value: s.count }))}
        />
      </div>

      <div className="card">
        <h3>세션 목록 (최근 {rows.length}건)</h3>
        <table>
          <thead>
            <tr>
              <th>사용자</th>
              <th>게임</th>
              <th>IP</th>
              <th>지역</th>
              <th>시작</th>
              <th>종료</th>
              <th>사용 시간</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.user}</td>
                <td>{s.game}</td>
                <td className="mono">{s.ipAddress}</td>
                <td>{s.region ?? '-'}</td>
                <td className="muted">{fmt(s.startedAt)}</td>
                <td className="muted">{s.endedAt ? fmt(s.endedAt) : '-'}</td>
                <td>{dur(s.durationSec)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  세션 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
