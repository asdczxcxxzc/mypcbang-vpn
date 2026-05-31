#pragma once
#include <string>
#include <vector>

// 웹 UI(HTML/CSS/JS/이미지)는 빌드 시 AES로 암호화되어 exe에 내장되고,
// 실행 시 메모리에서만 복호화되어 WebView2 가상 호스트로 제공된다.
// (tools/pack.js 가 web/ 폴더를 암호화해 Resources_gen.inc 를 생성)
namespace resources {

struct Asset {
  std::string mime;
  std::vector<unsigned char> bytes;  // 복호화된 내용
};

// 가상 경로(예: "/index.html")로 복호화된 자산을 얻는다. 없으면 빈 mime.
Asset get(const std::string& path);

}  // namespace resources
