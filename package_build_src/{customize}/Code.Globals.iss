type
  TBtnEventProc = procedure(h : hwnd);
  TPBProc = function(h : hwnd; Msg, wParam, lParam : longint) : longint;
  TTimerProc = procedure(HandleW, Msg, idEvent, TimeSys: longword);
  TWinPoint = record
    X : longint;
    Y : longint;
  end;
  TWinRect = record
    Left : longint;
    Top : longint;
    Right : longint;
    Bottom : longint;
  end;
#ifdef EnableInstallProcessBlockCheck
  TProcessEntry32 = record
    dwSize : DWORD;
    cntUsage : DWORD;
    th32ProcessID : DWORD;
    th32DefaultHeapID : longint;
    th32ModuleID : DWORD;
    cntThreads : DWORD;
    th32ParentProcessID : DWORD;
    pcPriClassBase : longint;
    dwFlags : DWORD;
    szExeFile : array[0..259] of Char;
  end;
#endif

const
  // Uninstall key name is "{AppId}_is1"; for GUID-style AppId, it includes the braces.
  PRODUCT_UNINSTALL_REGISTRY_KEY = 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{{#MyAppID}}_is1';
  WM_SYSCOMMAND = $0112;
  WM_SETCURSOR = $0020;
  EM_GETRECT = $00B2;
  EM_SETRECTNP = $00B4;
  // Windows 11+ (DWM) rounded corner preference (best visual quality, antialiased)
  DWMWA_WINDOW_CORNER_PREFERENCE = 33;
  DWMWCP_DEFAULT = 0;
  DWMWCP_DONOTROUND = 1;
  DWMWCP_ROUND = 2;
  DWMWCP_ROUNDSMALL = 3;
  CS_DROPSHADOW = 131072;
  GCL_STYLE = -26;
  ID_BUTTON_ON_CLICK_EVENT = 1;
  GWL_WNDPROC = -4;
#ifdef EnableInstallProcessBlockCheck
  TH32CS_SNAPPROCESS = 2;
  INVALID_HANDLE_VALUE = -1;
#endif
  WIZARDFORM_WIDTH_NORMAL = 600;
  WIZARDFORM_HEIGHT_NORMAL = 400;
  WIZARDFORM_HEIGHT_MORE = 503;
  WIZARDFORM_ANIMATION_STEP = 20;
  MAIN_ACTION_BUTTON_TOP = 290;
  SLIDES_PICTURE_WIDTH = WIZARDFORM_WIDTH_NORMAL;
  SLIDES_PICTURE_HEIGHT = 332;
  SLIDES_PAUSE_SECONDS = 3;

var
  label_wizardform_more_product_already_installed, label_wizardform_title, label_install_text, label_install_progress : TLabel;
  label_wizardform_main : TLabel;
  image_wizardform_background, image_progressbar_background, image_progressbar_foreground, PBOldProc : longint;
  button_minimize, button_close, button_setup_or_next, checkbox_setdefault : hwnd;
  button_change_dir : hwnd;
  label_install_location : TLabel;
  label_custom_install_toggle : TLabel;
#ifdef ShowLicenseAgreement
  checkbox_license : hwnd;
  label_license_accept_prefix : TLabel;
  label_license_link : TLabel;
#ifdef LicenseAgreementUseText
  license_text_form : TSetupForm;
  license_text_memo : TNewMemo;
  license_text_close_button : TNewButton;
#endif
#endif
#ifdef LimitACE
  label_checkbox_limitace_prefix : TLabel;
#endif
#ifdef ShowLicenseAgreement
  link_hover_timer : longword;
  link_license_is_down : boolean;
#endif
  is_wizardform_show_normal, is_installer_initialized, is_wizardform_released, need_to_change_associations : boolean;
  is_main_action_click_busy : boolean;
  is_upgrade_install : boolean;
  has_password_verified : boolean;
#ifdef EnableInstallProcessBlockCheck
  main_action_blocking_message : string;
  main_action_blocking_message_valid : boolean;
#endif
  edit_target_path : TEdit;
  version_installed_before : string;
  // 0=button_setup_or_next, 1=button_setup_update, 2=button_finish
  main_action_button_variant : integer;
  wizardform_animation_timer, slide_picture_timer, slide_pause_timer : longword;
  slide_1_b, slide_2_b, slide_3_b, slide_4_b, slide_1_t, slide_2_t, slide_3_t, slide_4_t : longint;
  cur_pic_no, cur_pic_pos : integer;
  time_counter : integer;

//botva2 API
function ImgLoad(h : hwnd; FileName : PAnsiChar; Left, Top, Width, Height : integer; Stretch, IsBkg : boolean) : longint; external 'ImgLoad@files:botva2.dll stdcall delayload';
procedure ImgSetVisibility(img : longint; Visible : boolean); external 'ImgSetVisibility@files:botva2.dll stdcall delayload';
procedure ImgApplyChanges(h : hwnd); external 'ImgApplyChanges@files:botva2.dll stdcall delayload';
procedure ImgSetPosition(img : longint; NewLeft, NewTop, NewWidth, NewHeight : integer); external 'ImgSetPosition@files:botva2.dll stdcall delayload';
procedure gdipShutdown();  external 'gdipShutdown@files:botva2.dll stdcall delayload';
function WrapBtnCallback(Callback : TBtnEventProc; ParamCount : integer) : longword; external 'wrapcallback@files:innocallback.dll stdcall delayload';
function BtnCreate(hParent : hwnd; Left, Top, Width, Height : integer; FileName : PAnsiChar; ShadowWidth : integer; IsCheckBtn : boolean) : hwnd;  external 'BtnCreate@files:botva2.dll stdcall delayload';
procedure BtnSetVisibility(h : hwnd; Value : boolean); external 'BtnSetVisibility@files:botva2.dll stdcall delayload';
procedure BtnSetEvent(h : hwnd; EventID : integer; Event : longword); external 'BtnSetEvent@files:botva2.dll stdcall delayload';
procedure BtnSetEnabled(h : hwnd; Value : boolean); external 'BtnSetEnabled@files:botva2.dll stdcall delayload';
function BtnGetChecked(h : hwnd) : boolean; external 'BtnGetChecked@files:botva2.dll stdcall delayload';
procedure BtnSetChecked(h : hwnd; Value : boolean); external 'BtnSetChecked@files:botva2.dll stdcall delayload';
procedure BtnSetPosition(h : hwnd; NewLeft, NewTop, NewWidth, NewHeight : integer);  external 'BtnSetPosition@files:botva2.dll stdcall delayload';
function PBCallBack(P : TPBProc; ParamCount : integer) : longword; external 'wrapcallback@files:innocallback.dll stdcall delayload';
procedure ImgSetVisiblePart(img : longint; NewLeft, NewTop, NewWidth, NewHeight : integer); external 'ImgSetVisiblePart@files:botva2.dll stdcall delayload';
function WrapTimerProc(Callback: TTimerProc; ParamCount: integer): longword; external 'wrapcallback@files:InnoCallback.dll stdcall delayload';
//Windows API
function CreateRoundRectRgn(p1, p2, p3, p4, p5, p6 : integer) : THandle; external 'CreateRoundRectRgn@gdi32.dll stdcall';
function SetWindowRgn(h : hwnd; hRgn : THandle; bRedraw : boolean) : integer; external 'SetWindowRgn@user32.dll stdcall';
function ReleaseCapture() : longint; external 'ReleaseCapture@user32.dll stdcall';
function CallWindowProc(lpPrevWndFunc : longint; h : hwnd; Msg : UINT; wParam, lParam : longint) : longint; external 'CallWindowProcW@user32.dll stdcall';
function SetWindowLong(h : hwnd; Index : integer; NewLong : longint) : longint; external 'SetWindowLongW@user32.dll stdcall';
function SetProp(hWnd : hwnd; lpString : string; hData : longint) : longint; external 'SetPropW@user32.dll stdcall';
function GetProp(hWnd : hwnd; lpString : string) : longint; external 'GetPropW@user32.dll stdcall';
function RemoveProp(hWnd : hwnd; lpString : string) : longint; external 'RemovePropW@user32.dll stdcall';
function SetTimer(hWnd, nIDEvent, uElapse, lpTimerFunc: longword): longword; external 'SetTimer@user32.dll stdcall';
function KillTimer(hWnd, nIDEvent: longword): longword; external 'KillTimer@user32.dll stdcall';
function SetClassLong(h : hwnd; nIndex : integer; dwNewLong : longint) : DWORD; external 'SetClassLongW@user32.dll stdcall';
function GetClassLong(h : hwnd; nIndex : integer) : DWORD; external 'GetClassLongW@user32.dll stdcall';
function GetSystemMetrics(nIndex: Integer): Integer; external 'GetSystemMetrics@user32.dll stdcall';
function LoadCursor(hInstance : longint; lpCursorName : longint) : longint; external 'LoadCursorW@user32.dll stdcall';
function SetCursor(hCursor : longint) : longint; external 'SetCursor@user32.dll stdcall';
function GetCursorPos(var lpPoint : TWinPoint) : longint; external 'GetCursorPos@user32.dll stdcall';
function ScreenToClient(hWnd : hwnd; var lpPoint : TWinPoint) : longint; external 'ScreenToClient@user32.dll stdcall';
function SendMessage(hWnd : hwnd; Msg : UINT; wParam, lParam : longint) : longint; external 'SendMessageW@user32.dll stdcall';
function SendMessageRect(hWnd : hwnd; Msg : UINT; wParam : longint; var lParam : TWinRect) : longint; external 'SendMessageW@user32.dll stdcall';
#ifdef EnableInstallProcessBlockCheck
function CloseHandle(hObject : longint) : longint; external 'CloseHandle@kernel32.dll stdcall';
function CreateToolhelp32Snapshot(dwFlags, th32ProcessID : DWORD) : longint; external 'CreateToolhelp32Snapshot@kernel32.dll stdcall';
function Process32First(hSnapshot : longint; var lppe : TProcessEntry32) : boolean; external 'Process32FirstW@kernel32.dll stdcall';
function Process32Next(hSnapshot : longint; var lppe : TProcessEntry32) : boolean; external 'Process32NextW@kernel32.dll stdcall';
#endif
// Pascal Script doesn't expose a generic Pointer type; use "var Integer" so the address is passed.
function DwmSetWindowAttribute(hwnd: hwnd; dwAttribute: DWORD; var pvAttribute: Integer; cbAttribute: DWORD): Integer; external 'DwmSetWindowAttribute@dwmapi.dll stdcall delayload';
function SetWindowTheme(hwnd: hwnd; pszSubAppName, pszSubIdList: string): longint; external 'SetWindowTheme@uxtheme.dll stdcall delayload';

procedure disable_visual_styles_for_hwnd(h: hwnd);
begin
  if h = 0 then Exit;
  // Passing empty strings prevents visual styles from being applied to the window.
  // This avoids artifacts around themed controls on custom-painted backgrounds.
  SetWindowTheme(h, '', '');
end;

procedure edit_set_text_rect_top_padding(edit_hwnd: hwnd; top_padding_px: integer);
var
  r: TWinRect;
begin
  if edit_hwnd = 0 then Exit;
  if top_padding_px <= 0 then Exit;
  r.Left := 0;
  r.Top := 0;
  r.Right := 0;
  r.Bottom := 0;
  // Get current text rect, then push it down by top padding.
  SendMessageRect(edit_hwnd, EM_GETRECT, 0, r);
  r.Top := r.Top + top_padding_px;
  // Apply without repainting non-client area.
  SendMessageRect(edit_hwnd, EM_SETRECTNP, 0, r);
end;
