# 게임 로고 이미지

이 폴더에 게임 로고 파일을 넣으면 `/games` 섹션 카드에 자동으로 표시됩니다.

## 파일명 규칙

`src/lib/constants.ts`의 `SUPPORTED_GAMES`에 정의된 `id` 값을 파일명으로 사용하세요.

지원 확장자: `.svg`, `.png`, `.webp`

| id          | 권장 파일명         |
|-------------|----------------------|
| lol         | lol.svg              |
| valorant    | valorant.svg         |
| lostark     | lostark.png          |
| pubg        | pubg.png             |
| fifa        | fifa.png             |
| sudden      | sudden.png           |
| overwatch   | overwatch.svg        |
| eldenring   | eldenring.png        |
| tft         | tft.svg              |
| starcraft   | starcraft.svg        |

## 권장 사양

- 정사각형 또는 가로형 (가로 최대 1:2 비율 권장)
- 투명 배경 (PNG 또는 SVG)
- 최소 256px, 권장 512px 이상
- SVG가 가장 좋음 (벡터, 가벼움, 모든 해상도)

## 라이선스 안내

게임 로고는 각 게임사의 등록 상표/저작권 자산입니다.

상업 서비스 운영 시:
- **PC방 파트너 등록** 후 받은 공식 자료를 사용하세요 (넥슨, 라이엇 코리아, 카카오게임즈, 스마일게이트 등)
- 또는 각 게임사의 **공식 프레스킷/미디어킷**의 사용 조건을 확인하세요
- 임의 다운로드 시 상표권/저작권 분쟁 위험이 있습니다

파일이 없는 게임은 자동으로 브랜드 컬러 카드로 폴백됩니다.
