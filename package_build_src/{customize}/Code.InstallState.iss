//如果使用自定义卸载程序，就修改注册表，将默认卸载程序路径改为我们自己的卸载程序的路径
procedure change_reg_uninst;
begin
  RegWriteStringValue(HKEY_LOCAL_MACHINE, PRODUCT_UNINSTALL_REGISTRY_KEY, 'UninstallString', ExpandConstant('"{app}\Uninstall.exe"'));
end;

//停止轮播计时器
procedure stop_slide_timer;
begin
  if (slide_picture_timer <> 0) then
  begin
    KillTimer(0, slide_picture_timer);
    slide_picture_timer := 0;
  end;
end;

//停止暂停轮播用的计时器
procedure stop_slide_pause_timer;
begin
  if (slide_pause_timer <> 0) then
  begin
    KillTimer(0, slide_pause_timer);
    slide_pause_timer := 0;
    time_counter := 0;
  end;
end;

procedure pictures_slides_animation(HandleW, Msg, idEvent, TimeSys: longword); forward;

//暂停轮播
procedure slide_pause_for_a_while(HandleW, Msg, idEvent, TimeSys: longword);
begin
  stop_slide_timer;
  if (time_counter >= (SLIDES_PAUSE_SECONDS * 1000)) then
  begin
    stop_slide_pause_timer;
    time_counter := 0;
    slide_picture_timer := SetTimer(0, 0, 20, WrapTimerProc(@pictures_slides_animation, 4));
  end else
  begin
    time_counter := time_counter + 50;
  end;
end;

procedure pause_slides_for_a_while();
begin
  if (cur_pic_pos <= 0) then
  begin
    stop_slide_timer;
    if (slide_pause_timer = 0) then
    begin
      slide_pause_timer := SetTimer(0, 0, 10, WrapTimerProc(@slide_pause_for_a_while, 4));
    end;
  end;
end;

//安装时轮播图片
procedure pictures_slides_animation(HandleW, Msg, idEvent, TimeSys: longword);
begin
  cur_pic_pos := cur_pic_pos + 10;
  if (ScaleX(cur_pic_pos) > ScaleX(SLIDES_PICTURE_WIDTH)) then
  begin
    cur_pic_no := cur_pic_no + 1;
    cur_pic_pos := 0;
    pause_slides_for_a_while;
  end else
  begin
    if (cur_pic_no = 1) then
    begin
      ImgSetPosition(slide_1_t, ScaleX(cur_pic_pos - SLIDES_PICTURE_WIDTH), 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT));
      ImgSetVisibility(slide_2_t, False);
      ImgSetVisibility(slide_3_t, False);
      ImgSetVisibility(slide_4_t, False);
      ImgSetVisibility(slide_1_t, True);
    end;
    if (cur_pic_no = 2) then
    begin
      ImgSetPosition(slide_2_t, ScaleX(cur_pic_pos - SLIDES_PICTURE_WIDTH), 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT));
      ImgSetVisibility(slide_1_t, False);
      ImgSetVisibility(slide_3_t, False);
      ImgSetVisibility(slide_4_t, False);
      ImgSetVisibility(slide_2_t, True);
      ImgSetVisibility(slide_1_b, True);
      ImgSetVisibility(slide_3_b, False);
      ImgSetVisibility(slide_4_b, False);
      ImgSetVisibility(slide_2_b, False);
    end;
    if (cur_pic_no = 3) then
    begin
      ImgSetPosition(slide_3_t, ScaleX(cur_pic_pos - SLIDES_PICTURE_WIDTH), 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT));
      ImgSetVisibility(slide_1_t, False);
      ImgSetVisibility(slide_2_t, False);
      ImgSetVisibility(slide_4_t, False);
      ImgSetVisibility(slide_3_t, True);
      ImgSetVisibility(slide_1_b, False);
      ImgSetVisibility(slide_3_b, False);
      ImgSetVisibility(slide_4_b, False);
      ImgSetVisibility(slide_2_b, True);
    end;
    if (cur_pic_no = 4) then
    begin
      ImgSetPosition(slide_4_t, ScaleX(cur_pic_pos - SLIDES_PICTURE_WIDTH), 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT));
      ImgSetVisibility(slide_1_t, False);
      ImgSetVisibility(slide_2_t, False);
      ImgSetVisibility(slide_3_t, False);
      ImgSetVisibility(slide_4_t, True);
      ImgSetVisibility(slide_1_b, False);
      ImgSetVisibility(slide_3_b, True);
      ImgSetVisibility(slide_4_b, False);
      ImgSetVisibility(slide_2_b, False);
    end;
    if (cur_pic_no > 4) then
    begin
      ImgSetPosition(slide_1_t, ScaleX(cur_pic_pos - SLIDES_PICTURE_WIDTH), 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT));
      ImgSetVisibility(slide_2_t, False);
      ImgSetVisibility(slide_3_t, False);
      ImgSetVisibility(slide_4_t, False);
      ImgSetVisibility(slide_1_t, True);
      ImgSetVisibility(slide_1_b, False);
      ImgSetVisibility(slide_3_b, False);
      ImgSetVisibility(slide_4_b, True);
      ImgSetVisibility(slide_2_b, False);
      cur_pic_no := 1;
    end;
  end;
  ImgApplyChanges(WizardForm.Handle);
