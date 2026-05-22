<#
.SYNOPSIS
    ACE (AntiCheatExpert) 反作弊静态压制与动态核心绑定工具。
.EXAMPLE
    .\Optimize-ACE.ps1 -Install
.EXAMPLE
    .\Optimize-ACE.ps1 -Uninstall
#>

Param(
    [Parameter(Mandatory = $false)]
    [Switch]$Install,

    [Parameter(Mandatory = $false)]
    [Switch]$Uninstall
)

# ==============================================================================
# 1. 环境与自动提权检查 (完美携带参数)
# ==============================================================================
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "检测到当前未以管理员身份运行，正在尝试请求提权..." -ForegroundColor Yellow
    
    # 动态捕获用户输入的参数，防止提权后参数丢失或解析错误
    $CommandLine = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    if ($MyInvocation.BoundParameters.Count -gt 0) {
        foreach ($key in $MyInvocation.BoundParameters.Keys) {
            $CommandLine += "-$key"
        }
    }
    
    # 拉起管理员权限窗口
    Start-Process powershell -ArgumentList $CommandLine -Verb RunAs
    Exit
}

# 互斥参数防呆检查
if ($Install -and $Uninstall) {
    Write-Error "错误：不能同时指定 -Install 和 -Uninstall 参数！"
    Exit 1
}

# 全局变量定义
$BaseRegPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options"
$Apps = @("ACE-Tray.exe", "SGuardUpdate64.exe", "SGuardSvc64.exe", "SGuard64.exe", "ACE-Service64.exe")
$TargetDir = 'C:\Program Files\AntiCheatExpert\SGuard\x64'
$TaskNames = @("SGuard64_Affinity_Direct", "SGuardSvc64_Affinity_Direct")

# ==============================================================================
# 新增：交互式菜单逻辑（当未传入任何参数时触发）
# ==============================================================================
if (-not $Install -and -not $Uninstall) {
    $InteractiveMode = $true # 👈 标记当前为交互式菜单模式
    Clear-Host
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "       ACE 反作弊静态压制与动态核心绑定工具       " -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host " [1] 注入压制策略 (限制资源占用、锁死最后一核)" -ForegroundColor Green
    Write-Host " [2] 卸载压制策略 (还原系统默认调度)" -ForegroundColor Yellow
    Write-Host " [3] 退出脚本" -ForegroundColor White
    Write-Host "==================================================" -ForegroundColor Cyan
    
    do {
        $choice = Read-Host "请输入选项序号 [1-3]"
    } while ($choice -notin @("1", "2", "3"))

    switch ($choice) {
        "1" { $Install = $true }
        "2" { $Uninstall = $true }
        "3" { Write-Host "已退出。"; Start-Sleep -Seconds 1; Exit }
    }
}

