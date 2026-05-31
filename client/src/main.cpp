// ============================================================
//  mypcbang VPN 클라이언트 — WebView2 호스트
//  - 테두리 없는 둥근 창(macOS 느낌), 단일 인스턴스(중복 실행 팝업)
//  - 웹 UI는 암호화 리소스로 내장 → 메모리 복호화 후 가상 호스트로 제공
//  - JS ↔ C++ 브리지: 모든 API/토큰/자격증명/L2TP를 C++가 전담(리버싱 방어)
// ============================================================
#include <windows.h>
#include <shlwapi.h>       // SHCreateMemStream
#include <dwmapi.h>
#include <wrl.h>
#include <wil/com.h>           // (WebView2 SDK 동봉) 없으면 wil 의존 제거 가능
#include <WebView2.h>
#include <string>
#include <thread>
#include <exception>
#include <cstdlib>
#include <cstdio>
#include <csignal>
#include <nlohmann/json.hpp>

#include "Api.h"
#include "Vpn.h"
#include "Watcher.h"
#include "Security.h"
#include "Resources.h"

using namespace Microsoft::WRL;
using json = nlohmann::json;

static const wchar_t* kClass = L"mypcbangWnd";
static const wchar_t* kMutex = L"Global\\mypcbang_single_instance";
static const wchar_t* kVHost = L"app.mypcbang";   // 가상 호스트
static const UINT WM_SHOWDUP = WM_APP + 1;
static const UINT WM_BRIDGE_REPLY = WM_APP + 2;   // 백그라운드 작업 결과 → UI 스레드

// 백그라운드 작업 결과 (UI 스레드로 마샬링)
struct BridgeReply { std::string id, body; bool ok; int status; };

static HWND g_hwnd = nullptr;
static wil::com_ptr<ICoreWebView2Controller> g_controller;
static wil::com_ptr<ICoreWebView2> g_webview;

// ============ 크래시 로거 (디버거 불가 → 원인을 파일로 기록) ============
//  %TEMP%\mypcbang_crash.log 에 예외 메시지/스택(module+offset) 기록.
static std::wstring crashLogPath() {
  wchar_t buf[MAX_PATH]{}; DWORD n = GetEnvironmentVariableW(L"TEMP", buf, MAX_PATH);
  std::wstring dir = n ? std::wstring(buf, n) : L"C:\\Temp";
  return dir + L"\\mypcbang_crash.log";
}
static void crashWrite(const std::string& line) {
  HANDLE h = CreateFileW(crashLogPath().c_str(), FILE_APPEND_DATA,
                         FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
                         OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (h == INVALID_HANDLE_VALUE) return;
  std::string s = line + "\r\n"; DWORD w = 0;
  WriteFile(h, s.data(), (DWORD)s.size(), &w, nullptr);
  CloseHandle(h);
}
static std::string addrToModOff(void* addr) {
  HMODULE mod = nullptr;
  if (GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                         (LPCWSTR)addr, &mod) && mod) {
    wchar_t path[MAX_PATH]{}; GetModuleFileNameW(mod, path, MAX_PATH);
    std::wstring wp = path; size_t sl = wp.find_last_of(L"\\/");
    std::wstring wn = (sl == std::wstring::npos) ? wp : wp.substr(sl + 1);
    std::string name(wn.begin(), wn.end());
    char b[48]; sprintf_s(b, "+0x%llx", (unsigned long long)((uintptr_t)addr - (uintptr_t)mod));
    return name + b;
  }
  char b[32]; sprintf_s(b, "%p", addr); return b;
}
static void crashLogStack(const char* tag) {
  void* fr[40]; USHORT n = RtlCaptureStackBackTrace(0, 40, fr, nullptr);
  std::string s = std::string(tag) + " stack:";
  for (USHORT i = 0; i < n; i++) s += " " + addrToModOff(fr[i]);
  crashWrite(s);
}
static LONG WINAPI crashUEF(EXCEPTION_POINTERS* ep) {
  char b[160];
  sprintf_s(b, "UEF code=0x%08lx flags=0x%lx addr=%s",
            ep->ExceptionRecord->ExceptionCode, ep->ExceptionRecord->ExceptionFlags,
            addrToModOff(ep->ExceptionRecord->ExceptionAddress).c_str());
  crashWrite(b); crashLogStack("UEF");
  return EXCEPTION_CONTINUE_SEARCH;
}
static void installCrashLogger() {
  crashWrite("=== launch ===");
  SetUnhandledExceptionFilter(crashUEF);
  std::set_terminate([] {
    std::string msg = "TERMINATE";
    auto e = std::current_exception();
    if (e) { try { std::rethrow_exception(e); }
      catch (const std::exception& ex) { msg += std::string(": ") + ex.what(); }
      catch (...) { msg += ": (non-std exception)"; } }
    crashWrite(msg); crashLogStack("terminate");
    abort();
  });
  _set_invalid_parameter_handler(
    [](const wchar_t*, const wchar_t*, const wchar_t*, unsigned, uintptr_t) {
      crashWrite("INVALID_PARAMETER"); crashLogStack("invalid_param");
    });
  // abort() 경로 포착 (UCRT abort 은 __fastfail 로 UEF 우회 → SIGABRT 로 잡음)
  signal(SIGABRT, [](int) { crashWrite("SIGABRT (abort)"); crashLogStack("abort"); });
  _set_abort_behavior(0, _WRITE_ABORT_MSG | _CALL_REPORTFAULT);
  _set_purecall_handler([] { crashWrite("PURECALL"); crashLogStack("purecall"); });
}

