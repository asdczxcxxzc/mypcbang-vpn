export default function Settings() {
  return (
    <div>
      <div className="page-title">설정</div>
      <div className="page-sub">텔레그램 알림 · 정지/어뷰징 정책</div>

      <div className="card">
        <h3>텔레그램 알림</h3>
        <p className="muted" style={{ lineHeight: 1.7 }}>
          하트비트 끊김 · 이용권 만료 · 반복정지 차단 시 텔레그램으로 알림을 전송합니다
          (해당 유저의 IP · VPN ID · 비밀번호 포함).
        </p>
        <p className="muted" style={{ marginTop: 10, lineHeight: 1.8 }}>
          설정은 백엔드 <code className="mono">backend/.env</code> 에서:
        </p>
        <div className="card" style={{ background: 'var(--bg-soft)', marginTop: 8 }}>
          <div className="mono" style={{ lineHeight: 1.9 }}>
            TELEGRAM_BOT_TOKEN="봇토큰"<br />
            TELEGRAM_CHAT_ID="챗ID"
          </div>
        </div>
        <ol className="muted" style={{ lineHeight: 1.9, marginTop: 12, paddingLeft: 18 }}>
          <li>텔레그램 <b>@BotFather</b> 에서 봇 생성 → 토큰 발급</li>
          <li>알림 받을 채널/그룹에 봇 초대</li>
          <li>채팅 ID 확인 후 위 두 값을 .env 에 입력 → 백엔드 재시작</li>
        </ol>
        <p className="muted" style={{ marginTop: 8 }}>
          ⚠️ 비밀번호가 텔레그램에 평문으로 남습니다. 알림 채널 접근을 제한하세요.
        </p>
      </div>

      <div className="card">
        <h3>정지 / 어뷰징 정책 (시간제)</h3>
        <table>
          <tbody>
            <Row k="정지 허용 횟수 (STOP_LIMIT)" v="기본 5회 — 초과 시 정지해도 시간이 계속 차감" />
            <Row k="반복 차단 (ABUSE_STOPS / WINDOW)" v="5분 내 5회 정지 시 계정 차단 + 알림" />
            <Row k="차단 해제" v="VPN 계정 메뉴에서 '차단해제'" />
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 10 }}>
          값 변경: <code className="mono">backend/.env</code> 의 STOP_LIMIT / ABUSE_STOPS / ABUSE_WINDOW_MS
        </p>
      </div>

      <div className="card">
        <h3>보안 체크리스트 (운영 전)</h3>
        <ul className="muted" style={{ lineHeight: 1.9, paddingLeft: 18 }}>
          <li>관리자 기본 비번(admin1234) 변경</li>
          <li><code className="mono">.env</code> 의 JWT_SECRET · ENC_KEY(32바이트 hex) 무작위 값으로 교체</li>
          <li>개발 SQLite → 운영 PostgreSQL 전환</li>
        </ul>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td style={{ width: 280 }}>{k}</td>
      <td className="muted">{v}</td>
    </tr>
  );
}
