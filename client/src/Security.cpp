#include "Security.h"
#include <windows.h>

namespace security {

bool isBeingDebugged() {
  if (IsDebuggerPresent()) return true;
  BOOL remote = FALSE;
  CheckRemoteDebuggerPresent(GetCurrentProcess(), &remote);
  if (remote) return true;
  // PEB BeingDebugged (간단 확인)
#ifdef _WIN64
  auto peb = (BYTE*)__readgsqword(0x60);
  if (peb && peb[2]) return true;
#endif
  return false;
}

// 빌드 시 XOR로 난독화된 문자열(바이트) → 런타임 복호화.
// (tools 에서 같은 키로 인코딩. `strings` 덤프 방어용)
static const unsigned char KEY[] = { 0x5A, 0x3C, 0x91, 0x77, 0xC4, 0x2E, 0x68, 0xB1 };
std::wstring dec(const unsigned char* data, size_t len) {
  std::string out; out.resize(len);
  for (size_t i = 0; i < len; i++) out[i] = (char)(data[i] ^ KEY[i % sizeof(KEY)]);
  return std::wstring(out.begin(), out.end());
}

void wipe(void* p, size_t len) { if (p && len) SecureZeroMemory(p, len); }
void wipe(std::string& s) { if (!s.empty()) { SecureZeroMemory(&s[0], s.size()); s.clear(); } }
void wipe(std::wstring& s) { if (!s.empty()) { SecureZeroMemory(&s[0], s.size() * sizeof(wchar_t)); s.clear(); } }

}  // namespace security