end;

//轮播图片点击事件：打开特定网页
//停止动画计时器
procedure stop_animation_timer;
begin
  if (wizardform_animation_timer <> 0) then
  begin
    KillTimer(0, wizardform_animation_timer);
    wizardform_animation_timer := 0;
  end;
end;

procedure center_wizard_form_on_screen();
var
  screen_w: integer;
  screen_h: integer;
begin
  screen_w := GetSystemMetrics(0 {SM_CXSCREEN});
  screen_h := GetSystemMetrics(1 {SM_CYSCREEN});
  WizardForm.Left := (screen_w - WizardForm.Width) div 2;
  WizardForm.Top := (screen_h - WizardForm.Height) div 2;
end;

procedure shape_form_round(aForm : TForm); forward;

procedure set_wizard_client_height_keep_center(new_client_height: integer);
var
  old_client_height: integer;
begin
  old_client_height := WizardForm.ClientHeight;
  WizardForm.ClientHeight := new_client_height;
  WizardForm.Top := WizardForm.Top + (old_client_height - new_client_height) div 2;
  shape_form_round(WizardForm);
end;

//窗口变大动画
procedure show_full_wizardform_animation(HandleW, Msg, idEvent, TimeSys: longword);
var
  next_height: integer;
begin
  if (WizardForm.ClientHeight < ScaleY(WIZARDFORM_HEIGHT_MORE)) then
  begin
    next_height := WizardForm.ClientHeight + ScaleY(WIZARDFORM_ANIMATION_STEP);
    if next_height > ScaleY(WIZARDFORM_HEIGHT_MORE) then next_height := ScaleY(WIZARDFORM_HEIGHT_MORE);
    set_wizard_client_height_keep_center(next_height);
  end else
  begin
    stop_animation_timer;
    set_wizard_client_height_keep_center(ScaleY(WIZARDFORM_HEIGHT_MORE));
  end;
end;

//窗口变小动画
procedure show_normal_wizardform_animation(HandleW, Msg, idEvent, TimeSys: longword);
var
  next_height: integer;
begin
  if (WizardForm.ClientHeight > ScaleY(WIZARDFORM_HEIGHT_NORMAL)) then
  begin
    next_height := WizardForm.ClientHeight - ScaleY(WIZARDFORM_ANIMATION_STEP);
    if next_height < ScaleY(WIZARDFORM_HEIGHT_NORMAL) then next_height := ScaleY(WIZARDFORM_HEIGHT_NORMAL);
    set_wizard_client_height_keep_center(next_height);
  end else
  begin
    stop_animation_timer;
    set_wizard_client_height_keep_center(ScaleY(WIZARDFORM_HEIGHT_NORMAL));
  end;
end;

//调用这个函数可以使矩形窗口转变为圆角矩形窗口
procedure shape_form_round(aForm : TForm);
var
  ver: TWindowsVersion;
  cornerPref: Integer;
begin
  // Win11: use native rounded corners (smooth/antialiased).
  // Win10: keep rectangular (avoid jagged SetWindowRgn rounding).
  GetWindowsVersionEx(ver);
  if (ver.Major > 10) or ((ver.Major = 10) and (ver.Build >= 22000)) then
  begin
    cornerPref := DWMWCP_ROUND;
    if DwmSetWindowAttribute(aForm.Handle, DWMWA_WINDOW_CORNER_PREFERENCE, cornerPref, SizeOf(cornerPref)) = 0 then
    begin
      // Clear any previous region clipping so DWM can do the rounding
      SetWindowRgn(aForm.Handle, 0, True);
      Exit;
    end;
    // If DWM call fails on Win11, fall through and keep a rectangular window (no region rounding).
  end;

  // Win10 (or Win11 failure): keep rectangular window
  SetWindowRgn(aForm.Handle, 0, True);
end;

type
  TVersionParts = array[1..10] of longint;

function is_decimal_number(const s: string) : boolean;
var
  j: integer;
  c: char;
