


; 禁止“旧版覆盖新版”（开启后，若检测到系统已安装更高版本，将阻止继续安装）
#define OnlyInstallNewVersion
; 指定是否要注册相关后缀名  测试用于卡住进度，一个很好的使用例子
#define LimitACE
; 指定是否在安装时轮播图片
; #define ShowSlidePictures
; 是否启用标题栏官网链接（点击标题打开 URL）
; #define EnableTitleLink
; ; 启用安装密码
; #define EnableSetupPasswordCheck
; ; 启用更新密码
; #define EnableUpdatePasswordCheck
; ; 定义密码
; #define InstallerPassword "change_me"

; 安装前进程拦截（点击“一键安装/一键升级”时检查，PrepareToInstall 再兜底）
; 目前逻辑支持到 InstallBlockProcess5
#define EnableInstallProcessBlockCheck
#ifdef EnableInstallProcessBlockCheck
  #define InstallBlockProcess1 "LeagueClientUx.exe"
  #define InstallBlockProcess2 "LeagueClient.exe"
  #define InstallBlockProcess3 "LeagueClientUxRender.exe"
  #define InstallBlockProcess3 "Hutao.exe"
#endif

; 是否显示“已阅读并同意”区块
#define ShowLicenseAgreement
  ; License 文件需与 install_script.iss 同目录
  #define LicenseAgreementUseText
  #define LicenseTextTitle        "最终用户许可协议"
  ; Inno Setup 里 TColor 用的是 BGR 顺序：0x00BBGGRR。
  ; 把 #RRGGBB 转成 0x00BBGGRR 的规则：
  ; RR GG BB 交换成 BB GG RR
  ; 前面再加 0x00
  ; 所以：
  ; #0066CC => 0x00CC6600）
  ; #A62005 （R=A6 G=20 B=05）→ 0x000520A6
  ; #781704 （R=00 G=FF B=AA）→ 0x00041778
  #ifndef LinkColorNormal
    #define LinkColorNormal 0x00CC6600
  #endif
  #ifndef LinkColorHover
    #define LinkColorHover  0x000520A6
  #endif
  #ifndef LinkColorDown
    #define LinkColorDown   0x00041778
  #endif


[Setup]
AppName                         = {#MyAppName}
AppVerName                      = {#MyAppName} v{#MyAppVersion}
AppId                           = {{{#MyAppID}}
AppVersion                      = {#MyAppVersion}
DefaultDirName                  = {commonpf64}\{#MyAppName}

OutputDir                       = ".\{output}"
OutputBaseFilename              = {#MyAppName}-v{#MyAppVersion}-setup
SetupIconFile                   = ".\MySetup.ico"

UninstallDisplayName            = {#MyAppName}
UninstallDisplayIcon            = {app}\unins000.exe,0

PrivilegesRequired              = admin
; 防止同时运行多个安装程序实例
SetupMutex                      = MyAppSetup_{#MyAppID},Global\MyAppSetup_{#MyAppID}

Compression                     = lzma2/ultra64
SolidCompression                = yes

DisableDirPage                  = yes
DisableProgramGroupPage         = yes
DisableReadyPage                = yes
DisableReadyMemo                = yes

ChangesAssociations             = no
ShowLanguageDialog              = no
LanguageDetectionMethod         = uilanguage
WizardStyle                     = modern

ArchitecturesAllowed            = x64compatible
ArchitecturesInstallIn64BitMode = x64compatible
MinVersion                      = 0,10.0

[Languages]
Name: "english";           MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified";   MessagesFile: ".\{lang}\ChineseSimplified.isl"

[Messages]
chinesesimplified.SetupAppTitle={#MyAppName} 安装程序
english.SetupAppTitle={#MyAppName} Setup


[CustomMessages]
; English
english.wizardform_title                    ={#MyAppName} V{#MyAppVersion} Setup
english.wizardform_title_url                =https://example.com/
english.installing_label_text               =Installing
english.no_change_destdir_warning           =Detected an existing installation. The install directory cannot be changed.
english.init_setup_outdated_version_warning =A newer version is already installed (%1). The version you are trying to install is %2. Setup will exit.
english.license_accept_prefix               =I have read and agree to
english.limitace_prefix                     =Optimize ACE Performance (Recommended)
english.install_location_label              =Install location
english.change_dir_button                   =Change...
english.custom_install_expand               =Custom install ▼
english.custom_install_collapse             =Custom install ▲
english.password_prompt_title              =Password
english.password_prompt_text               =Please enter the setup password:
english.password_incorrect                 =Incorrect password.
english.install_blocked_lol_client_running =Detected that LOL Client or SGUARD limiter is running. Please close them completely and try again.
; 简体中文
chinesesimplified.wizardform_title                    ={#MyAppName} V{#MyAppVersion} 安装程序
chinesesimplified.wizardform_title_url                =https://example.com/
chinesesimplified.installing_label_text               =正在安装
chinesesimplified.no_change_destdir_warning           =检测到已安装，安装目录不可更改。
chinesesimplified.init_setup_outdated_version_warning =检测到已安装更高版本（%1），当前安装版本为 %2，将阻止降级安装并退出。
chinesesimplified.license_accept_prefix               =已阅读并同意
chinesesimplified.limitace_prefix                     =优化ACE性能（推荐）
chinesesimplified.install_location_label              =安装位置
chinesesimplified.change_dir_button                   =更改目录...
chinesesimplified.custom_install_expand               =自定义安装 ▼
chinesesimplified.custom_install_collapse             =自定义安装 ▲
chinesesimplified.password_prompt_title               =密码验证
chinesesimplified.password_prompt_text                =请输入安装密码：
chinesesimplified.password_incorrect                  =密码不正确。
chinesesimplified.install_blocked_lol_client_running  =检测到 LOL 客户端或 SGUARD 限制器正在运行。请完全关闭后再试。

