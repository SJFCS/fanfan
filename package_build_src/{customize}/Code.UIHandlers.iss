//UI 交互相关回调

const
  IDC_HAND = 32649;
  PROP_OLD_WNDPROC_HAND_CURSOR = 'inno_oldproc_hand_cursor';

function hand_cursor_wndproc(h : hwnd; Msg, wParam, lParam : longint) : longint;
var
  old_proc : longint;
begin
  if Msg = WM_SETCURSOR then
  begin
    SetCursor(LoadCursor(0, IDC_HAND));
    Result := 1;
    Exit;
  end;

  old_proc := GetProp(h, PROP_OLD_WNDPROC_HAND_CURSOR);
  if old_proc <> 0 then
  begin
    Result := CallWindowProc(old_proc, h, Msg, wParam, lParam);
  end else
  begin
    Result := 0;
  end;
end;

procedure hook_hand_cursor_for_hwnd(h : hwnd);
var
  old_proc : longint;
begin
  if h = 0 then Exit;
  if GetProp(h, PROP_OLD_WNDPROC_HAND_CURSOR) <> 0 then Exit;

  old_proc := SetWindowLong(h, GWL_WNDPROC, PBCallBack(@hand_cursor_wndproc, 4));
  SetProp(h, PROP_OLD_WNDPROC_HAND_CURSOR, old_proc);
end;

