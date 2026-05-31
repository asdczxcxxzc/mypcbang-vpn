#pragma once
#include <string>

// L2TP/IPsec 연결 관리.
// 임시 VPN 프로필을 만들어 연결하고, 끊을 때 프로필을 삭제해 흔적을 남기지 않는다.
// 자격증명은 메모리에서만 다루고 사용 후 0으로 덮어쓴다.
namespace vpn {

struct Creds {
  std::wstring host;
  int port = 1701;
  std::wstring username;
  std::wstring password;
  std::wstring psk;
};

// 연결: 임시 프로필 생성 → rasdial. 성공 시 true.
bool connect(const Creds& c);

// 해제: rasdial /disconnect → 프로필 삭제.
void disconnect();

bool isConnected();

}  // namespace vpn
