#include "Api.h"
#include "Vpn.h"
#include "Watcher.h"
#include "Security.h"
#include <windows.h>
#include <winhttp.h>
#include <wincrypt.h>     // DPAPI
#include <shlobj.h>       // SHGetFolderPath
#include <string>
#include <vector>
#include <fstream>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace {
std::wstring g_base;          // 예: http://localhost:3000  또는 https://api.mypcbang.com
std::string  g_token;         // JWT (메모리 보관, JS로 전달 안 함)
std::string  g_curGame;       // 현재 연결된 게임 표시명

struct Url { std::wstring scheme, host; INTERNET_PORT port = 0; bool https = false; };
Url parseUrl(const std::wstring& url) {
  Url u; size_t p = url.find(L"://");
  u.scheme = url.substr(0, p); u.https = (u.scheme == L"https");
  std::wstring rest = url.substr(p + 3);
  size_t slash = rest.find(L'/'); std::wstring hostport = (slash == std::wstring::npos) ? rest : rest.substr(0, slash);
  size_t colon = hostport.find(L':');
  if (colon == std::wstring::npos) { u.host = hostport; u.port = u.https ? 443 : 80; }
  else { u.host = hostport.substr(0, colon); u.port = (INTERNET_PORT)_wtoi(hostport.substr(colon + 1).c_str()); }
  return u;
}

// HTTPS/HTTP 요청. 반환: {status, body}
struct Resp { int status = 0; std::string body; };
Resp http(const std::string& method, const std::string& path, const std::string& body, const std::string& token) {
  Resp out;
  Url u = parseUrl(g_base);
  HINTERNET hs = WinHttpOpen(L"mypcbang/1.0", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!hs) return out;
  HINTERNET hc = WinHttpConnect(hs, u.host.c_str(), u.port, 0);
  std::wstring wpath(path.begin(), path.end());
  std::wstring wmethod(method.begin(), method.end());
  DWORD flags = u.https ? WINHTTP_FLAG_SECURE : 0;
  HINTERNET hr = WinHttpOpenRequest(hc, wmethod.c_str(), wpath.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);

  std::wstring hdr = L"Content-Type: application/json\r\n";
  if (!token.empty()) { std::string a = "Authorization: Bearer " + token + "\r\n"; hdr += std::wstring(a.begin(), a.end()); }

  // (운영) 인증서 피닝: WinHttpSetOption(hr, WINHTTP_OPTION_SERVER_CERT_CONTEXT, ...) 으로 서버 인증서 지문 검증 권장.

  BOOL ok = WinHttpSendRequest(hr, hdr.c_str(), (DWORD)-1L, (LPVOID)body.data(), (DWORD)body.size(), (DWORD)body.size(), 0);
  if (ok) ok = WinHttpReceiveResponse(hr, nullptr);
  if (ok) {
    DWORD code = 0, sz = sizeof(code);
    WinHttpQueryHeaders(hr, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr, &code, &sz, nullptr);
    out.status = (int)code;
    DWORD avail = 0;
    do {
      avail = 0; WinHttpQueryDataAvailable(hr, &avail);
      if (!avail) break;
      std::vector<char> buf(avail); DWORD read = 0;
      WinHttpReadData(hr, buf.data(), avail, &read);
      out.body.append(buf.data(), read);
    } while (avail > 0);
  }
  WinHttpCloseHandle(hr); WinHttpCloseHandle(hc); WinHttpCloseHandle(hs);
  return out;
}
}  // namespace

namespace api {

void setBaseUrl(const std::wstring& url) { g_base = url; }
std::string currentGame() { return g_curGame; }

// ---- 자동 로그인 (DPAPI 토큰 저장) ----
static std::wstring sessionPath() {
  wchar_t p[MAX_PATH]{};
  SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, p);
  std::wstring dir = std::wstring(p) + L"\\mypcbang";
  CreateDirectoryW(dir.c_str(), nullptr);
  return dir + L"\\s.dat";
}