#ifdef ShowLicenseAgreement
const
  LINK_COLOR_NORMAL = {#LinkColorNormal};
  LINK_COLOR_HOVER = {#LinkColorHover};
  LINK_COLOR_DOWN = {#LinkColorDown};

function point_in_label(px, py : integer; label_ctrl : TLabel) : boolean;
begin
  Result :=
    (px >= label_ctrl.Left) and (px < (label_ctrl.Left + label_ctrl.Width)) and
    (py >= label_ctrl.Top) and (py < (label_ctrl.Top + label_ctrl.Height));
end;

procedure apply_link_color(label_ctrl : TLabel; is_hover, is_down : boolean);
begin
  if not Assigned(label_ctrl) then Exit;

  if is_down then
  begin
    label_ctrl.Font.Color := LINK_COLOR_DOWN;
  end else if is_hover then
  begin
    label_ctrl.Font.Color := LINK_COLOR_HOVER;
  end else
  begin
    label_ctrl.Font.Color := LINK_COLOR_NORMAL;
  end;
end;

procedure update_link_colors_by_mouse_position();
var
  pt : TWinPoint;
  hover_license : boolean;
begin
  pt.X := 0;
  pt.Y := 0;
  if GetCursorPos(pt) = 0 then Exit;
  if ScreenToClient(WizardForm.Handle, pt) = 0 then Exit;

  hover_license := False;

  if Assigned(label_license_link) then
    hover_license := point_in_label(pt.X, pt.Y, label_license_link);

  apply_link_color(label_license_link, hover_license, link_license_is_down);
end;

procedure link_hover_timer_proc(HandleW, Msg, idEvent, TimeSys : longword);
begin
  update_link_colors_by_mouse_position();
end;

procedure ensure_link_hover_timer();
begin
  if link_hover_timer <> 0 then Exit;
  link_hover_timer := SetTimer(0, 0, 50, WrapTimerProc(@link_hover_timer_proc, 4));
end;

procedure label_license_link_on_mouse_down(Sender : TObject; Button : TMouseButton; Shift : TShiftState; X, Y : integer);
begin
  link_license_is_down := True;
  update_link_colors_by_mouse_position();
end;

procedure label_license_link_on_mouse_up(Sender : TObject; Button : TMouseButton; Shift : TShiftState; X, Y : integer);
begin
  link_license_is_down := False;
  update_link_colors_by_mouse_position();
end;
#endif

//主界面关闭按钮按下时执行
procedure button_close_on_click(hBtn : hwnd);
begin
  WizardForm.CancelButton.OnClick(WizardForm);
end;

//主界面最小化按钮按下时执行
procedure button_minimize_on_click(hBtn : hwnd);
begin
  SendMessage(WizardForm.Handle, WM_SYSCOMMAND, 61472, 0);
end;

//主界面自定义安装按钮按下时执行
procedure button_customize_setup_on_click(Sender : TObject);
begin
  if is_wizardform_show_normal then
  begin
    stop_animation_timer;
    image_wizardform_background := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\background_welcome_more.png'), 0, 0, ScaleX(WIZARDFORM_WIDTH_NORMAL), ScaleY(WIZARDFORM_HEIGHT_MORE), True, True);
    is_wizardform_show_normal := False;
    wizardform_animation_timer := SetTimer(0, 0, 1, WrapTimerProc(@show_full_wizardform_animation, 4));
    if Assigned(label_custom_install_toggle) then label_custom_install_toggle.Caption := CustomMessage('custom_install_collapse');
  end else
  begin
    stop_animation_timer;
    is_wizardform_show_normal := True;
    wizardform_animation_timer := SetTimer(0, 0, 1, WrapTimerProc(@show_normal_wizardform_animation, 4));
    image_wizardform_background := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\background_welcome.png'), 0, 0, ScaleX(WIZARDFORM_WIDTH_NORMAL), ScaleY(WIZARDFORM_HEIGHT_NORMAL), True, True);
    if Assigned(label_custom_install_toggle) then label_custom_install_toggle.Caption := CustomMessage('custom_install_expand');
  end;

  if Assigned(label_custom_install_toggle) then
  begin
    label_custom_install_toggle.Left := WizardForm.ClientWidth - ScaleX(20) - label_custom_install_toggle.Width;
    label_custom_install_toggle.Top := ScaleY(374) + (ScaleY(17) - label_custom_install_toggle.Height) div 2;
  end;
  ImgApplyChanges(WizardForm.Handle);
end;

//主界面浏览按钮按下时执行
procedure button_browse_on_click(hBtn : hwnd);
begin
  WizardForm.DirBrowseButton.OnClick(WizardForm);
  edit_target_path.Text := WizardForm.DirEdit.Text;
end;

procedure button_change_dir_on_click(Sender : TObject);
begin
  button_browse_on_click(0);
end;

//路径输入框文本变化时执行
procedure edit_target_path_on_change(Sender : TObject);
begin
  WizardForm.DirEdit.Text := edit_target_path.Text;
end;

#ifdef ShowLicenseAgreement
//“已阅读并同意”复选框被点击时执行
procedure checkbox_license_on_click(hBtn : hwnd);
begin
  if BtnGetChecked(checkbox_license) then
  begin
    BtnSetEnabled(button_setup_or_next, True);
  end else
  begin
    BtnSetEnabled(button_setup_or_next, False);
  end;
end;

//点击“已阅读并同意”文本时，同样切换复选框状态（便于通用化：文本与图标分离）
procedure label_license_accept_prefix_on_click(Sender : TObject);
begin
  if (checkbox_license = 0) then Exit;
  BtnSetChecked(checkbox_license, not BtnGetChecked(checkbox_license));
  checkbox_license_on_click(checkbox_license);
end;
#endif

procedure open_url(const url: string);
var
  ErrorCode : integer;
begin
  if url <> '' then
  begin
    ShellExec('', url, '', '', SW_SHOW, ewNoWait, ErrorCode);
  end;
end;

procedure center_form_to_wizard(form_to_center: TSetupForm);
begin
  form_to_center.Left := WizardForm.Left + (WizardForm.ClientWidth - form_to_center.Width) div 2;
  form_to_center.Top := WizardForm.Top + (WizardForm.ClientHeight - form_to_center.Height) div 2;
end;

#if defined(EnableSetupPasswordCheck) || defined(EnableUpdatePasswordCheck)
var
  password_check_form : TSetupForm;
  password_check_label : TLabel;
  password_check_edit : TEdit;
  password_check_ok_button, password_check_cancel_button : TNewButton;

function should_prompt_password() : boolean;
begin
  if has_password_verified then
  begin
    Result := False;
    Exit;
  end;

  // 2=finish button: never prompt there
  if main_action_button_variant = 2 then
  begin
    Result := False;
    Exit;
  end;

  Result := False;
#ifdef EnableSetupPasswordCheck
  if main_action_button_variant = 0 then Result := True;
#endif
#ifdef EnableUpdatePasswordCheck
  if main_action_button_variant = 1 then Result := True;
#endif
end;

procedure ensure_password_check_form_created();
begin
  if Assigned(password_check_form) then Exit;
  // 密码窗口大小
  password_check_form := CreateCustomForm(ScaleX(120), ScaleY(45), True, False);
  with password_check_form do
  begin
    BorderStyle := bsDialog;
    Position := poDesigned;
    Caption := CustomMessage('password_prompt_title');
    Color := clWhite;
  end;

  password_check_label := TLabel.Create(password_check_form);
  with password_check_label do
  begin
    Parent := password_check_form;
    AutoSize := False;
    Left := ScaleX(12);
    Top := ScaleY(10);
    Width := password_check_form.ClientWidth - ScaleX(24);
    Height := ScaleY(18);
    Caption := CustomMessage('password_prompt_text');
  end;

  password_check_edit := TEdit.Create(password_check_form);
  with password_check_edit do
  begin
    Parent := password_check_form;
    Left := ScaleX(12);
    Top := ScaleY(30);
    Width := password_check_form.ClientWidth - ScaleX(24);
    Height := ScaleY(22);
    PasswordChar := '*';
    TabOrder := 0;
  end;

  password_check_ok_button := TNewButton.Create(password_check_form);
  with password_check_ok_button do
  begin
    Parent := password_check_form;
    Width := ScaleX(80);
    Height := ScaleY(22);
    Left := ScaleX(0);
    Top := password_check_form.ClientHeight - Height - ScaleY(8);
    Caption := SetupMessage(msgButtonOK);
    ModalResult := mrOk;
    Default := True;
    TabOrder := 1;
  end;

  password_check_cancel_button := TNewButton.Create(password_check_form);
  with password_check_cancel_button do
  begin
    Parent := password_check_form;
    Width := ScaleX(80);
    Height := ScaleY(22);
    Left := password_check_form.ClientWidth - ScaleX(12) - Width;
    Top := password_check_ok_button.Top;
    Caption := SetupMessage(msgButtonCancel);
    ModalResult := mrCancel;
    Cancel := True;
    TabOrder := 2;
  end;

  // Center the button group
  password_check_ok_button.Left := (password_check_form.ClientWidth - (password_check_ok_button.Width + ScaleX(10) + password_check_cancel_button.Width)) div 2;
  password_check_cancel_button.Left := password_check_ok_button.Left + password_check_ok_button.Width + ScaleX(10);
end;

function prompt_setup_password(var password_out : string) : boolean;
begin
  ensure_password_check_form_created();
  center_form_to_wizard(password_check_form);
  password_check_form.Caption := CustomMessage('password_prompt_title');
  password_check_label.Caption := CustomMessage('password_prompt_text');
  password_check_edit.Text := '';
  Result := (password_check_form.ShowModal() = mrOk);
  if Result then password_out := password_check_edit.Text;
end;
#endif

procedure label_wizardform_title_on_click(Sender : TObject);
begin
  open_url(CustomMessage('wizardform_title_url'));
end;

#ifdef ShowLicenseAgreement
#ifdef LicenseAgreementUseText
procedure ensure_license_text_form_created();
begin
  if Assigned(license_text_form) then Exit;

  //约为原窗口(520x420)的 
  license_text_form := CreateCustomForm(ScaleX(240), ScaleY(150), True, False);
  with license_text_form do
  begin
    BorderStyle := bsDialog;
    Position := poDesigned;
    Caption := '{#LicenseTextTitle}';
    Color := clWhite;
  end;

  license_text_memo := TNewMemo.Create(license_text_form);
  with license_text_memo do
  begin
    Parent := license_text_form;
    Left := ScaleX(10);
    Top := ScaleY(10);
    Width := license_text_form.ClientWidth - ScaleX(20);
    Height := license_text_form.ClientHeight - ScaleY(10 + 23 + 10);
    Anchors := [akLeft, akTop, akRight, akBottom];
    ReadOnly := True;
    WordWrap := True;
    ScrollBars := ssVertical;
  end;

  license_text_close_button := TNewButton.Create(license_text_form);
  with license_text_close_button do
  begin
    Parent := license_text_form;
    Width := ScaleX(90);
    Height := ScaleY(23);
    Left := (license_text_form.ClientWidth - Width) div 2;
    Top := license_text_form.ClientHeight - Height - ScaleY(10);
    Anchors := [akBottom];
    Caption := '已确认';
    ModalResult := mrOk;
    Cancel := True;
    Default := True;
  end;
end;

procedure show_license_text();
var
  license_path : string;
  content_ansi : AnsiString;
  content : string;
begin
  ensure_license_text_form_created();
  //每次弹窗都以当前主窗口位置重新居中
  center_form_to_wizard(license_text_form);
  license_text_close_button.Left := (license_text_form.ClientWidth - license_text_close_button.Width) div 2;

  license_path := ExpandConstant('{tmp}\License');
  try
    if not FileExists(license_path) then
    begin
      ExtractTemporaryFile('License');
    end;
    if not LoadStringFromFile(license_path, content_ansi) then
    begin
      MsgBox('无法读取许可协议文件：' + license_path, mbError, MB_OK);
      Exit;
    end;
    content := UTF8Decode(content_ansi);
    license_text_memo.Lines.Text := content;
  except
    MsgBox('无法读取许可协议文件：' + license_path + #13#10 + GetExceptionMessage, mbError, MB_OK);
    Exit;
  end;

  license_text_form.ShowModal();
end;
#endif

//点击“最终用户许可协议”链接
procedure label_license_link_on_click(Sender : TObject);
begin
#ifdef LicenseAgreementUseText
  show_license_text();
#endif
end;
#endif

//设为默认软件的复选框被点击时执行
procedure checkbox_setdefault_on_click(hBtn : hwnd);
begin
  if BtnGetChecked(checkbox_setdefault) then
  begin
    need_to_change_associations := True;
  end else
  begin
    need_to_change_associations := False;
  end;
end;

procedure label_checkbox_limitace_prefix_on_click(Sender : TObject);
begin
  if (checkbox_setdefault = 0) then Exit;
  BtnSetChecked(checkbox_setdefault, not BtnGetChecked(checkbox_setdefault));
  checkbox_setdefault_on_click(checkbox_setdefault);
end;

#ifdef EnableInstallProcessBlockCheck
function get_process_entry_exe_file(var pe : TProcessEntry32) : string;
var
  i : integer;
begin
  Result := '';
  for i := 0 to 259 do
  begin
    if pe.szExeFile[i] = #0 then Exit;
    Result := Result + pe.szExeFile[i];
  end;
end;

function is_process_running(ProcessFileName : string) : boolean;
var
  snapshot : longint;
  pe : TProcessEntry32;
begin
  Result := False;
  snapshot := CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if snapshot = INVALID_HANDLE_VALUE then Exit;

  try
    pe.dwSize := SizeOf(pe);
    if Process32First(snapshot, pe) then
    begin
      repeat
        if CompareText(get_process_entry_exe_file(pe), ProcessFileName) = 0 then
        begin
          Result := True;
          Exit;
        end;
      until not Process32Next(snapshot, pe);
    end;
  finally
    CloseHandle(snapshot);
  end;
end;

function is_install_blocking_process_running() : boolean;
begin
  Result := False;
#ifdef InstallBlockProcess1
  if is_process_running('{#InstallBlockProcess1}') then Result := True;
#endif
#ifdef InstallBlockProcess2
  if is_process_running('{#InstallBlockProcess2}') then Result := True;
#endif
#ifdef InstallBlockProcess3
  if is_process_running('{#InstallBlockProcess3}') then Result := True;
#endif
#ifdef InstallBlockProcess4
  if is_process_running('{#InstallBlockProcess4}') then Result := True;
#endif
#ifdef InstallBlockProcess5
  if is_process_running('{#InstallBlockProcess5}') then Result := True;
#endif
end;

function get_install_blocking_app_message() : string;
begin
  if main_action_blocking_message_valid then
  begin
    Result := main_action_blocking_message;
    Exit;
  end;

  Result := '';
  if is_install_blocking_process_running() then
  begin
    Result := CustomMessage('install_blocked_lol_client_running');
  end;

  main_action_blocking_message := Result;
  main_action_blocking_message_valid := True;
end;

procedure invalidate_install_blocking_cache();
begin
  main_action_blocking_message := '';
  main_action_blocking_message_valid := False;
end;
#endif

//返回设为默认软件复选框的状态
function is_setdefault_checkbox_checked() : boolean;
begin
  if is_upgrade_install then
  begin
    Result := False;
    Exit;
  end;
  Result := need_to_change_associations;
end;

//若复选框被勾选，则会在文件复制结束时执行此段脚本
procedure check_if_need_change_associations();
//ace 变量
var
  ace_path : string;
  ps_path : string;
  params : string;
  result_code : integer;
begin
  if is_upgrade_install then Exit;
  if is_setdefault_checkbox_checked() then
  begin
    ace_path := ExpandConstant('{app}\ace.ps1');
    try
      if not FileExists(ace_path) then
      begin
        ExtractTemporaryFile('ace.ps1');
      end;
    except
      MsgBox('无法释放 ACE 优化脚本：' + ace_path + #13#10 + GetExceptionMessage, mbError, MB_OK);
      Exit;
    end;

    ps_path := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
    if not FileExists(ps_path) then
    begin
      // fallback: rely on PATH if the system path is non-standard
      ps_path := 'powershell.exe';
    end;
    params := '-NoProfile -ExecutionPolicy Bypass -File "' + ace_path + '"';
    result_code := -1;
    if not Exec(ps_path, params, '', SW_HIDE, ewWaitUntilTerminated, result_code) then
    begin
      MsgBox('执行 ACE 优化脚本失败（无法启动 PowerShell）。', mbError, MB_OK);
      Exit;
    end;
    if result_code <> 0 then
    begin
      MsgBox('ACE 优化脚本执行失败，返回码：' + IntToStr(result_code), mbError, MB_OK);
      Exit;
    end;
    //MsgBox('此处执行后续操作。', mbInformation, MB_OK);
  end;
end;

//主界面安装按钮按下时执行
procedure button_setup_or_next_on_click(hBtn : hwnd);
#ifdef EnableInstallProcessBlockCheck
var
  blocking_message : string;
#if defined(EnableSetupPasswordCheck) || defined(EnableUpdatePasswordCheck)
  password_input : string;
#endif
#else
#if defined(EnableSetupPasswordCheck) || defined(EnableUpdatePasswordCheck)
var
  password_input : string;
#endif
#endif
begin
  if is_main_action_click_busy then Exit;
  is_main_action_click_busy := True;
  try
#ifdef EnableInstallProcessBlockCheck
    invalidate_install_blocking_cache();
    if main_action_button_variant <> 2 then
    begin
      blocking_message := get_install_blocking_app_message();
      if blocking_message <> '' then
      begin
        MsgBox(blocking_message, mbError, MB_OK);
        Exit;
      end;
    end;
#endif
#if defined(EnableSetupPasswordCheck) || defined(EnableUpdatePasswordCheck)
    if should_prompt_password() then
    begin
      password_input := '';
      if not prompt_setup_password(password_input) then Exit;
      if password_input <> '{#InstallerPassword}' then
      begin
        MsgBox(CustomMessage('password_incorrect'), mbError, MB_OK);
        Exit;
      end;
      has_password_verified := True;
    end;
#endif
    WizardForm.NextButton.OnClick(WizardForm);
  finally
    is_main_action_click_busy := False;
  end;
end;

#ifdef EnableInstallProcessBlockCheck
//安装正式开始前的兜底拦截。即使自定义按钮逻辑被绕过，也不要进入文件复制阶段。
function PrepareToInstall(var NeedsRestart : Boolean) : String;
begin
  Result := get_install_blocking_app_message();
end;
#endif

//复制文件时执行的脚本（每复制 1% 调用一次）
function PBProc(h : hWnd; Msg, wParam, lParam : longint) : longint;
var
  pr, i1, i2 : EXTENDED;
  w : integer;
begin
  Result := CallWindowProc(PBOldProc, h, Msg, wParam, lParam);
  if ((Msg = $402) and (WizardForm.ProgressGauge.Position > WizardForm.ProgressGauge.Min)) then
  begin
    i1 := WizardForm.ProgressGauge.Position - WizardForm.ProgressGauge.Min;
    i2 := WizardForm.ProgressGauge.Max - WizardForm.ProgressGauge.Min;
    pr := (i1 * 100) / i2;
    label_install_progress.Caption := Format('%d', [Round(pr)]) + '%';
    w := Round((ScaleX(560) * pr) / 100);
    ImgSetPosition(image_progressbar_foreground, ScaleX(20), ScaleY(374), w, ScaleY(6));
    ImgSetVisiblePart(image_progressbar_foreground, 0, 0, w, ScaleY(6));
    ImgApplyChanges(WizardForm.Handle);
  end;
end;

//主界面被点住就随鼠标移动
procedure wizardform_on_mouse_down(Sender : TObject; Button : TMouseButton; Shift : TShiftState; X, Y : integer);
begin
  ReleaseCapture();
  SendMessage(WizardForm.Handle, WM_SYSCOMMAND, $F012, 0);
end;

