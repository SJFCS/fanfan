# 1. 定义子脚本的绝对路径
$HutaoScript = Join-Path $PSScriptRoot "LimitSguard\Auto-Start-Hutao.ps1"
$TaskScript  = Join-Path $PSScriptRoot "LimitSguard\Optimize-ACES-cheduled-Task.ps1"

# 2. 检查并执行第一个脚本：Auto-Start-Hutao.ps1
if (Test-Path $HutaoScript) {
    Write-Host "正在运行: Auto-Start-Hutao.ps1..." -ForegroundColor Gray
    & $HutaoScript -Install
} else {
    Write-Warning "未找到脚本: $HutaoScript"
}

# 3. 检查并执行第二个脚本：Optimize-ACES-cheduled-Task.ps1
if (Test-Path $TaskScript) {
    Write-Host "正在运行: Optimize-ACES-cheduled-Task.ps1..." -ForegroundColor Gray
    & $TaskScript -Install
} else {
    Write-Warning "未找到脚本: $TaskScript"
}