# ==============================================================================
# 2. 执行【安装/注入】流程
# ==============================================================================
if ($Install) {
    Write-Host "`n=== 开始注入 ACE 反作弊压制策略 ===" -ForegroundColor Cyan
    
    # 2.1 注册表静态注入
    Write-Host "正在通过注册表静态注入低资源策略..." -ForegroundColor Cyan
    foreach ($app in $Apps) {
        $PerfPath = "$BaseRegPath\$app\PerfOptions"
        if (-not (Test-Path $PerfPath)) { New-Item $PerfPath -Force | Out-Null }
        
        Set-ItemProperty $PerfPath -Name "CpuPriorityClass" -Value 1 -Type DWord -Force    # 设为 1: 闲置（最低CPU优先级）
        Set-ItemProperty $PerfPath -Name "IoPriority" -Value 0 -Type DWord -Force          # 设为 0: 非常低（避免抢占硬盘读写）
        Set-ItemProperty $PerfPath -Name "PagePriority" -Value 1 -Type DWord -Force        # 设为 1: 非常低（内存页面极低优先级）
        
        Write-Host " 已对进程 [$app] 注入低资源优先级策略。" -ForegroundColor Gray
    }

    # 2.2 计算核心掩码
    $CoreCount = [Environment]::ProcessorCount
    $LastCoreMask = [Math]::Pow(2, $CoreCount - 1)
    $MaskHex = "0x" + [Convert]::ToString([long]$LastCoreMask, 16) + "L"
    Write-Host "`n系统共有 $CoreCount 个逻辑线程，已自动匹配最后一个核心掩码: $MaskHex" -ForegroundColor Green

    # 2.3 生成动态压制 BAT 脚本
    if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Force $TargetDir | Out-Null }
    $Bat64 = "powershell -NoP -C `"Get-Process SGuard64 -EA 0 | %%{`$_.ProcessorAffinity = $MaskHex; `$_.PriorityClass = 'Idle'}`""
    $BatSvc64 = "powershell -NoP -C `"Get-Process SGuardSvc64 -EA 0 | %%{`$_.ProcessorAffinity = $MaskHex; `$_.PriorityClass = 'Idle'}`""

    Set-Content -Path (Join-Path $TargetDir "SGuard64_Affinity_Direct.bat") -Value $Bat64 -Encoding ASCII
    Set-Content -Path (Join-Path $TargetDir "SGuardSvc64_Affinity_Direct.bat") -Value $BatSvc64 -Encoding ASCII
    Write-Host "已生成【核心绑定 + 动态优先级压制】双效批处理脚本。" -ForegroundColor Gray

    # 2.4 开启审计并创建事件触发计划任务
    Write-Host "`n正在配置事件触发计划任务..." -ForegroundColor Cyan
    auditpol /set /subcategory:'{0CCE922B-69AE-11D9-BED3-505054503030}' /success:enable | Out-Null

    function Create-MiniTask ([string]$TaskName, [string]$ProcName, [string]$BatName) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        
        $service = New-Object -ComObject Schedule.Service; $service.Connect()
        $root = $service.GetFolder('\'); $task = $service.NewTask(0)
        
        $task.Principal.UserId = 'SYSTEM'; $task.Principal.RunLevel = 1
        $task.Settings.MultipleInstances = 2
        
        $trigger = $task.Triggers.Create(0)
        $trigger.Subscription = @"
<QueryList>
  <Query Id='0' Path='Security'>
    <Select Path='Security'>*[System[EventID=4688]] and *[EventData[Data[@Name='NewProcessName'] and (Data="$TargetDir\$ProcName.exe")]]</Select>
  </Query>
</QueryList>
"@
        $action = $task.Actions.Create(0)
        $action.Path = (Join-Path $TargetDir $BatName)
        
        $root.RegisterTaskDefinition($TaskName, $task, 6, $null, $null, 1, $null) | Out-Null
        Write-Host " 计划任务 [$TaskName] 已成功创建。" -ForegroundColor Gray
    }

    Create-MiniTask -TaskName "SGuard64_Affinity_Direct" -ProcName "SGuard64" -BatName "SGuard64_Affinity_Direct.bat"
    Create-MiniTask -TaskName "SGuardSvc64_Affinity_Direct" -ProcName "SGuardSvc64" -BatName "SGuardSvc64_Affinity_Direct.bat"

    Write-Host "`n🚀 策略全面升级成功！当反作弊启动时将自动锁死最后一核+闲置优先级。" -ForegroundColor Green
    # 只有在交互式菜单模式下才暂停
    if ($InteractiveMode) {
        Write-Host "按任意键退出..." ; [void]$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}

# ==============================================================================
# 3. 执行【卸载/还原】流程
# ==============================================================================
if ($Uninstall) {
    Write-Host "`n=== 开始清理与还原 ACE 压制策略 ===" -ForegroundColor Yellow
    
    # 3.1 卸载计划任务
    Write-Host "正在卸载事件触发计划任务..." -ForegroundColor Cyan
    foreach ($taskName in $TaskNames) {
        if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false | Out-Null
            Write-Host " 已成功删除计划任务: [$taskName]" -ForegroundColor Gray
        }
    }

    # 3.2 清理生成的 BAT 脚本文件
    Write-Host "`n正在清理生成的脚本文件..." -ForegroundColor Cyan
    $FilesToClean = @("SGuard64_Affinity_Direct.bat", "SGuardSvc64_Affinity_Direct.bat")
    foreach ($file in $FilesToClean) {
        $FilePath = Join-Path $TargetDir $file
        if (Test-Path $FilePath) {
            Remove-Item $FilePath -Force | Out-Null
            Write-Host " 已删除文件: $file" -ForegroundColor Gray
        }
    }
    # 如果生成的文件夹为空，则连同文件夹一起删掉
    if (Test-Path $TargetDir) {
        if ((Get-ChildItem $TargetDir).Count -eq 0) {
            Remove-Item $TargetDir -Force | Out-Null
        }
    }

    # 3.3 还原注册表设置（删除注入的 PerfOptions）
    Write-Host "`n正在恢复注册表静态设置..." -ForegroundColor Cyan
    foreach ($app in $Apps) {
        $PerfPath = "$BaseRegPath\$app\PerfOptions"
        if (Test-Path $PerfPath) {
            Remove-Item $PerfPath -Recurse -Force | Out-Null
            Write-Host " 已清除 [$app] 的注册表压制策略。" -ForegroundColor Gray
        }
        # 如果整个应用的映像劫持项下没有其他东西了，连同应用项一起清理
        $AppPath = "$BaseRegPath\$app"
        if (Test-Path $AppPath) {
            if ((Get-ChildItem $AppPath).Count -eq 0) { Remove-Item $AppPath -Force | Out-Null }
        }
    }

    Write-Host "`n✨ 所有压制策略已成功卸载，ACE 反作弊已恢复默认系统调度。" -ForegroundColor Green
    # 只有在交互式菜单模式下才暂停
    if ($InteractiveMode) {
        Write-Host "按任意键退出..." ; [void]$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}