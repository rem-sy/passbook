# 密码本版本号同步工具：tauri.conf.json / Cargo.toml / package.json 三处统一
# 用法：powershell -ExecutionPolicy Bypass -File scripts\bump-version.ps1 -Version 1.2.0
param([Parameter(Mandatory = $true)][string]$Version)

$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "版本号格式应为 X.Y.Z，收到：$Version" }
$proj = 'D:\hobby\源码\密码本'
$utf8 = [System.Text.UTF8Encoding]::new($false)

# 1. package.json
$pj = "$proj\package.json"
$t = [System.IO.File]::ReadAllText($pj, $utf8)
$t = $t -replace '(?m)"version":\s*"\d+\.\d+\.\d+"', "`"version`": `"$Version`""
[System.IO.File]::WriteAllText($pj, $t, $utf8)

# 2. src-tauri/tauri.conf.json
$tc = "$proj\src-tauri\tauri.conf.json"
$t = [System.IO.File]::ReadAllText($tc, $utf8)
$t = $t -replace '(?m)"version":\s*"\d+\.\d+\.\d+"', "`"version`": `"$Version`""
[System.IO.File]::WriteAllText($tc, $t, $utf8)

# 3. src-tauri/Cargo.toml（仅 [package] 的顶层 version 行）
$ct = "$proj\src-tauri\Cargo.toml"
$t = [System.IO.File]::ReadAllText($ct, $utf8)
$t = $t -replace '(?m)^version\s*=\s*"\d+\.\d+\.\d+"', "version = `"$Version`""
[System.IO.File]::WriteAllText($ct, $t, $utf8)

Write-Host "版本已同步为 $Version：package.json / tauri.conf.json / Cargo.toml"
