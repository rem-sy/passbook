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

# v4.9.0：更新签名密钥（tauri signer generate 产物；与 jks 同目录，绝不入库）
# 坑：密钥必须带密码——PS5.1 给 env 赋空串等于删除变量，空密码密钥会令 CLI
# 交互式等密码输入、在 cmd 重定向下永久挂起（踩过两次：BOM 丢失 + 空密码）
$updaterKey = 'D:\hobby\产物\密码本\signing\updater.key'
$updaterKeyPw = 'passbook2024'
if (Test-Path $updaterKey) {
  $env:TAURI_SIGNING_PRIVATE_KEY = [System.IO.File]::ReadAllText($updaterKey)
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $updaterKeyPw
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PATH -ErrorAction SilentlyContinue
  Write-Host "更新签名密钥已加载（将产出 .sig）"
} else {
  Write-Warning '未找到 updater.key：本次构建不产出更新签名（latest.json 将跳过）'
}

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
    # v4.9.0：正式版产 latest.json（updater 插件静态清单；签名随构建变化）
    if ($official) {
      $sigFile = "$proj\src-tauri\target\release\bundle\nsis\密码本_${ver}_x64-setup.exe.sig"
      if (Test-Path $sigFile) {
        $sig = ([System.IO.File]::ReadAllText($sigFile)).Trim()
        $setupUrl = "https://github.com/rem-sy/passbook/releases/download/v$ver/Passbook_${ver}_x64-setup.exe"
        $latest = @{ version = $ver; notes = ''; pub_date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); platforms = @{ 'windows-x86_64' = @{ signature = $sig; url = $setupUrl } } } | ConvertTo-Json -Depth 5
        [System.IO.File]::WriteAllText("$prod\latest.json", $latest, (New-Object System.Text.UTF8Encoding($false)))
        Copy-Item $sigFile "$prod\Passbook_${ver}_x64-setup.exe.sig" -Force
        Write-Host "    latest.json 已生成（v$ver）"
      } else { Write-Warning '未找到 setup .sig：跳过 latest.json（老版本更新通道不受影响）' }
    }
  } finally {
    if ($bak) { Move-Item $bak $localCfg -Force; Write-Host '    已恢复 agent-config.local.js' }
  }
}

if (!$SkipOfficial) { Build-One '正式版（无预置渠道，对外发布）' '' -official }
if (!$SkipPreset) { Build-One '预置渠道版（-preset，仅本机）' '-preset' }
Write-Host '全部完成'
