//释放安装程序时调用的脚本
procedure release_installer();
begin
  is_wizardform_released := True;
  stop_slide_timer;
  stop_animation_timer;
  gdipShutdown();
  WizardForm.Release();
end;

//释放需要的临时资源文件
procedure extract_temp_files();
begin
  ExtractTemporaryFile('button_finish.png');
  ExtractTemporaryFile('button_setup_or_next.png');
  ExtractTemporaryFile('button_setup_update.png');
  ExtractTemporaryFile('button_browse.png');
  ExtractTemporaryFile('background_welcome.png');
  ExtractTemporaryFile('background_welcome_more.png');
  ExtractTemporaryFile('progressbar_background.png');
  ExtractTemporaryFile('progressbar_foreground.png');
#if defined(ShowLicenseAgreement) || defined(LimitACE)
  ExtractTemporaryFile('checkbox.png');
#endif
#ifdef ShowSlidePictures
  ExtractTemporaryFile('slides_picture_1.png');
  ExtractTemporaryFile('slides_picture_2.png');
  ExtractTemporaryFile('slides_picture_3.png');
  ExtractTemporaryFile('slides_picture_4.png');
#endif
  ExtractTemporaryFile('background_installing.png');
  ExtractTemporaryFile('background_finish.png');
  ExtractTemporaryFile('button_close.png');
  ExtractTemporaryFile('button_minimize.png');
end;

procedure set_main_action_button_variant(Variant : integer);
var
  image_name : string;
