<#
.SYNOPSIS
    通过任务计划程序实现或取消程序的开机高权限免 UAC 自启。
.EXAMPLE
    .\Manage-AutoStart.ps1 -Install
.EXAMPLE
    .\Manage-AutoStart.ps1 -Uninstall
#>

Param(
    [Parameter(Mandatory = $false)]
    [Switch]$Install,

    [Parameter(Mandatory = $false)]
    [Switch]$Uninstall
)
# 1. 防呆检查
if ($Install -and $Uninstall) {
    Write-Error "错误：不能同时指定 -Install 和 -Uninstall 参数！"
    Exit 1
}

# 2. 核心修复：立即锁定工作目录为脚本所在目录
Set-Location $PSScriptRoot
# =================================================================================
# 配置区：定义你的程序路径和任务名称（现在支持相对路径，例如 ".\Hutao.exe"）
# =================================================================================
$ExePath = ".\Hutao.exe" 
$TaskName = "LimitSGuard"

# =================================================================================
# 1. 环境与自动提权检查
# =================================================================================
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "检测到无管理员权限，正在尝试请求提权..." -ForegroundColor Yellow
    
    # 根据当前传入的开关，决定给新窗口带上什么参数
    $ActionFlag = ""
    if ($Install) { $ActionFlag = "-Install" }
    elseif ($Uninstall) { $ActionFlag = "-Uninstall" }
    
    # 终极修复：直接拼成最纯粹的单条字符串命令，避免数组嵌套导致的高权限窗口解析崩溃
    $ArgString = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $ActionFlag"
    
    try {
        # 备注：测试时如果想看新窗口可能出现的其他报错，可以把下面的 "-NoProfile" 改为 "-NoExit -NoProfile"
        Start-Process powershell -ArgumentList $ArgString -Verb RunAs
        Exit 0
    } catch {
        Write-Error "提权失败：用户拒绝了 UAC 授权。"
        Exit 1
    }
}

# =================================================================================
# 2. 无参数交互菜单
# =================================================================================
if (-not $Install -and -not $Uninstall) {
    $InteractiveMode = $true # 👈 标记当前为交互式菜单模式
    Clear-Host
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "        程序开机免 UAC 自启管理工具" -ForegroundColor Cyan
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host " 1. [安装] 设置程序开机以最高权限自启"
    Write-Host " 2. [卸载] 取消该程序的开机自启并清理残留"
    Write-Host " 3. [退出] 结束脚本"
    Write-Host "---------------------------------------------"
    
    $Choice = Read-Host "请选择操作序号 (1-3)"
    switch ($Choice) {
        "1" { $Install = $true }
        "2" { $Uninstall = $true }
        default { 
            Write-Host "已取消操作。" -ForegroundColor Gray
            Exit 0 
        }
    }
}

# =================================================================================
# 3. 路径解析（将相对路径转换为绝对路径）
# =================================================================================
# 切换到脚本所在目录，确保相对路径基准正确
Set-Location $PSScriptRoot

# 解析为绝对路径
$AbsoluteExePath = Resolve-Path $ExePath -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path

# 如果 Resolve-Path 没找到文件，尝试拼合绝对路径（用于卸载时文件可能已被手动删除的情况）
if (-not $AbsoluteExePath) {
    $AbsoluteExePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PSScriptRoot, $ExePath))
}

# =================================================================================
# 4. 执行卸载逻辑 (Uninstall) 
# =================================================================================
if ($Uninstall) {
    Write-Host "正在执行卸载流程，清理开机启动项..." -ForegroundColor Cyan
    
    # 清理计划任务
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "成功：已移除计划任务 [$TaskName]。" -ForegroundColor Green
    } else {
        Write-Host "提示：未找到名为 [$TaskName] 的计划任务。" -ForegroundColor Yellow
    }

    # 清理可能残留的注册表常规启动项
    $RunPaths = @("HKCU:\Software\Microsoft\Windows\CurrentVersion\Run", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run")
    foreach ($Path in $RunPaths) {
        if ((Get-ItemProperty -Path $Path -Name $TaskName -ErrorAction SilentlyContinue)) {
            Remove-ItemProperty -Path $Path -Name $TaskName -Force
            Write-Host "已清理注册表启动项: $Path\$TaskName" -ForegroundColor Gray
        }
    }
    Write-Host "卸载完成！" -ForegroundColor Green
    # 只有在交互式菜单模式下才暂停
    if ($InteractiveMode) {
        Write-Host "按任意键退出..." ; [void]$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}

# =================================================================================
# 5. 执行安装逻辑 (Install)
# =================================================================================
if ($Install) {
    # 安装时必须保证目标文件存在
    if (-not (Test-Path $AbsoluteExePath)) {
        Write-Error "找不到指定的目标文件，请检查路径是否正确！`n当前解析出的绝对路径为: $AbsoluteExePath"
        # 只有在交互式菜单模式下才暂停
        if ($InteractiveMode) {
            Write-Host "按任意键退出..." ; [void]$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        }
        Exit 1
    }

    Write-Host "正在执行安装流程，配置无提示自启..." -ForegroundColor Cyan
    Write-Host "目标程序绝对路径: $AbsoluteExePath" -ForegroundColor Gray

    # 预清理旧任务和注册表项，防止冲突
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    $RunPaths = @("HKCU:\Software\Microsoft\Windows\CurrentVersion\Run", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run")
    foreach ($Path in $RunPaths) {
        if ((Get-ItemProperty -Path $Path -Name $TaskName -ErrorAction SilentlyContinue)) {
            Remove-ItemProperty -Path $Path -Name $TaskName -Force
        }
    }

    # 创建计划任务组件（使用解析后的绝对路径）
    $Action = New-ScheduledTaskAction -Execute $AbsoluteExePath -WorkingDirectory (Split-Path $AbsoluteExePath)
    $Trigger = New-ScheduledTaskTrigger -AtLogOn
    $Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0

    # 注册任务
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings | Out-Null

    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Write-Host "成功：计划任务 [$TaskName] 已创建！" -ForegroundColor Green
        Write-Host "程序将在下次登录系统时，以最高权限静默启动。" -ForegroundColor Green
    } else {
        Write-Error "错误：创建计划任务失败。"
        Exit 1
    }
    # 只有在交互式菜单模式下才暂停
    if ($InteractiveMode) {
        Write-Host "按任意键退出..." ; [void]$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}