#include "Vpn.h"
#include <windows.h>
#include <string>
#include <vector>

namespace {
const wchar_t* kProfile = L"mypcbang_vpn";   // 임시 프로필명
bool g_connected = false;

// PowerShell/명령을 창 없이 실행하고 종료코드 반환
DWORD runHidden(const std::wstring& cmd) {
  std::wstring full = L"cmd.exe /c " + cmd;
  STARTUPINFOW si{}; si.cb = sizeof(si); si.dwFlags = STARTF_USESHOWWINDOW; si.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION pi{};
  std::vector<wchar_t> buf(full.begin(), full.end()); buf.push_back(0);
  if (!CreateProcessW(nullptr, buf.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi))
    return (DWORD)-1;
  WaitForSingleObject(pi.hProcess, 30000);
  DWORD code = 0; GetExitCodeProcess(pi.hProcess, &code);
  CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
  return code;
}
std::wstring q(const std::wstring& s) { return L"\"" + s + L"\""; }
}  // namespace

namespace vpn {

bool connect(const Creds& c) {
  disconnect();  // 잔여 프로필 정리

  // 호스트에서 포트 제거 (IP:port 형태로 들어올 경우 IP만 추출)
  std::wstring host = c.host;
  auto colon = host.find(L':');
  if (colon != std::wstring::npos) host = host.substr(0, colon);

  // 1) 임시 VPN 프로필 생성 (프로토콜에 따라 L2TP/PPTP 분기)
  bool isPptp = (c.protocol == L"pptp");
  std::wstring tunnelArgs = isPptp
    ? L"-TunnelType Pptp -AuthenticationMethod MSChapv2 -EncryptionLevel Optional"
    : L"-TunnelType L2tp -L2tpPsk '" + c.psk + L"' -AuthenticationMethod MSChapv2 -EncryptionLevel Optional";

  std::wstring add =
    L"powershell -NonInteractive -WindowStyle Hidden -Command "
    L"\"Add-VpnConnection -Name '" + std::wstring(kProfile) + L"' -ServerAddress '" + host + L"' "
    + tunnelArgs + L" -Force -RememberCredential:$true -PassThru | Out-Null\"";
  if (runHidden(add) != 0) return false;

  // 2) rasdial 로 다이얼 (자격증명은 인자 — 사용 직후 프로세스 종료)
  std::wstring dial = L"rasdial " + q(kProfile) + L" " + q(c.username) + L" " + q(c.password);
  DWORD r = runHidden(dial);
  g_connected = (r == 0);
  if (!g_connected) disconnect();
  return g_connected;
}

void disconnect() {
  // Remove-VpnConnection 은 'Connected' 상태면 삭제를 거부하므로,
  // 완전히 끊긴 뒤 삭제하도록 반복(끊기→확인→삭제). 흔적 제거.
  std::wstring n = kProfile;
  std::wstring ps =
    L"powershell -NonInteractive -WindowStyle Hidden -Command \""
    L"$n='" + n + L"';"
    L"for($i=0;$i -lt 8;$i++){"
    L"  cmd /c rasdial $n /disconnect *> $null;"
    L"  Start-Sleep -Milliseconds 400;"
    L"  $c = Get-VpnConnection -Name $n -ErrorAction SilentlyContinue;"
    L"  if(-not $c){ break }"
    L"  if($c.ConnectionStatus -eq 'Disconnected'){ Remove-VpnConnection -Name $n -Force -ErrorAction SilentlyContinue }"
    L"}\"";
  runHidden(ps);
  g_connected = false;
}

bool isConnected() { return g_connected; }

}  // namespace vpn
