# 如果不是管理员，自动弹窗提权
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    Exit
}

# 提权成功后，切换回脚本目录并强制覆盖
Set-Location $PSScriptRoot
Copy-Item -Path "{app}\Pengu\.pengu\plugins\sona\*" -Destination "C:\ProgramData\.pengu\plugins\sona" -Recurse -Force

