# ============================================================
#  mypcbang VPN 클라이언트 (C++ + WebView2)
#  Visual Studio 2022 에서 "폴더 열기"로 이 폴더를 열면 CMake가 자동 구성됩니다.
#  필요한 외부 패키지(WebView2 SDK, nlohmann/json)는 빌드 시 자동 다운로드됩니다.
# ============================================================
cmake_minimum_required(VERSION 3.21)
project(mypcbang LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# VC++ 런타임을 exe에 정적 링크(/MT) → VC++ 재배포패키지 없이 Win10/11 어디서나 실행
# (CMake 3.21 → CMP0091=NEW 기본, MSVC_RUNTIME_LIBRARY 사용 가능)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

if(NOT WIN32)
  message(FATAL_ERROR "이 클라이언트는 Windows 전용입니다.")
endif()

include(FetchContent)

# ---- WebView2 SDK (NuGet 패키지 자동 다운로드) ----
FetchContent_Declare(
  webview2
  URL https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.2792.45
  DOWNLOAD_EXTRACT_TIMESTAMP ON
)
FetchContent_GetProperties(webview2)
if(NOT webview2_POPULATED)
  FetchContent_Populate(webview2)
endif()
set(WV2_DIR ${webview2_SOURCE_DIR})
set(WV2_INCLUDE ${WV2_DIR}/build/native/include)
set(WV2_LIB ${WV2_DIR}/build/native/x64/WebView2LoaderStatic.lib)

# ---- WIL (Windows Implementation Library, 헤더 전용) ----
FetchContent_Declare(
  wil
  URL https://www.nuget.org/api/v2/package/Microsoft.Windows.ImplementationLibrary/1.0.240803.1
  DOWNLOAD_EXTRACT_TIMESTAMP ON
)
FetchContent_GetProperties(wil)
if(NOT wil_POPULATED)
  FetchContent_Populate(wil)
endif()
set(WIL_INCLUDE ${wil_SOURCE_DIR}/include)

# ---- nlohmann/json (단일 헤더) ----
FetchContent_Declare(
  json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/include.zip
  DOWNLOAD_EXTRACT_TIMESTAMP ON
)
FetchContent_GetProperties(json)
if(NOT json_POPULATED)
  FetchContent_Populate(json)
endif()
set(JSON_INCLUDE ${json_SOURCE_DIR}/single_include)

# ---- 실행 파일 ----
add_executable(mypcbang WIN32
  src/main.cpp
  src/Api.cpp
  src/Vpn.cpp
  src/Watcher.cpp
  src/Security.cpp
  src/Resources.cpp
  app.rc            # 프로그램 아이콘 (MY)
)

target_include_directories(mypcbang PRIVATE
  ${WV2_INCLUDE}
  ${WIL_INCLUDE}
  ${JSON_INCLUDE}
  ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# 소스는 UTF-8 (한글 주석) — MSVC가 코드페이지로 오인하지 않게
target_compile_options(mypcbang PRIVATE /utf-8 /EHsc)

target_link_libraries(mypcbang PRIVATE
  ${WV2_LIB}
  Shlwapi.lib Shcore.lib Version.lib Shell32.lib
  winhttp.lib       # HTTPS
  Crypt32.lib       # DPAPI (자동로그인 토큰 암호화)
  Dwmapi.lib        # 둥근 창
  Comctl32.lib
)

# 콘솔창 없이 GUI 서브시스템
set_target_properties(mypcbang PROPERTIES
  LINK_FLAGS "/SUBSYSTEM:WINDOWS /ENTRY:wWinMainCRTStartup"
)

# 리소스(웹 UI)는 빌드 전에 tools/pack.js 로 암호화 헤더(src/Resources.cpp)를 생성합니다.
# 자세한 건 BUILD.md 참고.
