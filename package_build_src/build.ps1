Set-Location $PSScriptRoot
$CurrentTime = (Get-Date).ToString("yyyyMMdd_HHmmss")
$BaseName = "build_$CurrentTime"

# 1. /F 指定文件名，/O 指定输出目录为上一级菜单的 build 文件夹
$FileNameArg = "/F`"$BaseName`""
$OutputDirArg = "/O`"../build`""

# 执行打包命令
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" '.\install_script.iss' $FileNameArg $OutputDirArg
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 2. 将查找和运行的路径同步修改为 ../build
$OutDir = Resolve-Path (Join-Path $PSScriptRoot '../build')
$OutExe = Join-Path $OutDir ($BaseName + '.exe')

if (Test-Path -LiteralPath $OutExe) {
    # 运行生成的安装包
    Start-Process -FilePath $OutExe -WorkingDirectory $PSScriptRoot
} else {
    Write-Error "编译成功但未找到输出文件：$OutExe"
    exit 1
}
exit $LASTEXITCODE