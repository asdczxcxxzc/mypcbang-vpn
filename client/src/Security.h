#pragma once
#include <string>
#include <windows.h>

// 리버싱 방어 / 메모리 위생 유틸.
namespace security {

// 디버거/분석 탐지. 탐지 시 true (호출부에서 조용히 종료).
bool isBeingDebugged();

// 문자열 복호화 (빌드 시 XOR/AES로 암호화된 상수 → 런타임 복호화).
std::wstring dec(const unsigned char* data, size_t len);

// 메모리 0으로 덮어쓰기 (자격증명/토큰 폐기). SecureZeroMemory 래퍼.
void wipe(void* p, size_t len);
void wipe(std::string& s);
void wipe(std::wstring& s);

}  // namespace security
