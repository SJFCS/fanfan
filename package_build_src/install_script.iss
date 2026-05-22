; 基础信息（按需修改）
#define MyAppName        "FanFan"
#define MyAppVersion     "1.4.3.3"
#define MyAppID          "B74B7C7D-C21A-42B1-B419-9D63B484EEF4"

[Files]
; 包含所有临时资源文件
Source: "{Embedding}\dll\*";                        DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\background_finish.png";        DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\background_installing.png";    DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\background_welcome.png";       DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\background_welcome_more.png";  DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\button_close.png";             DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\button_finish.png";            DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\button_minimize.png";          DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\button_browse.png";            DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\button_setup_or_next.png";     DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\button_setup_update.png";      DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "License";                                  DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\checkbox.png";                 DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\progressbar_background.png";   DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
Source: "{Embedding}\progressbar_foreground.png";   DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
#ifdef ShowSlidePictures
; 分辨率 600x332 96dpi 可等比例缩放
Source: "{Embedding}\slides\*";                     DestDir: "{tmp}"; Flags: dontcopy solidbreak; Attribs: hidden system
#endif

; 软件主程序文件
Source: "{app}\Pengu\core.dll";                     DestDir: "{app}"; Flags: ignoreversion
Source: "{app}\Pengu\手动安装.bat";                 DestDir: "{app}"; Flags: ignoreversion
Source: "{app}\Pengu\.pengu\*";                     DestDir: "{commonappdata}\.pengu\"; Flags: recursesubdirs createallsubdirs ignoreversion
; ACE 限制器
Source: "{app}\ACE\ace.ps1";                        DestDir: "{app}"; Flags: ignoreversion
Source: "{app}\ACE\LimitSGuard\*";                  DestDir: "{app}\LimitSGuard"; Flags: ignoreversion
Source: "{app}\ACE\LimitSGuardDATA\*";              DestDir: "{code:GetRealUserAppData}\Hutao"; Flags: ignoreversion
; 视频头像资源
Source: "{app}\assets\*";                           DestDir: "{commonappdata}\.pengu\plugins\sona\assets"; Flags: recursesubdirs createallsubdirs ignoreversion
; 目录图标
Source: "{app}\icon.ico";                           DestDir: "{app}"; Flags: ignoreversion


; [Dirs]
; ; 创建一个隐藏的系统文件夹存放卸载程序
; Name: "{app}"; Flags: uninsneveruninstall 
; Name: "{commonappdata}\.pengu"; Flags: uninsneveruninstall 

[Icons]
; {autodesktop} 桌面快捷方式
; {autoprograms} 开始菜单快捷方式
; Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}"; IconFilename: "{app}\icon.ico"
Name: "{autoprograms}\饭饭的小助手"; Filename: "{app}"; IconFilename: "{app}\icon.ico"

; [Run]
; Filename: "{app}\Pengu.exe"; Parameters: "--install"; Flags: runhidden waituntilterminated; StatusMsg: "正在配置 Pengu Loader..."
; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\LimitSGuard\install.ps1"""; Flags: runhidden waituntilterminated; StatusMsg: "正在配置 ACE 限制器组件..."

[UninstallRun]
; 卸载时运行反注册程序
; Filename: "{app}\Pengu.exe"; Parameters: "--uninstall"; Flags: runhidden waituntilterminated; StatusMsg: "正在移除 Pengu Loader 配置..."; RunOnceId: "UninstallPenguLoaderConfig"
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; RunOnceId: "CleanLimitSGuardJob"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\LimitSGuard\Uninstall-ACE.ps1"""; Flags: runhidden waituntilterminated; StatusMsg: "正在卸载 ACE 限制器组件..."

[Registry]
Root: HKLM64; Subkey: "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\LeagueClientUx.exe"; \
    ValueType: string; ValueName: "Debugger"; \
    ValueData: "rundll32 ""{app}\core.dll"", #6000"; \
    Flags: uninsdeletevalue; Check: IsWin64

[UninstallDelete]
; 卸载时删除安装目录下的所有文件及文件夹
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{commonappdata}\.pengu";

; Custom Config
#include ".\{customize}\Config.iss"
; Custom UI
#include ".\{customize}\Code.iss"