void saveSession() {
  if (g_token.empty()) return;
  DATA_BLOB in{ (DWORD)g_token.size(), (BYTE*)g_token.data() }, out{};
  if (CryptProtectData(&in, L"mypcbang", nullptr, nullptr, nullptr, 0, &out)) {
    std::ofstream f(sessionPath(), std::ios::binary);
    f.write((char*)out.pbData, out.cbData);
    LocalFree(out.pbData);
  }
}
void forgetSession() { DeleteFileW(sessionPath().c_str()); }

static bool loadSession() {
  std::ifstream f(sessionPath(), std::ios::binary);
  if (!f) return false;
  std::vector<BYTE> blob((std::istreambuf_iterator<char>(f)), {});
  if (blob.empty()) return false;
  DATA_BLOB in{ (DWORD)blob.size(), blob.data() }, out{};
  if (!CryptUnprotectData(&in, nullptr, nullptr, nullptr, nullptr, 0, &out)) return false;
  g_token.assign((char*)out.pbData, out.cbData);
  LocalFree(out.pbData);
  return true;
}

std::string tryAutoLogin() {
  if (!loadSession()) return "";
  Resp r = http("GET", "/auth/me", "", g_token);   // 토큰 유효성 확인
  if (r.status == 200) return r.body;               // {userId, username, role}
  forgetSession(); security::wipe(g_token);
  return "";
}

void logout() {
  vpn::disconnect();
  if (!g_curGame.empty()) { watcher::killGame(g_curGame); g_curGame.clear(); }
  forgetSession();
  security::wipe(g_token);  // 토큰 메모리 0으로
}

Result handle(const std::string& path, const std::string& method, const std::string& bodyJson) {
  Result r;
  Resp resp = http(method, path, bodyJson, (path == "/auth/login" || path == "/auth/register") ? "" : g_token);
  r.status = resp.status;
  json data = json::parse(resp.body.empty() ? "null" : resp.body, nullptr, false);

  if (resp.status < 200 || resp.status >= 300) {
    r.ok = false; r.body = data.is_discarded() ? "null" : data.dump();
    return r;
  }

  // 로그인: 토큰 내부 저장, JS에는 user만
  if (path == "/auth/login") {
    if (data.contains("accessToken")) g_token = data["accessToken"].get<std::string>();
    json out; out["user"] = data.value("user", json::object());
    r.ok = true; r.body = out.dump();
    return r;
  }

  // VPN ON: 자격증명으로 L2TP 연결 후, 연결정보는 JS에 넘기지 않음
  if (path == "/me/connect" && data.contains("connection")) {
    auto c = data["connection"];
    vpn::Creds cr;
    auto W = [](const std::string& s){ return std::wstring(s.begin(), s.end()); };
    cr.host = W(c.value("host", "")); cr.port = c.value("port", 1701);
    cr.protocol = W(c.value("protocol", "l2tp"));
    cr.username = W(c.value("username", "")); cr.password = W(c.value("password", ""));
    cr.psk = W(c.value("psk", ""));
    bool dialed = vpn::connect(cr);
    // 자격증명 즉시 폐기
    security::wipe(cr.password); security::wipe(cr.psk);
    g_curGame = data.value("game", "");
    json out; out["game"] = g_curGame;
    out["plan"] = data.contains("plan") ? data["plan"] : json::object();
    // stop 은 시간제일 때 객체, 그 외 null. value(key,nullptr) 는 객체를 만나면
    // type_error.302 를 던지므로(연결 응답 빌드 실패 → 앱 미연결 표시) 안전하게 분기.
    out["stop"] = data.contains("stop") ? data["stop"] : json(nullptr);
    out["dialed"] = dialed;
    r.ok = true; r.body = out.dump();   // connection 제거됨
    return r;
  }

  // VPN OFF: 터널 해제 + 킬 스위치(게임 종료)
  if (path == "/me/disconnect") {
    vpn::disconnect();
    if (!g_curGame.empty()) { watcher::killGame(g_curGame); g_curGame.clear(); }
    r.ok = true; r.body = resp.body.empty() ? "{}" : resp.body;
    return r;
  }

  r.ok = true; r.body = data.is_discarded() ? "null" : data.dump();
  return r;
}

}  // namespace api