begin
  if main_action_button_variant = Variant then Exit;

  case Variant of
    0: image_name := 'button_setup_or_next.png';
    1: image_name := 'button_setup_update.png';
    2: image_name := 'button_finish.png';
  else
  begin
    image_name := 'button_setup_or_next.png';
    Variant := 0;
  end;
  end;

  if button_setup_or_next <> 0 then BtnSetVisibility(button_setup_or_next, False);
  button_setup_or_next := BtnCreate(WizardForm.Handle, ScaleX(214), ScaleY(MAIN_ACTION_BUTTON_TOP), ScaleX(180), ScaleY(44), ExpandConstant('{tmp}\' + image_name), 0, False);
  hook_hand_cursor_for_hwnd(button_setup_or_next);
  BtnSetEvent(button_setup_or_next, ID_BUTTON_ON_CLICK_EVENT, WrapBtnCallback(@button_setup_or_next_on_click, 1));
#ifdef ShowLicenseAgreement
  if checkbox_license <> 0 then checkbox_license_on_click(checkbox_license);
#endif

  main_action_button_variant := Variant;
end;

//重载主界面取消按钮被按下后的处理过程
procedure CancelButtonClick(CurPageID : integer; var Cancel, Confirm: boolean);
begin
  Confirm := False;
  release_installer();
  Cancel := True;
end;

//重载安装程序初始化函数，判断是否已经安装新版本，是则禁止安装
function InitializeSetup() : boolean;
begin
#ifndef PortableBuild
#ifdef OnlyInstallNewVersion
  if is_installed_before() then
  begin
    if is_installing_older_version() then
    begin
      MsgBox(FmtMessage(CustomMessage('init_setup_outdated_version_warning'), [version_installed_before, '{#MyAppVersion}']), mbInformation, MB_OK);
      Result := False;
    end else
    begin
      Result := True;
    end;
  end else
  begin
    Result := True;
  end;
#else
  Result := True;
#endif
#else
  Result := True;
#endif
end;

//重载安装程序初始化函数（和上边那个不一样），进行初始化操作
procedure InitializeWizard();
begin
  is_installer_initialized := True;
  is_wizardform_show_normal := True;
  is_wizardform_released := False;
  need_to_change_associations := True;
  is_main_action_click_busy := False;
  is_upgrade_install := False;
  has_password_verified := False;
#ifdef EnableInstallProcessBlockCheck
  main_action_blocking_message := '';
  main_action_blocking_message_valid := False;
#endif
  extract_temp_files();
  WizardForm.InnerNotebook.Hide();
  WizardForm.OuterNotebook.Hide();
  WizardForm.Bevel.Hide();
  with WizardForm do
  begin
    BorderStyle := bsNone;
    ClientWidth := ScaleX(WIZARDFORM_WIDTH_NORMAL);
    ClientHeight := ScaleY(WIZARDFORM_HEIGHT_MORE);
    center_wizard_form_on_screen();
    Color := clWhite;
    NextButton.ClientHeight := 0;
    CancelButton.ClientHeight := 0;
    BackButton.Visible := False;
  end;
  shape_form_round(WizardForm);
  label_wizardform_main := TLabel.Create(WizardForm);
  with label_wizardform_main do
  begin
    Parent := WizardForm;
    AutoSize := False;
    Left := 0;
    Top := 0;
    ClientWidth := WizardForm.ClientWidth;
    ClientHeight := WizardForm.ClientHeight;
    Caption := '';
    Transparent := True;
    OnMouseDown := @wizardform_on_mouse_down;
  end;
  label_wizardform_title := TLabel.Create(WizardForm);
  with label_wizardform_title do
  begin
    Parent := WizardForm;
    AutoSize := False;
    Left := ScaleX(10);
    Top := ScaleY(5);
    // 标题宽度
    ClientWidth := ScaleX(180);
    ClientHeight := ScaleY(20);
    Font.Size := 9;
    Font.Color := clWhite;
    Caption := CustomMessage('wizardform_title');
    Transparent := True;
#ifdef EnableTitleLink
    Cursor := crHand;
    OnClick := @label_wizardform_title_on_click;
#else
    // Title-link disabled: allow dragging from title area.
    OnMouseDown := @wizardform_on_mouse_down;
#endif
  end;
  label_wizardform_more_product_already_installed := TLabel.Create(WizardForm);
  with label_wizardform_more_product_already_installed do
  begin
    Parent := WizardForm;
    AutoSize := False;
    Left := ScaleX(85);
    Top := ScaleY(449);
    ClientWidth := ScaleX(300);
    ClientHeight := ScaleY(20);
    Font.Size := 9;
    Font.Color := clGray;
    Caption := CustomMessage('no_change_destdir_warning');
    Transparent := True;
    OnMouseDown := @wizardform_on_mouse_down;
  end;
  label_wizardform_more_product_already_installed.Hide();
  edit_target_path := TEdit.Create(WizardForm);
  with edit_target_path do
  begin
    Parent := WizardForm;
    Text := WizardForm.DirEdit.Text;
    Font.Size := 9;
    AutoSize := False;
    BorderStyle := bsNone;
    // Address bar frame is baked into the background image; keep the edit inside the frame.
    SetBounds(ScaleX(91), ScaleY(423) , ScaleX(402), ScaleY(20));
    OnChange := @edit_target_path_on_change;
    Color := clWhite;
    TabStop := False;
  end;
  disable_visual_styles_for_hwnd(edit_target_path.Handle);
  // Push text down a bit to visually center it inside the baked frame.
  edit_set_text_rect_top_padding(edit_target_path.Handle, ScaleY(2));
  edit_target_path.Hide();
  label_install_location := TLabel.Create(WizardForm);
  with label_install_location do
  begin
    Parent := WizardForm;
    AutoSize := True;
    Left := ScaleX(20);
    Top := ScaleY(423);
    Font.Size := 10;
    Font.Color := clGray;
    Caption := CustomMessage('install_location_label');
    Transparent := True;
  end;
  label_install_location.Hide();
  // Image button (botva2), avoid native button artifacts on custom-painted background.
  button_change_dir := BtnCreate(WizardForm.Handle, ScaleX(506), ScaleY(420), ScaleX(75), ScaleY(24), ExpandConstant('{tmp}\button_browse.png'), 0, False);
  hook_hand_cursor_for_hwnd(button_change_dir);
  BtnSetEvent(button_change_dir, ID_BUTTON_ON_CLICK_EVENT, WrapBtnCallback(@button_browse_on_click, 1));
  BtnSetVisibility(button_change_dir, False);
  button_close := BtnCreate(WizardForm.Handle, ScaleX(570), 0, ScaleX(30), ScaleY(30), ExpandConstant('{tmp}\button_close.png'), 0, False);
  hook_hand_cursor_for_hwnd(button_close);
  BtnSetEvent(button_close, ID_BUTTON_ON_CLICK_EVENT, WrapBtnCallback(@button_close_on_click, 1));
  button_minimize := BtnCreate(WizardForm.Handle, ScaleX(540), 0, ScaleX(30), ScaleY(30), ExpandConstant('{tmp}\button_minimize.png'), 0, False);
  hook_hand_cursor_for_hwnd(button_minimize);
  BtnSetEvent(button_minimize, ID_BUTTON_ON_CLICK_EVENT, WrapBtnCallback(@button_minimize_on_click, 1));
  button_setup_or_next := BtnCreate(WizardForm.Handle, ScaleX(214), ScaleY(MAIN_ACTION_BUTTON_TOP), ScaleX(180), ScaleY(44), ExpandConstant('{tmp}\button_setup_or_next.png'), 0, False);
  main_action_button_variant := 0;
  hook_hand_cursor_for_hwnd(button_setup_or_next);
  BtnSetEvent(button_setup_or_next, ID_BUTTON_ON_CLICK_EVENT, WrapBtnCallback(@button_setup_or_next_on_click, 1));
  label_custom_install_toggle := TLabel.Create(WizardForm);
  with label_custom_install_toggle do
  begin
    Parent := WizardForm;
    AutoSize := True;
    Font.Size := 9;
    // 自定义安装
    Font.Color := clGray;
    Caption := CustomMessage('custom_install_expand');
    Cursor := crHand;
    Transparent := True;
    OnClick := @button_customize_setup_on_click;
  end;
  label_custom_install_toggle.Hide();
  PBOldProc := SetWindowLong(WizardForm.ProgressGauge.Handle, -4, PBCallBack(@PBProc, 4));
  ImgApplyChanges(WizardForm.Handle);
  SetClassLong(WizardForm.Handle, GCL_STYLE, GetClassLong(WizardForm.Handle, GCL_STYLE) or CS_DROPSHADOW);
#ifdef ShowLicenseAgreement
  ensure_link_hover_timer();
#endif
  cur_pic_no := 0;
  cur_pic_pos := 0;
end;

//安装程序销毁时会调用这个函数
procedure DeinitializeSetup();
begin
  if (is_wizardform_released = False) then
  begin
    if is_installer_initialized then release_installer();
  end;
end;

//安装页面改变时会调用这个函数
procedure CurPageChanged(CurPageID : integer);
var
  already_installed : boolean;
begin
  if (CurPageID = wpWelcome) then
  begin
    image_wizardform_background := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\background_welcome.png'), 0, 0, ScaleX(WIZARDFORM_WIDTH_NORMAL), ScaleY(WIZARDFORM_HEIGHT_NORMAL), True, True);
#ifdef ShowLicenseAgreement
    if (checkbox_license = 0) then
    begin
      checkbox_license := BtnCreate(WizardForm.Handle, ScaleX(11), ScaleY(374), ScaleX(19), ScaleY(17), ExpandConstant('{tmp}\checkbox.png'), 0, True);
      hook_hand_cursor_for_hwnd(checkbox_license);
      BtnSetEvent(checkbox_license, ID_BUTTON_ON_CLICK_EVENT, WrapBtnCallback(@checkbox_license_on_click, 1));
      BtnSetChecked(checkbox_license, True);
    end;

    if not Assigned(label_license_accept_prefix) then
    begin
      label_license_accept_prefix := TLabel.Create(WizardForm);
      with label_license_accept_prefix do
      begin
        Parent := WizardForm;
        AutoSize := True;
        Font.Size := 9;
        //接受授权
        Font.Color := clGray;
        Caption := CustomMessage('license_accept_prefix');
        Cursor := crHand;
        Transparent := True;
        OnClick := @label_license_accept_prefix_on_click;
      end;
    end;

    if not Assigned(label_license_link) then
    begin
      label_license_link := TLabel.Create(WizardForm);
      with label_license_link do
       begin
          Parent := WizardForm;
          AutoSize := True;
          Font.Size := 9;
          Font.Color := {#LinkColorNormal};
          Font.Style := [fsUnderline];
#ifdef LicenseAgreementUseText
          Caption := '{#LicenseTextTitle}';
#endif
        Cursor := crHand;
         Transparent := True;
         OnClick := @label_license_link_on_click;
         OnMouseDown := @label_license_link_on_mouse_down;
          OnMouseUp := @label_license_link_on_mouse_up;
        end;
      end;
    BtnSetVisibility(checkbox_license, True);
    label_license_accept_prefix.Left := ScaleX(11) + ScaleX(19) + ScaleX(6);
    label_license_accept_prefix.Top := ScaleY(374) + (ScaleY(17) - label_license_accept_prefix.Height) div 2;
    label_license_accept_prefix.Show();
    label_license_link.Left := label_license_accept_prefix.Left + label_license_accept_prefix.Width + ScaleX(4);
    label_license_link.Top := label_license_accept_prefix.Top;
    label_license_link.Show();
#endif

#ifdef LimitACE
    if (checkbox_setdefault = 0) then
    begin
      checkbox_setdefault := BtnCreate(WizardForm.Handle, ScaleX(85), ScaleY(470), ScaleX(19), ScaleY(17), ExpandConstant('{tmp}\checkbox.png'), 0, True);
      hook_hand_cursor_for_hwnd(checkbox_setdefault);
      BtnSetEvent(checkbox_setdefault, ID_BUTTON_ON_CLICK_EVENT, WrapBtnCallback(@checkbox_setdefault_on_click, 1));
      BtnSetChecked(checkbox_setdefault, True);
    end;

    if not Assigned(label_checkbox_limitace_prefix) then
    begin
      label_checkbox_limitace_prefix := TLabel.Create(WizardForm);
      with label_checkbox_limitace_prefix do
      begin
        Parent := WizardForm;
        AutoSize := True;
        Font.Size := 9;
        ;// 设为默认
        Font.Color := clGray;
        Caption := CustomMessage('limitace_prefix');
        Cursor := crHand;
        Transparent := True;
        OnClick := @label_checkbox_limitace_prefix_on_click;
      end;
    end;

    BtnSetVisibility(checkbox_setdefault, True);
    label_checkbox_limitace_prefix.Left := ScaleX(85) + ScaleX(19) + ScaleX(6);
    label_checkbox_limitace_prefix.Top := ScaleY(470) + (ScaleY(17) - label_checkbox_limitace_prefix.Height) div 2;
    label_checkbox_limitace_prefix.Show();
#endif
    label_install_location.Show();
    edit_target_path.Show();
    edit_target_path.Enabled := True;
    label_install_location.Left := ScaleX(20);
    label_install_location.Top := ScaleY(423);
    BtnSetEnabled(button_change_dir, True);
    BtnSetPosition(button_change_dir, WizardForm.ClientWidth - ScaleX(20) - ScaleX(75), ScaleY(420), ScaleX(75), ScaleY(24));
    edit_target_path.Left := label_install_location.Left + label_install_location.Width + ScaleX(12);
    edit_target_path.Top := ScaleY(423);
    edit_target_path.Width := (WizardForm.ClientWidth - ScaleX(20) - ScaleX(75)) - ScaleX(10) - edit_target_path.Left;
    edit_target_path.Height := ScaleY(20);
    BtnSetVisibility(button_change_dir, True);
    if Assigned(label_custom_install_toggle) then
    begin
      label_custom_install_toggle.Caption := CustomMessage('custom_install_expand');
      label_custom_install_toggle.Left := WizardForm.ClientWidth - ScaleX(20) - label_custom_install_toggle.Width;
      label_custom_install_toggle.Top := ScaleY(374) + (ScaleY(17) - label_custom_install_toggle.Height) div 2;
      label_custom_install_toggle.Show();
    end;
#ifndef PortableBuild
    already_installed := is_installed_before();
    if already_installed then
    begin
      is_upgrade_install := True;
#ifdef LimitACE
      need_to_change_associations := False;
      BtnSetVisibility(checkbox_setdefault, False);
      if Assigned(label_checkbox_limitace_prefix) then label_checkbox_limitace_prefix.Hide();
#endif
      edit_target_path.Enabled := False;
      BtnSetEnabled(button_change_dir, False);
      label_wizardform_more_product_already_installed.Show();
      set_main_action_button_variant(1);
    end else
    begin
      set_main_action_button_variant(0);
    end;
#endif
    set_wizard_client_height_keep_center(ScaleY(WIZARDFORM_HEIGHT_NORMAL));
    center_wizard_form_on_screen();
    ImgApplyChanges(WizardForm.Handle);
  end;
  if (CurPageID = wpInstalling) then
  begin
    stop_animation_timer;
    is_wizardform_show_normal := True;
    wizardform_animation_timer := SetTimer(0, 0, 1, WrapTimerProc(@show_normal_wizardform_animation, 4));
    edit_target_path.Hide();
    label_install_location.Hide();
    BtnSetVisibility(button_change_dir, False);
    label_wizardform_more_product_already_installed.Hide();
    is_wizardform_show_normal := True;
    if Assigned(label_custom_install_toggle) then label_custom_install_toggle.Hide();
    BtnSetVisibility(button_close, False);
    BtnSetPosition(button_minimize, ScaleX(570), 0, ScaleX(30), ScaleY(30));
#ifdef LimitACE
    BtnSetVisibility(checkbox_setdefault, False);
    if Assigned(label_checkbox_limitace_prefix) then label_checkbox_limitace_prefix.Hide();
#endif
#ifdef ShowLicenseAgreement
    if Assigned(label_license_link) then label_license_link.Hide();
    if Assigned(label_license_accept_prefix) then label_license_accept_prefix.Hide();
    BtnSetVisibility(checkbox_license, False);
#endif
    label_install_text := TLabel.Create(WizardForm);
    with label_install_text do
    begin
      Parent := WizardForm;
      AutoSize := False;
      Left := ScaleX(20);
      Top := ScaleY(349);
      ClientWidth := ScaleX(60);
      ClientHeight := ScaleY(30);
      Font.Size := 10;
      Font.Color := clBlack;
      Caption := CustomMessage('installing_label_text');
      Transparent := True;
      OnMouseDown := @wizardform_on_mouse_down;
    end;
    label_install_progress := TLabel.Create(WizardForm);
    with label_install_progress do
    begin
      Parent := WizardForm;
      AutoSize := False;
      Left := ScaleX(547);
      Top := ScaleY(349);
      ClientWidth := ScaleX(30);
      ClientHeight := ScaleY(30);
      Font.Size := 10;
      Font.Color := clBlack;
      Caption := '';
      Transparent := True;
      Alignment := taRightJustify;
      OnMouseDown := @wizardform_on_mouse_down;
    end;
    image_wizardform_background := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\background_installing.png'), 0, 0, ScaleX(WIZARDFORM_WIDTH_NORMAL), ScaleY(WIZARDFORM_HEIGHT_NORMAL), True, True);
    image_progressbar_background := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\progressbar_background.png'), ScaleX(20), ScaleY(374), ScaleX(560), ScaleY(6), True, True);
    image_progressbar_foreground := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\progressbar_foreground.png'), ScaleX(20), ScaleY(374), 0, 0, True, True);
    BtnSetVisibility(button_setup_or_next, False);
#ifdef ShowSlidePictures
    slide_1_b := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\slides_picture_1.png'), 0, 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT), True, True);
    slide_2_b := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\slides_picture_2.png'), 0, 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT), True, True);
    slide_3_b := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\slides_picture_3.png'), 0, 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT), True, True);
    slide_4_b := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\slides_picture_4.png'), 0, 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT), True, True);
    slide_1_t := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\slides_picture_1.png'), 0, 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT), True, True);
    slide_2_t := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\slides_picture_2.png'), 0, 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT), True, True);
    slide_3_t := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\slides_picture_3.png'), 0, 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT), True, True);
    slide_4_t := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\slides_picture_4.png'), 0, 0, ScaleX(SLIDES_PICTURE_WIDTH), ScaleY(SLIDES_PICTURE_HEIGHT), True, True);
    ImgSetVisibility(slide_1_t, False);
    ImgSetVisibility(slide_2_t, False);
    ImgSetVisibility(slide_3_t, False);
    ImgSetVisibility(slide_4_t, False);
    ImgSetVisibility(slide_1_b, False);
    ImgSetVisibility(slide_2_b, False);
    ImgSetVisibility(slide_3_b, False);
    ImgSetVisibility(slide_4_b, False);
#endif
    ImgApplyChanges(WizardForm.Handle);
#ifdef ShowSlidePictures
    stop_slide_timer;
    stop_slide_pause_timer;
    time_counter := 0;
	  slide_picture_timer := SetTimer(0, 0, 20, WrapTimerProc(@pictures_slides_animation, 4));
#endif
  end;
  if (CurPageID = wpFinished) then
  begin
#ifdef ShowSlidePictures
    stop_slide_timer;
    stop_slide_pause_timer;
    time_counter := 0;
#endif
    label_install_text.Caption := '';
    label_install_text.Visible := False;
    label_install_progress.Caption := '';
    label_install_progress.Visible := False;
    ImgSetVisibility(image_progressbar_background, False);
    ImgSetVisibility(image_progressbar_foreground, False);
    BtnSetPosition(button_minimize, ScaleX(540), 0, ScaleX(30), ScaleY(30));
    BtnSetVisibility(button_close, True);
    set_main_action_button_variant(2);
    BtnSetEvent(button_close, ID_BUTTON_ON_CLICK_EVENT, WrapBtnCallback(@button_setup_or_next_on_click, 1));
    image_wizardform_background := ImgLoad(WizardForm.Handle, ExpandConstant('{tmp}\background_finish.png'), 0, 0, ScaleX(WIZARDFORM_WIDTH_NORMAL), ScaleY(WIZARDFORM_HEIGHT_NORMAL), True, True);
    ImgApplyChanges(WizardForm.Handle);
  end;
end;

//安装步骤改变时会调用这个函数
procedure CurStepChanged(CurStep : TSetupStep);
begin
  if (CurStep = ssPostInstall) then
  begin
#ifdef LimitACE
    check_if_need_change_associations();
#endif
    //and do other things you want
  end;
  if (CurStep = ssDone) then
  begin
    is_wizardform_released := True;
    release_installer();
#ifdef UseCustomUninstaller
    change_reg_uninst;
#endif
  end;
end;

//指定跳过哪些标准页面
function ShouldSkipPage(PageID : integer) : boolean;
begin
  if (PageID = wpLicense) then Result := True;
  if (PageID = wpPassword) then Result := True;
  if (PageID = wpInfoBefore) then Result := True;
  if (PageID = wpUserInfo) then Result := True;
  if (PageID = wpSelectDir) then Result := True;
  if (PageID = wpSelectComponents) then Result := True;
  if (PageID = wpSelectProgramGroup) then Result := True;
  if (PageID = wpSelectTasks) then Result := True;
  if (PageID = wpReady) then Result := True;
  if (PageID = wpPreparing) then Result := True;
  if (PageID = wpInfoAfter) then Result := True;
end;
