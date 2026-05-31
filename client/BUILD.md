# mypcbang 클라이언트 빌드 가이드 (C++ + WebView2)

## 0. 사전 준비
- **Visual Studio 2022** (Community 무료) 설치 시 워크로드:
  - ✅ **C++를 사용한 데스크톱 개발**
  - 그 안의 구성요소: **Windows용 C++ CMake 도구** (보통 자동 포함)
- **Node.js** (리소스 암호화 도구 실행용)
- WebView2 런타임: Windows 11 기본 탑재 (없으면 Microsoft에서 Evergreen 런타임 설치)

## 1. 웹 UI 암호화 내장
빌드 전에 한 번 실행 (web/ 의 html·js·css 를 암호화해 `src/Resources_gen.inc` 생성):
```
cd client
node tools/pack.js
```
> 게임 이미지(web/img/*)는 암호화하지 않고 파일로 배포합니다(비밀 아님).
> `pack.js` 는 빌드마다 다른 무작위 키를 사용합니다.

## 2. 서버 주소 설정
`src/main.cpp` 의 `api::setBaseUrl(...)` 를 운영 주소로:
```cpp
api::setBaseUrl(L"https://api.mypcbang.com");   // 개발: http://localhost:3000
```
> 운영은 반드시 **HTTPS**. (Api.cpp 의 인증서 피닝 TODO 도 채우면 더 안전)

## 3. 빌드 (Visual Studio)
1. VS 2022 → **파일 → 열기 → 폴더** → `client` 폴더 선택 (CMake 자동 구성)
2. 상단 구성: **x64-Release**
3. **빌드 → 모두 빌드**  → `out/build/x64-Release/mypcbang.exe` 생성
   - WebView2 로더는 정적 링크(WebView2LoaderStatic.lib)되어 별도 DLL 불필요
4. 배포 폴더 구성:
   ```
   mypcbang.exe
   web/img/        ← 게임 이미지 (web/img 전체 복사)
   ```

## 4. 게임 프로세스 매핑
`src/Watcher.cpp` 의 `kGames` 표에 **게임 표시명 → 실행파일(.exe)** 을 실제 게임에 맞게 채우세요.
(킬 스위치/감지에 사용)

## 5. 코드 서명 (선택, 권장)
서명하면 "알 수 없는 게시자" 경고가 사라지고 변조 탐지가 됩니다.
```
signtool sign /fd SHA256 /a /tr http://timestamp.digicert.com /td SHA256 mypcbang.exe
```

## 보안 적용 요약 (리버싱 방어)
- 웹 UI(코드) **암호화 내장** → 메모리에서만 복호화 (`Resources.cpp`)
- **클라이언트에 영구 비밀 없음** — 토큰/IP/자격증명은 서버에서 받아 메모리에서만, 사용 후 `SecureZeroMemory`
- IP/포트/비번은 **WebView(JS)로 전달 안 함** — C++가 전담
- L2TP **임시 프로필 생성→연결→삭제** (네트워크 설정에 흔적 없음)
- **안티 디버깅**(`Security.cpp`), 개발자도구/우클릭 비활성화
- ⚠️ 한계: 출구 서버 IP는 패킷 레벨에선 보임(모든 VPN 공통), 리버싱 100% 차단은 불가
