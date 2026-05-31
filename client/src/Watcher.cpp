#include "Watcher.h"
#include <windows.h>
#include <tlhelp32.h>
#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <algorithm>
#include <exception>

namespace {
// 게임 표시명(DB Game.name 과 정확히 일치) → 실행 파일명(반드시 소문자, 공백 유지).
// 한 게임에 프로세스가 여러 개면 같은 이름으로 여러 줄 추가(런처/인게임 모두 감지).
struct G { const char* name; const wchar_t* exe; };
const std::vector<G> kGames = {
  { "배틀그라운드",        L"tslgame.exe" },
  // 롤: 인게임 'League of Legends.exe', 로비 'LeagueClient*.exe'
  { "리그오브레전드",      L"league of legends.exe" },
  { "리그오브레전드",      L"leagueclient.exe" },
  { "리그오브레전드",      L"leagueclientux.exe" },
  { "발로란트",            L"valorant-win64-shipping.exe" },
  { "발로란트",            L"valorant.exe" },
  { "로스트아크",          L"lostark.exe" },
  { "서든어택",            L"suddenattack.exe" },
  { "오버워치2",           L"overwatch.exe" },
  { "FIFA 온라인 4",       L"fifaonline4_kamuse.exe" },
  { "FIFA 온라인 4",       L"fifaonline4_x64.exe" },
  { "FIFA 온라인 4",       L"fifa4.exe" },
  { "디아블로4",           L"diablo iv.exe" },
  { "스타크래프트",        L"starcraft.exe" },
  { "스타크래프트",        L"sc2_x64.exe" },
  { "월드오브워크래프트",  L"wow.exe" },
  { "TFT",                 L"league of legends.exe" },   // TFT는 롤 클라이언트 공유
  { "이터널리턴",          L"eternalreturn.exe" },
  { "검은사막",            L"blackdesert64.exe" },
  { "메이플 리니지2",      L"l2.exe" },
  { "하스스톤",            L"hearthstone.exe" },
  { "패스오브엑자일2",     L"pathofexile.exe" },
  { "패스오브엑자일2",     L"pathofexile_x64.exe" },
  { "패스오브엑자일2",     L"pathofexilesteam.exe" },
  { "디아블로2",           L"d2r.exe" },
  { "리니지",              L"lin.bin" },
  { "리니지",              L"lineage.exe" },
  { "리니지2",             L"l2.exe" },
  { "리니지2",             L"lineage2.exe" },
  { "리니지 클래식",       L"lc.exe" },                    // 실측 확인: LC.exe
  { "아이온",              L"aion.bin" },
  { "아이온",              L"aion.exe" },
  { "아이온2",             L"aion2.exe" },
  { "아키에이지",          L"archeage.exe" },
  { "블레이드앤소울",      L"bns.exe" },
  { "카발",                L"cabalmain.exe" },
  { "클로저스",            L"closers.exe" },
  { "사이퍼즈",            L"cyphers.exe" },
  { "엘소드",              L"elsword.exe" },
  { "파이널판타지14",      L"ffxiv_dx11.exe" },
  { "파이널판타지14",      L"ffxiv.exe" },
  { "퍼스트디센던트",      L"m1-win64-shipping.exe" },
  { "로스트사가",          L"lostsaga.exe" },
  { "마비노기",            L"mabinogi.exe" },
  { "마비노기 영웅전",     L"vindictus.exe" },
  { "미르4",               L"mir4.exe" },
  { "뮤",                  L"mu.exe" },
  { "라그나로크",          L"ragnarok.exe" },
  { "라그나로크",          L"ragexe.exe" },
  { "스톰게이트",          L"stormgate.exe" },
  { "테일즈런너",          L"talesrunner.exe" },
  { "테일즈위버",          L"talesweaver.exe" },
  { "쓰론앤리버티",        L"tl.exe" },
  { "바람의나라",          L"baram.exe" },
};

std::atomic<bool> g_run{false};
std::thread g_thread;

// (진단) 크래시 로그에 한 줄 기록
void wlog(const std::string& line) {
  wchar_t buf[MAX_PATH]{}; DWORD n = GetEnvironmentVariableW(L"TEMP", buf, MAX_PATH);
  std::wstring path = (n ? std::wstring(buf, n) : L"C:\\Temp") + L"\\mypcbang_crash.log";
  HANDLE h = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE,
                         nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (h == INVALID_HANDLE_VALUE) return;
  std::string s = line + "\r\n"; DWORD w = 0;
  WriteFile(h, s.data(), (DWORD)s.size(), &w, nullptr); CloseHandle(h);
}

std::wstring lower(std::wstring s){ std::transform(s.begin(),s.end(),s.begin(),::towlower); return s; }

bool isRunning(const std::wstring& exe) {
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return false;
  PROCESSENTRY32W pe{}; pe.dwSize = sizeof(pe);
  bool found = false;
  if (Process32FirstW(snap, &pe)) {
    do { if (lower(pe.szExeFile) == exe) { found = true; break; } } while (Process32NextW(snap, &pe));
  }
  CloseHandle(snap);
  return found;
}
}  // namespace

namespace watcher {

std::string detectRunningGame() {
  for (auto& g : kGames) if (isRunning(g.exe)) return g.name;
  return "";
}

void killGame(const std::string& displayName) {
  const wchar_t* exe = nullptr;
  for (auto& g : kGames) if (displayName == g.name) { exe = g.exe; break; }
  if (!exe) return;
  std::wstring target = exe;
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return;
  PROCESSENTRY32W pe{}; pe.dwSize = sizeof(pe);
  if (Process32FirstW(snap, &pe)) {
    do {
      if (lower(pe.szExeFile) == target) {
        HANDLE h = OpenProcess(PROCESS_TERMINATE, FALSE, pe.th32ProcessID);
        if (h) { TerminateProcess(h, 0); CloseHandle(h); }
      }
    } while (Process32NextW(snap, &pe));
  }
  CloseHandle(snap);
}

void start(std::function<void(const std::string&)> onDetect) {
  if (g_run) return;
  g_run = true;
  g_thread = std::thread([onDetect]{
    std::string last;
    while (g_run) {
      try {
        std::string g = detectRunningGame();
        if (!g.empty() && g != last) { last = g; if (onDetect) onDetect(g); }
        if (g.empty()) last.clear();
      } catch (const std::exception& e) {
        wlog(std::string("watcher-thread exception: ") + e.what());
      } catch (...) {
        wlog("watcher-thread unknown exception");
      }
      for (int i = 0; i < 50 && g_run; i++) Sleep(100);  // ~5초
    }
  });
}

void stop() {
  g_run = false;
  if (g_thread.joinable()) g_thread.join();
}

}  // namespace watcher
