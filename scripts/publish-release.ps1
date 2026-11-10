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

# v4.12.0：token 持久位置优先（signing 目录，与 jks/updater.key 同管，不随 TEMP 清理丢失），%TEMP% 兜底
$tokenFile = 'D:\hobby\产物\密码本\signing\gh-token.txt'
if (-not (Test-Path $tokenFile)) { $tokenFile = Join-Path $env:TEMP 'gh-token.txt' }
if (-not (Test-Path $tokenFile)) { throw "缺少 $tokenFile（GitHub Token，contents 写权限；推荐放 signing 目录）" }
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

# 1.5) v4.12.4 更新公告管线：从 docs/RELEASE-NOTES.md 取当前 tag 段落 →
#      写入 Release 正文 + 补写产物 latest.json 的 notes（桌面更新弹窗展示）
$notesPath = Join-Path $proj 'docs\RELEASE-NOTES.md'
if (Test-Path $notesPath) {
  $ver4notes = $Tag -replace '^v',''
  $raw = [System.IO.File]::ReadAllText($notesPath, [System.Text.Encoding]::UTF8)
  if ($raw -match ("(?ms)^##\s+" + [regex]::Escape($Tag) + "\s*\r?\n(.*?)(?=^##\s+|\z)")) {
    $noteBody = $Matches[1].Trim()
    if ($noteBody) {
      try {
        & $irm Patch "https://api.github.com/repos/$repo/releases/$($rel.id)" (@{ body = $noteBody } | ConvertTo-Json) | Out-Null
        Write-Host "Release 正文已写入（$($noteBody.Length) 字符）"
      } catch { Write-Warning "Release 正文写入失败：$($_.Exception.Message)" }
      # 补写 latest.json（桌面 updater 的 notes 字段；手机走 Release body 上面已写）
      $ljPath = Join-Path $prod 'latest.json'
      if (Test-Path $ljPath) {
        try {
          $lj = [System.IO.File]::ReadAllText($ljPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
          $lj.notes = $noteBody
          [System.IO.File]::WriteAllText($ljPath, ($lj | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
          Write-Host 'latest.json 的 notes 已补写'
        } catch { Write-Warning "latest.json notes 补写失败：$($_.Exception.Message)" }
      }
    }
  } else {
    Write-Warning "RELEASE-NOTES.md 中未找到 ## $Tag 段落（$notesPath）——Release 正文与 latest.json notes 将为空"
  }
} else {
  Write-Warning "缺少 $notesPath——更新公告为空"
}

# 2) 传资产（重名先删：同 tag 重发场景幂等）。latest.json 为 build-desktop 生成的公开直链版
#    （platforms.url 指向 github.com/releases/download/...，公开仓免认证可用；
#     私有仓 assets API 兼容方案已随仓库转公开移除，历史实现见 v4.9.0 tag）
#    v4.10.0 坑：Invoke-RestMethod（无论走代理与否）传大资产会长时间挂起或 408/连接重置——
#    资产上传一律改 curl 直连（--noproxy）+ 失败重试 + 资产列表校验；API 调用仍走 $irm。
$curlExe = "$env:SystemRoot\System32\curl.exe"
function Test-AssetUploaded([string]$name) {
  $rel2 = & $irm Get "https://api.github.com/repos/$repo/releases/tags/$Tag"
  return @($rel2.assets | Where-Object { $_.name -eq $name }).Count -gt 0
}
foreach ($a in $assets) {
  $exist = @($rel.assets | Where-Object { $_.name -eq $a.Name })
  foreach ($e in $exist) {
    & $irm Delete "https://api.github.com/repos/$repo/releases/assets/$($e.id)" | Out-Null
    Write-Host "  删旧资产 $($a.Name)"
  }
  $up = "https://uploads.github.com/repos/$repo/releases/$($rel.id)/assets?name=$([uri]::EscapeDataString($a.Name))"
  $done = $false
  for ($i = 1; $i -le 5 -and -not $done; $i++) {
    if ($i -gt 1) { Write-Host "  重试 $i/5：$($a.Name)"; Start-Sleep -Seconds 3 }
    & $curlExe -sS --noproxy '*' --connect-timeout 15 --max-time 1800 -X POST `
      -H "Authorization: Bearer $token" -H "Content-Type: $($a.Type)" `
      --data-binary "@$($a.Path)" $up -o "$env:TEMP\pb-up-resp.json" 2>$null
    $done = Test-AssetUploaded $a.Name
  }
  if (-not $done) { throw "资产上传失败（已重试 5 次）：$($a.Name)" }
  Write-Host ("  已上传 {0}（{1:N1} MB）" -f $a.Name, ((Get-Item $a.Path).Length / 1MB))
}
Write-Host "完成：https://github.com/$repo/releases/tag/$Tag"
