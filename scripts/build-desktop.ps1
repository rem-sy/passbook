# 密码本桌面版双版本构建：正式版（无渠道，无后缀，对外发布）+ 预置渠道版（-preset，仅本机）
# 用法：powershell -ExecutionPolicy Bypass -File scripts\build-desktop.ps1 [-SkipPreset] [-SkipClean]
# 预置渠道来自 public\agent-config.local.js（不入库，本机文件）；
# 正式版构建时该文件被临时移出，产物不带任何渠道；预置版绝不上传 GitHub。
# 产物统一复制到 D:\hobby\产物\密码本\
param([switch]$SkipPreset, [switch]$SkipOfficial)

$ErrorActionPreference = 'Stop'
$proj = 'D:\hobby\源码\密码本'
$prod = 'D:\hobby\产物\密码本'
$localCfg = "$proj\public\agent-config.local.js"
# 版本号从 tauri.conf.json 读取，与三处版本文件保持一致
$ver = (Select-String -Path "$proj\src-tauri\tauri.conf.json" -Pattern '"version"\s*:\s*"([^"]+)"').Matches[0].Groups[1].Value
if (-not $ver) { throw '无法从 tauri.conf.json 解析版本号' }
Write-Host "版本：$ver"

$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:CARGO_NET_OFFLINE = 'true'

function Build-One([string]$name, [string]$suffix, [switch]$official) {
  Write-Host "==> 构建 $name"
  $bak = $null
  if ($official -and (Test-Path $localCfg)) {
    $bak = Join-Path $env:TEMP ("agent-config.local." + [guid]::NewGuid().ToString('N').Substring(0,8) + ".bak")
    Move-Item $localCfg $bak -Force
    Write-Host "    已临时移出 agent-config.local.js"
  }
  if (-not $official -and -not (Test-Path $localCfg)) {
    Write-Warning '未找到 agent-config.local.js，预置版将不带预置渠道（等同正式版）'
  }
  try {
    # 强制 tauri 重新嵌入前端（touch 入口文件触发 build.rs 重跑）
    (Get-Item "$proj\public\app.js").LastWriteTime = Get-Date
    Push-Location $proj
    # 经 cmd 走日志文件，避免 PS5.1 把子进程 stderr 当错误中断脚本
    $log = Join-Path $env:TEMP 'passbook-tauri-build.log'
    & $env:ComSpec /c "node_modules\.bin\tauri.cmd build > `"$log`" 2>&1"
    $code = $LASTEXITCODE
    if ($code -ne 0) {
      Get-Content $log -Tail 15 -ErrorAction SilentlyContinue | Write-Host
      Pop-Location; throw "tauri build 失败（$name，退出码 $code）"
    }
    Pop-Location
    Copy-Item "$proj\src-tauri\target\release\bundle\nsis\密码本_${ver}_x64-setup.exe" "$prod\Passbook_${ver}_x64-setup$suffix.exe" -Force
    Copy-Item "$proj\src-tauri\target\release\passbook-desktop.exe" "$prod\Passbook_${ver}_portable$suffix.exe" -Force
    Write-Host "    完成：Passbook_${ver}_x64-setup$suffix.exe + Passbook_${ver}_portable$suffix.exe"
  } finally {
    if ($bak) { Move-Item $bak $localCfg -Force; Write-Host '    已恢复 agent-config.local.js' }
  }
}

if (!$SkipOfficial) { Build-One '正式版（无预置渠道，对外发布）' '' -official }
if (!$SkipPreset) { Build-One '预置渠道版（-preset，仅本机）' '-preset' }
Write-Host '全部完成'