// UTF-8 ↔ UTF-16 변환 (한글 깨짐 방지)
static std::wstring u8to16(const std::string& s) {
  if (s.empty()) return L"";
  int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
  std::wstring w(n, 0);
  MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &w[0], n);
  return w;
}
static std::string u16to8(const std::wstring& w) {
  if (w.empty()) return "";
  int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string s(n, 0);
  WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), &s[0], n, nullptr, nullptr);
  return s;
}

// JS로 메시지 전송 (UTF-8 JSON → UTF-16)
static void postToJs(const json& j) {
  if (!g_webview) return;
  std::wstring w = u8to16(j.dump());
  g_webview->PostWebMessageAsJson(w.c_str());
}

// 브리지 응답 (요청 id 매칭)
static void reply(const std::string& id, bool ok, int status, const std::string& payload) {
  json r; r["__id"] = id; r["ok"] = ok;
  if (ok) r["data"] = json::parse(payload.empty() ? "null" : payload, nullptr, false);
  else { r["status"] = status; r["error"] = json::parse(payload.empty() ? "null" : payload, nullptr, false); }
  postToJs(r);
}

// 창 드래그 (borderless): 캡처 해제 후 캡션 드래그 흉내
static void beginDrag() {
  ReleaseCapture();
  SendMessageW(g_hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
}

// 둥근 창 모서리 적용
static void applyRoundedCorners(HWND hwnd) {
  // Windows 11: DWM 둥근 모서리
  DWM_WINDOW_CORNER_PREFERENCE pref = DWMWCP_ROUND;
  DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &pref, sizeof(pref));
  // 구버전 폴백: 둥근 리전
  RECT rc; GetWindowRect(hwnd, &rc);
  int w = rc.right - rc.left, h = rc.bottom - rc.top;
  HRGN rgn = CreateRoundRectRgn(0, 0, w + 1, h + 1, 20, 20);
  SetWindowRgn(hwnd, rgn, TRUE);
}

// 브리지 메시지 처리
static void onWebMessage(const std::wstring& wjson) {
  std::string s = u16to8(wjson);   // UTF-16 → UTF-8
  json m = json::parse(s, nullptr, false);
  if (m.is_discarded()) return;
  std::string id = m.value("__id", "");
  std::string action = m.value("action", "");

  if (action == "window") {
    std::string p = m.value("payload", "");
    if (p == "minimize") ShowWindow(g_hwnd, SW_MINIMIZE);
    else if (p == "close") PostMessageW(g_hwnd, WM_CLOSE, 0, 0);
    else if (p == "drag") beginDrag();
    return;
  }
  // 빠른 작업은 UI 스레드에서 바로
  if (action == "remember-session") { api::saveSession(); if (!id.empty()) reply(id, true, 200, "{}"); return; }
  if (action == "forget-session") { api::forgetSession(); if (!id.empty()) reply(id, true, 200, "{}"); return; }

  // 무거운 작업(HTTP·VPN연결·PowerShell)은 백그라운드 스레드 → 결과만 UI로 (창 멈춤 방지)
  if (action == "api") {
    auto pl = m["payload"];
    std::string path = pl.value("path", "");
    std::string method = pl.value("method", "GET");
    std::string body = pl.contains("body") && !pl["body"].is_null() ? pl["body"].dump() : "";
    std::thread([id, path, method, body]() {
      try {
        api::Result res = api::handle(path, method, body);
        PostMessageW(g_hwnd, WM_BRIDGE_REPLY, 0,
                     (LPARAM) new BridgeReply{ id, res.body, res.ok, res.status });
      } catch (const std::exception& e) {
        crashWrite(std::string("api-thread exception: ") + e.what());
        PostMessageW(g_hwnd, WM_BRIDGE_REPLY, 0, (LPARAM) new BridgeReply{ id, "null", false, 0 });
      } catch (...) {
        crashWrite("api-thread unknown exception");
        PostMessageW(g_hwnd, WM_BRIDGE_REPLY, 0, (LPARAM) new BridgeReply{ id, "null", false, 0 });
      }
    }).detach();
    return;
  }
  if (action == "logout") {
    std::thread([id]() {
      try {
        api::logout();
      } catch (const std::exception& e) { crashWrite(std::string("logout-thread exception: ") + e.what()); }
        catch (...) { crashWrite("logout-thread unknown exception"); }
      PostMessageW(g_hwnd, WM_BRIDGE_REPLY, 0, (LPARAM) new BridgeReply{ id, "{}", true, 200 });
    }).detach();
    return;
  }
  if (action == "try-autologin") {
    std::thread([id]() {
      std::string u;
      try {
        u = api::tryAutoLogin();
      } catch (const std::exception& e) { crashWrite(std::string("autologin-thread exception: ") + e.what()); }
        catch (...) { crashWrite("autologin-thread unknown exception"); }
      PostMessageW(g_hwnd, WM_BRIDGE_REPLY, 0,
                   (LPARAM) new BridgeReply{ id, u.empty() ? "null" : u, true, 200 });
    }).detach();
    return;
  }
}

