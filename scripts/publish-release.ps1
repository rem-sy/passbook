# 密码本 · 发布 GitHub Release（v4.9.0 起每版必跑：自动更新依赖 Release 产物）
# 用法：powershell -ExecutionPolicy Bypass -File scripts\publish-release.ps1 [-Tag v4.9.0]
# 前提：tag 已 push；%TEMP%\gh-token.txt 有 GitHub Token（repo contents 写权限）
# 只挂正式产物：setup / portable / 正式 APK / latest.json。预置版（-preset）绝不上传。
param([string]$Tag = '')

$ErrorActionPreference = 'Stop'
$proj = 'D:\hobby\源码\密码本'
$prod = 'D:\hobby\产物\密码本'
$repo = 'rem-sy/passbook'

if (-not $Tag) { $Tag = (git -C $proj describe --tags --abbrev=0).Trim() }
if (-not $Tag) { throw '未指定 -Tag 且无法从 git 取最新 tag' }
$ver = $Tag -replace '^v',''
Write-Host "发布 $Tag（版本 $ver）"

$tokenFile = Join-Path $env:TEMP 'gh-token.txt'
if (-not (Test-Path $tokenFile)) { throw "缺少 $tokenFile（GitHub Token，contents 写权限）" }
$token = (Get-Content $tokenFile -Raw).Trim()
if (-not $token) { throw 'gh-token.txt 为空' }

# 代理探测：7890 通则走，否则直连
$proxy = $null
try {
  $t = New-Object System.Net.Sockets.TcpClient
  $t.ConnectAsync('127.0.0.1', 7890).Wait(1200) | Out-Null
  if ($t.Connected) { $proxy = 'http://127.0.0.1:7890' }
  $t.Close()
} catch { }
Write-Host ("网络：" + $(if ($proxy) { "代理 $proxy" } else { '直连' }))

$irm = {
  param($Method, $Uri, $Body, $InFile, $ContentType)
  $args = @{ Method = $Method; Uri = $Uri -replace '\{.*\}',''; Headers = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }; UserAgent = 'passbook-release' }
  if ($proxy) { $args.Proxy = $proxy }
  if ($Body) { $args.Body = $Body; $args.ContentType = 'application/json' }
  if ($InFile) { $args.InFile = $InFile; $args.ContentType = $ContentType }
  Invoke-RestMethod @args
}

# 1) 建 Release（已存在则复用）
$assets = @(
  @{ Path = "$prod\Passbook-Android-$ver-arm64.apk";        Name = "Passbook-Android-$ver-arm64.apk";        Type = 'application/vnd.android.package-archive' },
  @{ Path = "$prod\Passbook_${ver}_x64-setup.exe";          Name = "Passbook_${ver}_x64-setup.exe";          Type = 'application/octet-stream' },
  @{ Path = "$prod\Passbook_${ver}_portable.exe";           Name = "Passbook_${ver}_portable.exe";           Type = 'application/octet-stream' },
  @{ Path = "$prod\latest.json";                            Name = 'latest.json';                            Type = 'application/json' }
)
foreach ($a in $assets) {
  if (-not (Test-Path $a.Path)) { throw "缺少产物：$($a.Path)（先跑 build-android / build-desktop）" }
}

try {
  $rel = & $irm Post "https://api.github.com/repos/$repo/releases" (@{ tag_name = $Tag; name = $Tag; draft = $false; prerelease = $false } | ConvertTo-Json)
  Write-Host "Release 已创建 id=$($rel.id)"
} catch {
  # 已存在（422）→ 取既有 Release
  $rels = & $irm Get "https://api.github.com/repos/$repo/releases/tags/$Tag"
  $rel = $rels
  Write-Host "Release 已存在，复用 id=$($rel.id)"
}

# 2) 传资产（重名先删：同 tag 重发场景幂等）。latest.json 为 build-desktop 生成的公开直链版
#    （platforms.url 指向 github.com/releases/download/...，公开仓免认证可用；
#     私有仓 assets API 兼容方案已随仓库转公开移除，历史实现见 v4.9.0 tag）
foreach ($a in $assets) {
  $exist = @($rel.assets | Where-Object { $_.name -eq $a.Name })
  foreach ($e in $exist) {
    & $irm Delete "https://api.github.com/repos/$repo/releases/assets/$($e.id)" | Out-Null
    Write-Host "  删旧资产 $($a.Name)"
  }
  $up = "https://uploads.github.com/repos/$repo/releases/$($rel.id)/assets?name=$([uri]::EscapeDataString($a.Name))"
  & $irm Post $up $null $a.Path $a.Type | Out-Null
  Write-Host ("  已上传 {0}（{1:N1} MB）" -f $a.Name, ((Get-Item $a.Path).Length / 1MB))
}
Write-Host "完成：https://github.com/$repo/releases/tag/$Tag"