begin
  Result := (s <> '');
  if not Result then Exit;
  for j := 1 to Length(s) do
  begin
    c := s[j];
    if (c < '0') or (c > '9') then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function parse_version_to_parts(const v: string; var parts: TVersionParts; var count: integer) : boolean;
var
  tmp, token: string;
  dot_pos: integer;
begin
  Result := False;
  count := 0;
  tmp := v;

  while True do
  begin
    if count >= 10 then Exit;
    dot_pos := Pos('.', tmp);
    if dot_pos > 0 then
    begin
      token := Copy(tmp, 1, dot_pos - 1);
      Delete(tmp, 1, dot_pos);
    end else
    begin
      token := tmp;
      tmp := '';
    end;

    if not is_decimal_number(token) then Exit;
    count := count + 1;
    parts[count] := StrToInt(token);

    if tmp = '' then Break;
  end;

  Result := (count > 0);
end;

function version_part_or_zero(const parts: TVersionParts; count, idx: integer) : longint;
begin
  if idx <= count then Result := parts[idx] else Result := 0;
end;

// 判断“本产品是否已安装过”，并尽量读取已安装版本号到全局变量 version_installed_before。
//
// 返回值：
// - True  ：找到“已安装版本号”（意味着系统中大概率已安装过本产品）
// - False ：未找到任何版本号（不代表一定未安装，只表示未命中我们的检测来源）
//
// 副作用：
// - Result=True 时，version_installed_before 为检测到的已安装版本号
//
// 版本号来源（按优先级）：
// Inno Setup 卸载项：...\\Uninstall\\{GUID}_is1\\DisplayVersion（HKLM/HKLM64/HKCU/HKCU64）
function is_installed_before() : boolean;
var
  found : boolean;
begin
  found := False;
  version_installed_before := '';


  // 优先检查 HKLM（管理员安装）
  // 2) 卸载项（管理员安装：HKLM）
  if (not found) and RegQueryStringValue(HKEY_LOCAL_MACHINE, PRODUCT_UNINSTALL_REGISTRY_KEY, 'DisplayVersion', version_installed_before) and (version_installed_before <> '') then
    found := True;

  // 兼容：卸载信息可能在 64 位注册表视图（HKLM64/HKCU64），或在 HKCU（非管理员安装）
  // 3) 卸载项（64 位视图：HKLM64）
  if (not found) and RegQueryStringValue(HKLM64, PRODUCT_UNINSTALL_REGISTRY_KEY, 'DisplayVersion', version_installed_before) and (version_installed_before <> '') then
    found := True;

  // 4) 卸载项（非管理员安装：HKCU）
  if (not found) and RegQueryStringValue(HKEY_CURRENT_USER, PRODUCT_UNINSTALL_REGISTRY_KEY, 'DisplayVersion', version_installed_before) and (version_installed_before <> '') then
    found := True;

  // 5) 卸载项（64 位视图：HKCU64）
  if (not found) and RegQueryStringValue(HKCU64, PRODUCT_UNINSTALL_REGISTRY_KEY, 'DisplayVersion', version_installed_before) and (version_installed_before <> '') then
    found := True;

  if not found then
    version_installed_before := '0.0.0';

  Result := found;
end;

// 判断是否“正在用旧版安装包覆盖更高版本”（降级安装）。
//
// 依赖：
// - 调用前必须先调用 is_installed_before()，以便填充 version_installed_before
//
// 版本号格式要求：
// - 点分十进制正整数：1.2.3.4（每段必须是纯数字）
// - 若无法解析，为避免误拦截，返回 False（视为非降级）
function is_installing_older_version() : boolean;
var
  installed_parts : TVersionParts;
  installing_parts : TVersionParts;
  installed_str, installing_str : string;
  i, installed_count, installing_count, max_count : integer;
begin
  installed_str := version_installed_before;
  installing_str := '{#MyAppVersion}';

  // 若版本号无法解析，为避免误拦截，视为“非降级”
  if (installed_str = '') or (installing_str = '') then
  begin
    Result := False;
    Exit;
  end;

  if not parse_version_to_parts(installed_str, installed_parts, installed_count) then
  begin
    Result := False;
    Exit;
  end;

  if not parse_version_to_parts(installing_str, installing_parts, installing_count) then
  begin
    Result := False;
    Exit;
  end;

  max_count := installed_count;
  if installing_count > max_count then max_count := installing_count;
  for i := 1 to max_count do
  begin
    if version_part_or_zero(installed_parts, installed_count, i) > version_part_or_zero(installing_parts, installing_count, i) then
    begin
      Result := True;
      Exit;
    end;
    if version_part_or_zero(installed_parts, installed_count, i) < version_part_or_zero(installing_parts, installing_count, i) then
    begin
      Result := False;
      Exit;
    end;
  end;

  Result := False;
end;
