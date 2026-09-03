# 密码本桌面版双版本构建：预置渠道版 + 纯净版（无预置渠道）
# 用法：powershell -ExecutionPolicy Bypass -File scripts\build-desktop.ps1 [-SkipPreset] [-SkipClean]
# 预置渠道来自 public\agent-config.local.js（不入库，本机文件）；
# 纯净版构建时该文件被临时移出，产物不带任何渠道。
# 产物统一复制到 D:\hobby\产物\密码本\
param([switch]$SkipPreset, [switch]$SkipClean)

$ErrorActionPreference = 'Stop'
$proj = 'D:\hobby\源码\密码本'
$prod = 'D:\hobby\产物\密码本'
$localCfg = "$proj\public\agent-config.local.js"
$ver = '1.1.0'

$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:CARGO_NET_OFFLINE = 'true'

function Build-One([string]$name, [string]$suffix, [switch]$clean) {
  Write-Host "==> 构建 $name"
  $bak = $null
  if ($clean -and (Test-Path $localCfg)) {
    $bak = Join-Path $env:TEMP ("agent-config.local." + [guid]::NewGuid().ToString('N').Substring(0,8) + ".bak")
    Move-Item $localCfg $bak -Force
    Write-Host "    已临时移出 agent-config.local.js"
  }
  if (-not $clean -and -not (Test-Path $localCfg)) {
    Write-Warning '未找到 agent-config.local.js，预置版将不带预置渠道（等同于纯净版）'
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
    Copy-Item "$proj\src-tauri\target\release\bundle\nsis\密码本_${ver}_x64-setup.exe" "$prod\密码本_${ver}_x64-setup$suffix.exe" -Force
    Copy-Item "$proj\src-tauri\target\release\passbook-desktop.exe" "$prod\密码本-便携版$suffix.exe" -Force
    Write-Host "    完成：密码本_${ver}_x64-setup$suffix.exe + 密码本-便携版$suffix.exe"
  } finally {
    if ($bak) { Move-Item $bak $localCfg -Force; Write-Host '    已恢复 agent-config.local.js' }
  }
}

if (!$SkipPreset) { Build-One '预置渠道版' '' }
if (!$SkipClean) { Build-One '纯净版（无预置渠道）' '-纯净版' -clean }
Write-Host '全部完成'
