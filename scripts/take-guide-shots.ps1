# 生成使用说明配图：服务器模式 + Edge headless 渲染截图（无窗口、不弹框）
$ErrorActionPreference = 'Stop'
$proj = 'D:\hobby\源码\密码本'
$guide = "$proj\public\guide"
$data = "$env:TEMP\passbook-shots-data"

# 找 Edge
$edge = @("C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "C:\Program Files\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (!$edge) { throw '找不到 msedge.exe' }
Write-Host "Edge: $edge"

# 清环境
Remove-Item $data -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $guide | Out-Null

# 起服务器（随机端口，避免被上次残留进程占用）
$port = 3960..3990 | Get-Random
while (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue) { $port = 3960..3990 | Get-Random }
$base = "http://127.0.0.1:$port"
$env:DATA_DIR = $data
$srv = Start-Process node -ArgumentList '--disable-warning=ExperimentalWarning', 'server.mjs', '--port', "$port", '--no-open' -WorkingDirectory $proj -PassThru -WindowStyle Hidden
try {
  $ok = $false
  for ($i = 0; $i -lt 40 -and !$ok; $i++) { Start-Sleep -Milliseconds 300; try { $ok = [bool](Invoke-RestMethod "$base/api/health").ok } catch {} }
  if (!$ok) { throw '服务器未就绪' }
  Write-Host '服务器就绪，写入演示数据…'

  # 演示数据
  $demo = @(
    @{ owner = 'GitHub';     account = 'tom@example.com'; password = 'Xk9$mQ2zLp7';      category = '工作'; url = 'https://github.com';  note = '工作主力号' },
    @{ owner = '微信';       account = '13800138000';     password = 'Wx#2024happy';     category = '个人'; note = '手机号注册' },
    @{ owner = '网银';       account = '张三';            password = 'Bank@2024#Safe';   category = '财务'; note = '工资卡，U盾在书房抽屉' },
    @{ owner = '知乎';       account = 'zhihu@x.com';    password = 'Zhi#2024hu';       category = '个人'; note = '写作号' },
    @{ owner = '公司邮箱';   account = 'zhang@corp.com';  password = 'Corp!Mail88';      category = '工作'; url = 'https://mail.corp.com' },
    @{ owner = 'Steam';      account = 'gamer_zs';        password = 'G4me#Fun2024';     category = '娱乐'; note = '' }
  )
  foreach ($e in $demo) {
    $body = [System.Text.Encoding]::UTF8.GetBytes(($e | ConvertTo-Json -Compress))
    Invoke-RestMethod -Method Post -Uri "$base/api/entries" -ContentType 'application/json' -Body $body | Out-Null
  }
  Write-Host "已写入 $($demo.Count) 条演示数据"

  # 窗口模式 + GDI 截屏（本机验证可用；--no-sandbox 规避受限环境下 crashpad 崩溃弹窗）
  Add-Type -AssemblyName System.Drawing
  $W = 1040; $H = 800; $X = 40; $Y = 40
  $shotProfile = "$env:TEMP\edge-shots-profile"
  # 每张截图用独立 profile：避免同 profile 下 Chromium 把新窗口移交给残留进程、
  # 导致新窗口不在预期位置（上次整批截成空白的根因）
  $profileSeq = 0

  $shots = @(
    @{ h = '#shot-bare';     name = 'main.png';    wait = 3600 },
    @{ h = '#shot-manual';   name = 'manual.png';  wait = 2800 },
    @{ h = '#shot-gen';      name = 'gen.png';     wait = 3600 },
    @{ h = '#shot-agent';    name = 'agent.png';   wait = 2800 },
    @{ h = '#shot-settings'; name = 'sync.png';    wait = 3200 },
    @{ h = '#shot-import';   name = 'import.png';  wait = 2800 }
  )
  foreach ($s in $shots) {
    # 每张截图前确认服务器仍存活，死了就中止
    $alive = $false
    try { $alive = [bool](Invoke-RestMethod "$base/api/health" -TimeoutSec 3).ok } catch {}
    if (!$alive) { Write-Warning '服务器已停止，中止截图'; break }
    $profileSeq++
    $url = "$base/$($s.h)"
    $args = @("--app=$url", "--window-size=$W,$H", "--window-position=$X,$Y",
      "--user-data-dir=$shotProfile-$profileSeq", '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--no-sandbox', '--disable-crash-reporter', '--disable-breakpad', '--noerrdialogs')
    $p = Start-Process $edge -ArgumentList $args -PassThru
    Start-Sleep -Milliseconds $s.wait
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($X, $Y, 0, 0, $bmp.Size)
    $g.Dispose()
    $out = Join-Path $guide $s.name
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "  截取 $($s.name) ($([math]::Round((Get-Item $out).Length/1KB))KB)"
    try { if (!$p.HasExited) { $null = $p.CloseMainWindow() } } catch { }
    Start-Sleep -Milliseconds 900
    try { if (!$p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } } catch { }
    Start-Sleep -Milliseconds 500
  }
  # 清理本轮所有临时 profile
  Remove-Item "$shotProfile-*" -Recurse -Force -ErrorAction SilentlyContinue
} finally {
  try { if (!$srv.HasExited) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue } } catch { }
}
Write-Host '完成'
