# VPN 시스템

게임별로 전국 공유기(L2TP)의 한국 IP를 **중복 없이** 할당하는 VPN 서비스.

## 구성

```
vpn-system/
├── backend/      ③ API 서버 (NestJS + Prisma + SQLite)  — control plane
├── admin-web/    ② 관리자 패널 (React + Vite, ERP 스타일)
└── client/       ① 사용자 앱 (C++ + WebView2)  — 다음 단계
```

- **백엔드**: 로그인(JWT) + 게임/공유기(IP) 관리 + 중복 없는 할당 + 하트비트 자동반납 + 공유기 헬스체크 + 알림. 게임 트래픽은 거치지 않음(속도 저하 없음).
- **관리자 패널**: 대시보드 · 게임 관리 · 공유기(IP) 관리 · 실시간 현황 · 시스템 알림 · 불일치 감지.
- **공유기**: 각 행 = "IP:포트로 L2TP 로그인하면 그 집 한국 IP로 나가는" 엔드포인트. 비밀번호·PSK는 AES-256-GCM 암호화 저장.

## 실행 방법

### 1) 백엔드

```powershell
cd backend
npm install
npx prisma db push        # DB 생성
npx prisma generate
npm run seed              # 초기 계정/샘플 데이터
npm run dev               # http://localhost:3000
```

기본 계정:
- 관리자: `admin` / `admin1234`
- 사용자: `user1` / `user1234`

### 2) 관리자 패널

```powershell
cd admin-web
npm install
npm run dev               # http://localhost:5173
```

브라우저에서 http://localhost:5173 접속 → `admin` / `admin1234` 로그인.

## 운영 전 체크리스트

- `backend/.env` 의 `JWT_SECRET` 을 길고 무작위한 값으로 교체
- `ENC_KEY`(32바이트 hex = 64자) 환경변수 설정 — 공유기 비밀번호 암호화 키
- SQLite → PostgreSQL 전환: `prisma/schema.prisma` 의 `provider` 변경 + `DATABASE_URL` 수정
- 하트비트 타임아웃/검사주기 조정: `HEARTBEAT_TIMEOUT_MS`, `SWEEP_INTERVAL_MS`

## 주요 동작

| 기능 | 설명 |
|------|------|
| VPN ON | 게임의 available + online 공유기 1개를 트랜잭션으로 잠가 중복 없이 할당 |
| 하트비트 | 클라이언트가 30초마다 신호 → 60초 무응답 시 IP 자동 반납 + 관리자 알림 |
| VPN OFF | 즉시 IP 반납, 세션 종료 |
| 헬스체크 | 30초마다 공유기 host:port TCP 점검 → 오프라인 전환 시 알림 |
| 감지(방법 B) | 클라이언트가 실행 게임 보고 → 할당 게임과 다르면 불일치 기록 + 알림 |
