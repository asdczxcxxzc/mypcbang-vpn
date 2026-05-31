#include "Resources.h"
#include <windows.h>
#include <fstream>
#include <map>
#include <string>

// 웹 UI 제공.
//  - 운영 빌드: tools/pack.js 가 web/ 폴더를 XOR/AES로 암호화해 Resources_gen.inc 를 생성.
//    (kEmbedded 테이블에 {경로 → 암호화 바이트}) → 여기서 메모리 복호화해 제공.
//  - 개발 빌드: 생성 파일이 없으면 exe 옆 web/ 폴더에서 직접 읽음.
//
//  Resources_gen.inc 형식 예:
//    static const unsigned char ENC_KEY[] = { ... };
//    struct Emb { const char* path; const unsigned char* data; size_t len; const char* mime; };
//    static const Emb kEmbedded[] = { ... };
//    static const size_t kEmbeddedCount = ...;

#if __has_include("Resources_gen.inc")
  #include "Resources_gen.inc"
  #define HAVE_EMBEDDED 1
#endif

namespace {
std::string mimeFor(const std::string& path) {
  auto ext = path.substr(path.find_last_of('.') + 1);
  if (ext == "html") return "text/html; charset=utf-8";
  if (ext == "js")   return "text/javascript; charset=utf-8";
  if (ext == "css")  return "text/css; charset=utf-8";
  if (ext == "svg")  return "image/svg+xml";
  if (ext == "png")  return "image/png";
  if (ext == "jpg" || ext == "jpeg") return "image/jpeg";
  if (ext == "webp") return "image/webp";
  return "application/octet-stream";
}

// 개발용: exe 옆 web/ 폴더에서 읽기
bool readDisk(const std::string& path, std::vector<unsigned char>& out) {
  wchar_t exe[MAX_PATH]; GetModuleFileNameW(nullptr, exe, MAX_PATH);
  std::wstring dir(exe); dir = dir.substr(0, dir.find_last_of(L"\\/"));
  std::wstring full = dir + L"\\web" + std::wstring(path.begin(), path.end());
  std::ifstream f(full, std::ios::binary);
  if (!f) return false;
  out.assign(std::istreambuf_iterator<char>(f), {});
  return true;
}
}  // namespace

namespace resources {

Asset get(const std::string& path) {
  Asset a;
#ifdef HAVE_EMBEDDED
  for (size_t i = 0; i < kEmbeddedCount; i++) {
    if (path == kEmbedded[i].path) {
      a.mime = kEmbedded[i].mime;
      a.bytes.resize(kEmbedded[i].len);
      for (size_t k = 0; k < kEmbedded[i].len; k++)         // XOR 복호화(메모리에서만)
        a.bytes[k] = kEmbedded[i].data[k] ^ ENC_KEY[k % sizeof(ENC_KEY)];
      return a;
    }
  }
#endif
  std::vector<unsigned char> buf;
  if (readDisk(path, buf)) { a.mime = mimeFor(path); a.bytes = std::move(buf); }
  return a;
}

}  // namespace resources
