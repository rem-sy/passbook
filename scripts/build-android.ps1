# 密码本 Android APK 构建脚本（无符号链接权限环境的旁路方案）
# 用法：powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 [-DebugBuild] [-Clean]
#   -Clean 构建纯净版（不预置 AI 渠道，产物名带 -纯净版 后缀）
# 预置渠道来自 public\agent-config.local.js（不入库，本机文件）；
# 纯净版构建时该文件被临时移出（cargo 内嵌与 assets 复制均不会带上）。
# 前置：D:\hobby\.android-dev\ 下有 jdk、sdk（含 ndk 27.0.12077973）
param([switch]$DebugBuild, [switch]$Clean)

$ErrorActionPreference = 'Stop'
$dev = 'D:\hobby\.android-dev'
$proj = 'D:\hobby\源码\密码本'
$srcTauri = "$proj\src-tauri"
$ndkVer = '27.0.12077973'
$ndkToolchain = "$dev\sdk\ndk\$ndkVer\toolchains\llvm\prebuilt\windows-x86_64\bin"
$target = 'aarch64-linux-android'
$api = '24'
$profile = if ($DebugBuild) { 'debug' } else { 'release' }
$suffix = if ($Clean) { '-clean' } else { '' }
$localCfg = "$proj\public\agent-config.local.js"
# 版本号从 tauri.conf.json 读取（与三处版本文件保持一致）
$ver = (Select-String -Path "$srcTauri\tauri.conf.json" -Pattern '"version"\s*:\s*"([^"]+)"').Matches[0].Groups[1].Value
if (-not $ver) { throw '无法从 tauri.conf.json 解析版本号' }

$env:JAVA_HOME = "$dev\jdk"
$env:ANDROID_HOME = "$dev\sdk"
$env:NDK_HOME = "$dev\sdk\ndk\$ndkVer"
$env:Path = "$dev\jdk\bin;$env:USERPROFILE\.cargo\bin;$env:Path"
$env:CARGO_HTTP_CHECK_REVOKE = 'false'
$env:CC_aarch64_linux_android = "$ndkToolchain\aarch64-linux-android$api-clang.cmd"
$env:CXX_aarch64_linux_android = "$ndkToolchain\aarch64-linux-android$api-clang++.cmd"
$env:AR_aarch64_linux_android = "$ndkToolchain\llvm-ar.exe"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$ndkToolchain\aarch64-linux-android$api-clang.cmd"
# 环境变量里传 RUSTFLAGS 会整体覆盖 tauri 需要的默认值，这里只加链接参数
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS = '-C link-arg=-landroid -C link-arg=-llog -C link-arg=-lOpenSLES'

# WRY/TAURI Kotlin 代码生成（正常流程由 tauri-cli 注入；旁路模式手动设置，
# wry/tauri 的 build.rs 会把 RustWebView.kt/TauriActivity.kt 等写入应用包目录）
$env:WRY_ANDROID_KOTLIN_FILES_OUT_DIR = "$srcTauri\gen\android\app\src\main\java\com\passbook\app"
$env:WRY_ANDROID_PACKAGE = 'com.passbook.app'
$env:WRY_ANDROID_LIBRARY = 'passbook_desktop_lib'
$env:TAURI_ANDROID_PROJECT_PATH = "$srcTauri\gen\android"

# 纯净版：临时移出本机渠道文件（打包后恢复）
$bak = $null
if ($Clean -and (Test-Path $localCfg)) {
  $bak = Join-Path $env:TEMP ("agent-config.local." + [guid]::NewGuid().ToString('N').Substring(0,8) + ".bak")
  Move-Item $localCfg $bak -Force
  Write-Host '==> 已临时移出 agent-config.local.js（纯净版）'
}
if (-not $Clean -and -not (Test-Path $localCfg)) {
  Write-Warning '未找到 agent-config.local.js，产物将不带预置渠道（等同于纯净版）'
}

