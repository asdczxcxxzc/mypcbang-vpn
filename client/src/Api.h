#pragma once
#include <string>

// 백엔드 API 클라이언트 (WinHTTP / HTTPS).
// 토큰을 내부에 보관하고, JS 에는 비밀(토큰/IP/자격증명)을 절대 넘기지 않는다.
namespace api {

struct Result {
  bool ok = false;
  int status = 0;
  std::string body;   // 응답 JSON (성공 시 JS로 전달될 정제된 데이터)
};

// 서버 주소 설정 (문자열 암호화되어 들어옴 → 런타임 복호화 후 set)
void setBaseUrl(const std::wstring& url);

// JS bridge('api', {path, method, body}) 처리.
// 로그인이면 토큰을 내부 저장(반환 X). /me/connect 면 L2TP 연결 후 자격증명 제거.
// /me/disconnect 면 터널 해제 + 게임 종료(킬스위치).
Result handle(const std::string& path, const std::string& method, const std::string& bodyJson);

// 로그아웃: 토큰 메모리 0으로 덮어쓰고 제거 + 저장된 세션 삭제.
void logout();

// 자동 로그인: 현재 토큰을 DPAPI로 암호화해 파일 저장 / 삭제.
void saveSession();
void forgetSession();
// 저장된 세션이 유효하면 user JSON({username,...}) 반환, 아니면 빈 문자열.
std::string tryAutoLogin();

// 현재 연결된(점유) 게임 표시명 (킬스위치/감지용). 없으면 빈 문자열.
std::string currentGame();

}  // namespace api
