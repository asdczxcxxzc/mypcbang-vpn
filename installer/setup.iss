; ============================================================
;  mypcbang 설치 스크립트 (Inno Setup)
;  - 바탕화면 바로가기 생성
;  - 설치파일(setup.exe) 설치 후 자동 삭제
;  - 숨김/무난한 경로에 설치(일반 사용자가 찾기 어렵게)
;
;  빌드: Inno Setup(무료) 설치 후 이 파일을 컴파일 → Output\mypcbang_setup.exe
; ============================================================

#define AppName "mypcbang"
#define AppExe "mypcbang.exe"
; 일반(가시) 폴더로 설치 — 숨김/시스템 속성은 백신 오탐을 유발하므로 제거
#define InstDirName "mypcbang"

[Setup]
AppId={{8F2A6C31-9B4E-4D7A-AE21-mypcbang000}
AppName={#AppName}
AppVersion=1.0.0
DefaultDirName={localappdata}\{#InstDirName}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableWelcomePage=no
UninstallDisplayIcon={app}\{#AppExe}
; 설치 폴더/파일을 탐색기에서 잘 안 보이게(숨김 속성은 [Run] 에서 부여)
PrivilegesRequired=lowest
OutputBaseFilename=mypcbang_setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile=
DisableFinishedPage=yes

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\client\build\Release\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
; 게임 이미지(코드는 exe에 암호화 내장, 이미지는 파일로)
Source: "..\client\web\img\*"; DestDir: "{app}\web\img"; Flags: ignoreversion recursesubdirs createallsubdirs
; WebView2 런타임 부트스트래퍼 (Win10 등 미설치 PC용 — 임시폴더에 풀고 설치 후 삭제)
Source: "MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
; 바탕화면 바로가기 (항상 생성)
Name: "{commondesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"

[Run]
; 0) WebView2 런타임 설치 (Win10 등 미설치 시에만 — 온라인 부트스트래퍼)
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "필수 구성요소(WebView2) 설치 중..."; Flags: waituntilterminated; Check: NeedsWebView2
; 설치 직후 실행 (숨김 속성/자동삭제 제거 — 백신 오탐 방지)
Filename: "{app}\{#AppExe}"; Description: "{#AppName} 실행"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
{ WebView2 Evergreen 런타임이 이미 있으면 부트스트래퍼 실행 생략 }
function Wv2Installed(Root: Integer; Key: String): Boolean;
var v: String;
begin
  Result := RegQueryStringValue(Root, Key, 'pv', v) and (v <> '') and (v <> '0.0.0.0');
end;
function NeedsWebView2: Boolean;
begin
  Result := not (
    Wv2Installed(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') or
    Wv2Installed(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') or
    Wv2Installed(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}')
  );
end;
