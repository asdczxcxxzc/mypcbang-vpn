# mypcbang 데이터베이스 스키마 정리

개발: SQLite / 운영: PostgreSQL (Prisma `provider`만 변경). 원본: `backend/prisma/schema.prisma`

## 관계도

```
User 1──0..1 VpnAccount        (배정: 유저당 계정 1개, 연결 중에만)
User 1───* Session
User 1───* DetectionLog
Game 1───* VpnAccount          (currentGame: 연결 중 선택된 게임)
Game 1───* Session
VpnIp 1───* VpnAccount         (공유기당 계정 5개)
```

## 테이블

### User — 사용자 + 이용권(시간/정지는 사용자 단위)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int PK | |
| username | String unique | 로그인 아이디 |
| passwordHash | String | bcrypt 해시 |
| role | String | `admin` \| `user` |
| paid | Bool | 관리자 결제확인 표시 |
| planType | String? | `time`(시간제) \| `monthly`(월정액) |
| remainingSeconds | Int? | 시간제 남은 초 |
| expiresAt | DateTime? | 월정액 만료 시각 |
| lastTickAt | DateTime? | 시간제 차감 기준 |
| connected | Bool | 현재 VPN 연결 여부 |
| lastHeartbeat | DateTime? | 마지막 하트비트 |
| stopsUsed | Int | 정지(끄기) 횟수 |
| timePenalty | Bool | 정지 한도 초과 → 연결 안 해도 시간 차감 |
| blocked | Bool | 반복 정지 차단 |
| abuseWindowStart / abuseCount | DateTime?/Int | 어뷰징 윈도우 |

### Game — 게임 카탈로그
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int PK | |
| name | String unique | 표시명 (예: 배틀그라운드) |
| image | String? | 클라이언트 img/ 파일명 (예: battleground.jpg) |

### VpnIp — 공유기(라우터)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int PK | |
| ipAddress | String unique | 공인 IP |
| host / port / protocol | String/Int/String | 접속 호스트·포트·프로토콜(l2tp) |
| pskEnc | String? | L2TP PSK (AES-256-GCM 암호화, IP당 1개·자동생성) |
| adminUrl / adminUsername / adminPasswordEnc | String? | 공유기 관리자 접속정보(강제해제용, 비번 암호화) |
| brand / model / region | String? | iptime/dlink/tplink, 모델, 지역 |
| online | Bool | 헬스체크 결과 |
| lastCheckedAt | DateTime? | |

### VpnAccount — VPN 계정(연결 슬롯, 공유기당 5개 자동생성)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int PK | |
| vpnIpId | Int FK→VpnIp | |
| username | String unique | L2TP 로그인 ID (자동생성) |
| passwordEnc | String | L2TP 비번 (암호화) |
| status | String | `available` \| `assigned`(사용 중) |
| assignedTo | Int? FK→User unique | 현재 사용 유저(연결 중에만) |
| assignedAt | DateTime? | |
| currentGameId | Int? FK→Game | 유저가 선택한 게임(연결 중에만, 같은 IP 중복금지) |

### Session — 접속 기록
| id | userId | gameId | vpnAccountId | startedAt | endedAt? |

### Alert — 관리자 알림
| id | type | username | message | read | createdAt |
> type: `heartbeat_lost` · `plan_expired` · `router_offline` · `abuse_blocked`

### DetectionLog — 게임 불일치 감지(방법 B)
| id | userId | assignedGame | detectedGame | matched | createdAt |

## 핵심 규칙
- **이용권/시간 = User 단위** (계정/게임 바꿔도 남은시간 유지)
- **게임 = 연결 시 선택**(currentGame), 같은 IP에서 같은 게임 동시 1명
- **자동 할당**: 게임 선택 시 빈 슬롯(available) 자동 배정, 없으면 NO_SLOT
- **암호화 필드**: pskEnc, passwordEnc, adminPasswordEnc (AES-256-GCM, `ENC_KEY`)
- **자동화(30초 스위프)**: 헬스체크 / 시간차감 / 만료·하트비트끊김 → 해제+슬롯반납+텔레그램
