function GetRealUserAppData(Param: String): String;
var
  RealAppData: String;
begin
  // 尝试通过系统底层环境变量或注册表直接抓取当前登录未提权用户的 AppData 路径
  // 如果抓取失败，则降级使用标准的 {userappdata}
  if RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders', 'AppData', RealAppData) then
  begin
    Result := RealAppData;
  end
  else
  begin
    Result := ExpandConstant('{userappdata}');
  end;
end;