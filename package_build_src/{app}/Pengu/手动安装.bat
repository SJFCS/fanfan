@echo off
setlocal

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

:: 获取当前 bat 所在目录
set "APP_DIR=%~dp0"
set "CORE_DLL=%APP_DIR%core.dll"

:: 检查 core.dll 是否存在
if not exist "%CORE_DLL%" (
    echo core.dll not found: "%CORE_DLL%"
    pause
    exit /b 1
)

:: 写入注册表
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\LeagueClientUx.exe" ^
    /v Debugger ^
    /t REG_SZ ^
    /d "rundll32 \"%CORE_DLL%\", #6000" ^
    /f

if %errorlevel% equ 0 (
    echo Register success:
    echo rundll32 "%CORE_DLL%", #6000
) else (
    echo Register failed.
)

pause