// WebResourceRequested: 암호화 내장 리소스를 메모리 복호화해서 제공
static HRESULT onResourceRequested(ICoreWebView2Environment* env, ICoreWebView2WebResourceRequestedEventArgs* args) {
  wil::com_ptr<ICoreWebView2WebResourceRequest> req;
  args->get_Request(&req);
  wil::unique_cotaskmem_string uri;
  req->get_Uri(&uri);
  std::wstring u = uri.get();
  // https://app.mypcbang/<path>
  std::wstring prefix = std::wstring(L"https://") + kVHost;
  if (u.rfind(prefix, 0) != 0) return S_OK;
  std::string path = "/" ;
  {
    std::wstring rest = u.substr(prefix.size());
    if (rest.empty() || rest == L"/") rest = L"/index.html";
    path.assign(rest.begin(), rest.end());
    auto q = path.find('?'); if (q != std::string::npos) path = path.substr(0, q);
  }
  resources::Asset a = resources::get(path);
  if (a.mime.empty()) return S_OK;

  // 메모리 스트림 생성
  wil::com_ptr<IStream> stream;
  stream.attach(SHCreateMemStream(a.bytes.data(), (UINT)a.bytes.size()));
  std::wstring headers = L"Content-Type: " + std::wstring(a.mime.begin(), a.mime.end()) +
                         L"\r\nCache-Control: no-store";
  wil::com_ptr<ICoreWebView2WebResourceResponse> resp;
  env->CreateWebResourceResponse(stream.get(), 200, L"OK", headers.c_str(), &resp);
  args->put_Response(resp.get());
  return S_OK;
}

// WebView2 초기화
static void initWebView() {
  // WebView2 캐시를 AppData\Local\mypcbang 에 저장 → exe 옆 폴더 생성 방지
  wchar_t appdata[MAX_PATH]{};
  GetEnvironmentVariableW(L"LOCALAPPDATA", appdata, MAX_PATH);
  std::wstring udFolder = std::wstring(appdata) + L"\\mypcbang\\wv2";
  CreateCoreWebView2EnvironmentWithOptions(nullptr, udFolder.c_str(), nullptr,
    Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
      [](HRESULT, ICoreWebView2Environment* env) -> HRESULT {
        env->CreateCoreWebView2Controller(g_hwnd,
          Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
            [env](HRESULT, ICoreWebView2Controller* controller) -> HRESULT {
              g_controller = controller;
              g_controller->get_CoreWebView2(&g_webview);

              // 보안: 우클릭/개발자도구/줌 비활성화
              wil::com_ptr<ICoreWebView2Settings> st;
              g_webview->get_Settings(&st);
              st->put_AreDefaultContextMenusEnabled(FALSE);
              st->put_AreDevToolsEnabled(FALSE);     // 운영 빌드: 개발자도구 차단
              st->put_IsZoomControlEnabled(FALSE);
              st->put_IsStatusBarEnabled(FALSE);

              // 창 크기에 맞게
              RECT rc; GetClientRect(g_hwnd, &rc);
              g_controller->put_Bounds(rc);

              // 리소스 가로채기(암호화 내장 UI 제공)
              g_webview->AddWebResourceRequestedFilter(L"*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
              EventRegistrationToken t1;
              g_webview->add_WebResourceRequested(
                Callback<ICoreWebView2WebResourceRequestedEventHandler>(
                  [env](ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs* a) -> HRESULT {
                    return onResourceRequested(env, a);
                  }).Get(), &t1);

              // JS → C++ 메시지
              EventRegistrationToken t2;
              g_webview->add_WebMessageReceived(
                Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                  [](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* a) -> HRESULT {
                    wil::unique_cotaskmem_string msg;
                    if (SUCCEEDED(a->get_WebMessageAsJson(&msg))) onWebMessage(msg.get());
                    return S_OK;
                  }).Get(), &t2);

              g_webview->Navigate((std::wstring(L"https://") + kVHost + L"/index.html").c_str());
              return S_OK;
            }).Get());
        return S_OK;
      }).Get());
}

LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_SIZE:
      if (g_controller) { RECT rc; GetClientRect(hwnd, &rc); g_controller->put_Bounds(rc); }
      applyRoundedCorners(hwnd);
      return 0;
    case WM_SHOWDUP:                 // 다른 인스턴스가 깨움 → 중복 팝업
      ShowWindow(hwnd, SW_RESTORE); SetForegroundWindow(hwnd);
      postToJs(json{{"event", "duplicate"}});
      return 0;
    case WM_BRIDGE_REPLY: {          // 백그라운드 작업 결과 → JS 응답 (UI 스레드)
      BridgeReply* r = (BridgeReply*)lp;
      reply(r->id, r->ok, r->status, r->body);
      delete r;
      return 0;
    }
    case WM_DESTROY:
      vpn::disconnect(); watcher::stop(); PostQuitMessage(0); return 0;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, PWSTR, int) {
  // (안티디버그 제거 — 백신 오탐(Wacapew.A!ml) 유발 요소 제거)

  // 단일 인스턴스 — 이미 실행 중이면 기존 창을 깨우고 종료(중복 팝업)
  HANDLE mtx = CreateMutexW(nullptr, TRUE, kMutex);
  if (GetLastError() == ERROR_ALREADY_EXISTS) {
    HWND ex = FindWindowW(kClass, nullptr);
    if (ex) PostMessageW(ex, WM_SHOWDUP, 0, 0);
    return 0;
  }

  // 2.5) 이전 실행이 강제 종료/크래시되어 남은 VPN 프로필 정리 (흔적 제거)
  vpn::disconnect();

  // 3) 서버 주소(문자열 암호화 → 복호화). 운영 시 HTTPS 도메인.
  //    개발: L"http://localhost:3000"  /  운영: L"https://api.mypcbang.com"
  api::setBaseUrl(L"https://api.mypcbang.com");

  // 4) 창 등록/생성 (테두리 없음)
  HICON appIcon = LoadIconW(hInst, MAKEINTRESOURCEW(1));   // app.rc 의 MY 아이콘
  WNDCLASSW wc{}; wc.lpfnWndProc = WndProc; wc.hInstance = hInst; wc.lpszClassName = kClass;
  wc.hCursor = LoadCursor(nullptr, IDC_ARROW); wc.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
  wc.hIcon = appIcon;
  RegisterClassW(&wc);

  int W = 1180, H = 760;
  int sx = (GetSystemMetrics(SM_CXSCREEN) - W) / 2, sy = (GetSystemMetrics(SM_CYSCREEN) - H) / 2;
  g_hwnd = CreateWindowExW(0, kClass, L"mypcbang", WS_POPUP, sx, sy, W, H, nullptr, nullptr, hInst, nullptr);

  if (appIcon) { SendMessageW(g_hwnd, WM_SETICON, ICON_BIG, (LPARAM)appIcon); SendMessageW(g_hwnd, WM_SETICON, ICON_SMALL, (LPARAM)appIcon); }
  applyRoundedCorners(g_hwnd);
  ShowWindow(g_hwnd, SW_SHOW);
  initWebView();

  // 5) 게임 감지(방법 B) — 감지되면 서버 보고
  watcher::start([](const std::string& game) {
    if (!game.empty()) api::handle("/detection/report", "POST", json{{"detectedGame", game}}.dump());
  });

  MSG msg;
  while (GetMessageW(&msg, nullptr, 0, 0)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
  ReleaseMutex(mtx); CloseHandle(mtx);
  return 0;
}