try {
  Write-Host "==> 1/4 cargo 交叉编译 (aarch64-linux-android, $profile)"
  # 触发重新内嵌前端（前端资源在编译期打进 .so，Android 运行时从 .so 加载）
  (Get-Item "$proj\public\app.js").LastWriteTime = Get-Date
  (Get-Item "$srcTauri\src\lib.rs").LastWriteTime = Get-Date
  Push-Location $srcTauri
  $extra = if ($DebugBuild) { } else { '--release' }
  $log = Join-Path $env:TEMP 'passbook-cargo-android.log'
  & $env:ComSpec /c "cargo build --target $target --features tauri/custom-protocol --lib $extra > `"$log`" 2>&1"
  if ($LASTEXITCODE -ne 0) {
    Get-Content $log -Tail 12 -ErrorAction SilentlyContinue | Write-Host
    Pop-Location; throw "cargo build 失败 ($LASTEXITCODE)"
  }
  Pop-Location

  Write-Host '==> 2/4 复制 .so 与前端资源（替代符号链接）'
  $so = "$srcTauri\target\$target\$profile\libpassbook_desktop_lib.so"
  if (!(Test-Path $so)) { throw "找不到 $so" }
  $jniDir = "$srcTauri\gen\android\app\src\main\jniLibs\arm64-v8a"
  New-Item -ItemType Directory -Force $jniDir | Out-Null
  Copy-Item $so "$jniDir\libpassbook_desktop_lib.so" -Force
  Write-Host "    .so 已复制 $( [math]::Round((Get-Item $so).Length/1MB,1) )MB"
  # TauriActivity.kt：tauri build.rs 的 codegen 不监听 WRY 环境变量变化（缓存命中时跳过），
  # 旁路模式由脚本直接按上游模板生成（仅 {{package}} 占位符）
  $ktDir = "$srcTauri\gen\android\app\src\main\java\com\passbook\app"
  $regTpl = "$env:USERPROFILE\.cargo\registry\src\rsproxy.cn-e3de039b2554c837\tauri-2.11.1\mobile\android-codegen\TauriActivity.kt"
  if (Test-Path $regTpl) {
    $tpl = (Get-Content $regTpl -Raw -Encoding UTF8) -replace '\{\{package\}\}', 'com.passbook.app'
    [System.IO.File]::WriteAllText("$ktDir\TauriActivity.kt", $tpl, [System.Text.UTF8Encoding]::new($false))
    Write-Host "    TauriActivity.kt 已生成"
  } else {
    Write-Warning "未找到 tauri codegen 模板（$regTpl），TauriActivity.kt 保持现状"
  }
  # proguard-tauri.pro：keep TauriActivity.getPluginManager()（Rust 端 JNI 调用）。
  # 缺失时 R8 裁掉该方法 → 启动即闪退（v2.0.0~v2.5.0 APK 的根因）。
  # 正常流程由 tauri-cli 在 android init 时写入；旁路模式从 registry 模板生成（$PACKAGE 占位符）。
  $proTpl = "$env:USERPROFILE\.cargo\registry\src\rsproxy.cn-e3de039b2554c837\tauri-2.11.1\mobile\proguard-tauri.pro"
  $proOut = "$srcTauri\gen\android\app\proguard-tauri.pro"
  if (Test-Path $proTpl) {
    $pro = (Get-Content $proTpl -Raw -Encoding UTF8) -replace '\$PACKAGE', 'com.passbook.app'
    [System.IO.File]::WriteAllText($proOut, $pro, [System.Text.UTF8Encoding]::new($false))
    Write-Host "    proguard-tauri.pro 已生成（R8 keep getPluginManager）"
  } elseif (-not (Test-Path $proOut)) {
    Write-Warning '未找到 proguard-tauri.pro 且无模板，R8 可能裁掉 JNI 方法导致闪退'
  }
  # APK assets 目录同步一份前端（兜底源；运行时以 .so 内嵌资源为准）
  $apkAssets = "$srcTauri\gen\android\app\src\main\assets"
  New-Item -ItemType Directory -Force $apkAssets | Out-Null
  Remove-Item "$apkAssets\*" -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item "$proj\public\*" $apkAssets -Recurse -Force
  $assetCount = (Get-ChildItem $apkAssets -Recurse -File).Count
  Write-Host "    前端资源 $assetCount 个文件 -> assets/"

  Write-Host '==> 3/4 gradle 打包 APK（跳过 tauri-cli 脚本）'
  $env:PASSBOOK_SKIP_TAURI_SCRIPT = '1'
  Push-Location "$srcTauri\gen\android"
  $task = if ($DebugBuild) { 'assembleArm64Debug' } else { 'assembleArm64Release' }
  $glog = Join-Path $env:TEMP 'passbook-gradle.log'
  & $env:ComSpec /c ".\gradlew.bat $task -PabiList=arm64-v8a -ParchList=arm64 -PtargetList=aarch64 --no-daemon > `"$glog`" 2>&1"
  if ($LASTEXITCODE -ne 0) {
    Get-Content $glog -Tail 15 -ErrorAction SilentlyContinue | Write-Host
    Pop-Location; throw "gradle 失败 ($LASTEXITCODE)"
  }
  Pop-Location

  Write-Host '==> 4/4 收集 APK'
  $apkDir = "$srcTauri\gen\android\app\build\outputs\apk\arm64\$profile"
  $apk = Get-ChildItem $apkDir -Filter '*.apk' | Select-Object -First 1
  if (!$apk) { throw "未找到 APK（预期在 $apkDir）" }
  $dest = "D:\hobby\产物\密码本\Passbook-Android-$ver-arm64$suffix.apk"
  Copy-Item $apk.FullName $dest -Force
  Write-Host "完成: $dest ($([math]::Round($apk.Length/1MB,1))MB)"
} finally {
  if ($bak) {
    Move-Item $bak $localCfg -Force
    Write-Host '已恢复 public\agent-config.local.js'
  }
}
