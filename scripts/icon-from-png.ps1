#!/usr/bin/env pwsh
# 从 assets/icon.png 生成密码本应用全套图标（桌面 + Android）
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$proj = 'D:\hobby\源码\密码本'
$src = Join-Path $proj 'assets\icon.png'
$bmp = New-Object System.Drawing.Bitmap($src)
Write-Host "源图: $($bmp.Width)x$($bmp.Height)"

# 高质量缩放
function Resize-To([System.Drawing.Bitmap]$src, [int]$size) {
  $dst = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  return $dst
}

# ---- 桌面 icons/ ----
$iconsDir = Join-Path $proj 'src-tauri\icons'
New-Item -ItemType Directory -Force $iconsDir | Out-Null
foreach ($size in 16, 32, 48, 128, 192, 256, 512) {
  $img = Resize-To $bmp $size
  $img.Save((Join-Path $iconsDir "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $img.Dispose()
  Write-Host "  icon-$size.png"
}

# ---- Android mipmap ----
$res = Join-Path $proj 'src-tauri\gen\android\app\src\main\res'
$mips = @{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
foreach ($k in $mips.Keys) {
  $dir = Join-Path $res "mipmap-$k"
  New-Item -ItemType Directory -Force $dir | Out-Null
  $img = Resize-To $bmp $mips[$k]
  $img.Save((Join-Path $dir 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $img.Dispose()
  Write-Host "  mipmap-$k/ic_launcher.png ($($mips[$k]))"
}

# ---- icon.ico (16/32/48/256, PNG 压缩条目) ----
function New-Ico([string]$path, [System.Drawing.Bitmap]$base, [int[]]$sizes) {
  $entries = @()
  $datas = @{}
  foreach ($s in $sizes) {
    $img = Resize-To $base $s
    $ms = New-Object System.IO.MemoryStream
    $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $datas[$s] = $ms.ToArray()
    $img.Dispose()
  }
  $ms2 = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms2)
  $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  foreach ($s in $sizes) {
    $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$datas[$s].Length)
    $bw.Write([uint32]$offset)
    $offset += $datas[$s].Length
  }
  foreach ($s in $sizes) { $bw.Write($datas[$s]) }
  $bw.Flush()
  [System.IO.File]::WriteAllBytes($path, $ms2.ToArray())
  Write-Host "  $path"
}
New-Ico (Join-Path $iconsDir 'icon.ico') $bmp @(16, 32, 48, 256)

$bmp.Dispose()
Write-Host '全部图标生成完成'
