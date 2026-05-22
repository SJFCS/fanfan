# 1. 强杀进程（静默执行，即便进程不存在也不报错）
Stop-Process -Name "Hutao" -Force -ErrorAction SilentlyContinue


# 1. 定义子脚本的绝对路径
$HutaoScript = Join-Path $PSScriptRoot ".\Auto-Start-Hutao.ps1"
$TaskScript  = Join-Path $PSScriptRoot ".\Optimize-ACES-cheduled-Task.ps1"

# 2. 检查并执行第一个脚本：Auto-Start-Hutao.ps1
if (Test-Path $HutaoScript) {
    Write-Host "正在运行: Auto-Start-Hutao.ps1..." -ForegroundColor Gray
    & $HutaoScript -Uninstall
} else {
    Write-Warning "未找到脚本: $HutaoScript"
}

# 3. 检查并执行第二个脚本：Optimize-ACES-cheduled-Task.ps1
if (Test-Path $TaskScript) {
    Write-Host "正在运行: Optimize-ACES-cheduled-Task.ps1..." -ForegroundColor Gray
    & $TaskScript -Uninstall
} else {
    Write-Warning "未找到脚本: $TaskScript"
}

# 2. 删除系统服务（无需依靠 sc.exe，用 PowerShell 原生命令更稳）
if (Get-Service -Name "Hutao" -ErrorAction SilentlyContinue) {
    Remove-Service -Name "Hutao" -Force -ErrorAction SilentlyContinue
}

# 3. 清理硬盘文件（$PSScriptRoot 代表当前脚本所在文件夹）
Remove-Item -Path "$PSScriptRoot\Hutao.exe" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$PSScriptRoot\vsocks.dll" -Force -ErrorAction SilentlyContinue

# 4. 获取真正登录的用户名，精准清理注册表自启项与 AppData 缓存
$realUser = (Get-Process explorer).Username -replace '^.*\\'

if ($realUser) {
    # 彻底拔除该用户注册表中的自启项
    Remove-ItemProperty -Path "Registry::HKEY_USERS\$realUser\Software\Microsoft\Windows\CurrentVersion\Run" -Name "Hutao" -ErrorAction SilentlyContinue
    
    # 彻底删除该用户的 AppData\Roaming\Hutao 文件夹
    $realAppData = "C:\Users\$realUser\AppData\Roaming\Hutao"
    if (Test-Path $realAppData) {
        Remove-Item -Path $realAppData -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 5. 安全兜底：如果以 Administrator 运行时产生了残留，顺便把 Administrator 的也清了
Remove-ItemProperty -Path "Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run" -Name "Hutao" -ErrorAction SilentlyContinue
if (Test-Path "$env:APPDATA\Hutao") {
    Remove-Item -Path "$env:APPDATA\Hutao" -Recurse -Force -ErrorAction SilentlyContinue
}