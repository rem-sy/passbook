# 密码本 Android APK 构建脚本（无符号链接权限环境的旁路方案）
# 用法：powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 [-DebugBuild] [-Clean]
#   -Preset 构建预置渠道版（产物名带 -preset 后缀，仅本机留存，不上传 GitHub）
# 预置渠道来自 public\agent-config.local.js（不入库，本机文件）；
# 正式版构建时该文件被临时移出（cargo 内嵌与 assets 复制均不会带上）。
# 前置：D:\hobby\.android-dev\ 下有 jdk、sdk（含 ndk 27.0.12077973）
param([switch]$DebugBuild, [switch]$Preset)

$ErrorActionPreference = 'Stop'
$dev = 'D:\hobby\.android-dev'
$proj = 'D:\hobby\源码\密码本'
$srcTauri = "$proj\src-tauri"
$ndkVer = '27.0.12077973'
$ndkToolchain = "$dev\sdk\ndk\$ndkVer\toolchains\llvm\prebuilt\windows-x86_64\bin"
$target = 'aarch64-linux-android'
$api = '24'
$profile = if ($DebugBuild) { 'debug' } else { 'release' }
# 正式版（默认）：不预置 AI 渠道，产物名无后缀——对外发布/传 GitHub 的唯一版本
# -Preset：预置渠道版，产物名带 -preset 后缀——仅本机留存，绝不上传 GitHub
$suffix = if ($Preset) { '-preset' } else { '' }
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

# 正式版：临时移出本机渠道文件（打包后恢复）；预置版保留
$bak = $null
if (-not $Preset -and (Test-Path $localCfg)) {
  $bak = Join-Path $env:TEMP ("agent-config.local." + [guid]::NewGuid().ToString('N').Substring(0,8) + ".bak")
  Move-Item $localCfg $bak -Force
  Write-Host '==> 已临时移出 agent-config.local.js（正式版）'
}
if ($Preset -and -not (Test-Path $localCfg)) {
  Write-Warning '未找到 agent-config.local.js，预置版将不带预置渠道（等同正式版）'
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
  # RustWebView.kt 补丁（v2.5.1/v2.6.0）：tauri build.rs 每次 Android 构建都会重新生成此文件，
  # 所有自定义必须在构建后幂等补回：
  #   1) useWideViewPort/loadWithOverviewMode —— 尊重 <meta viewport>（否则按 980px 布局，手机端弹窗输入框过窄）
  #   2) 生物识别 JS 桥 __passbook_bio —— companion.current + JsBio（配合 BioBridgeActivity）
  $rwv = "$ktDir\RustWebView.kt"
  if (Test-Path $rwv) {
    $rwvSrc = [System.IO.File]::ReadAllText($rwv)
    $dirty = $false
    if (-not $rwvSrc.Contains('useWideViewPort')) {
      $a1 = 'settings.javaScriptCanOpenWindowsAutomatically = true'
      $rwvSrc = $rwvSrc.Replace($a1, $a1 + "`n        settings.useWideViewPort = true`n        settings.loadWithOverviewMode = true")
      $dirty = $true
    }
    if (-not $rwvSrc.Contains('JsBio')) {
      $a2 = "    val isDocumentStartScriptEnabled: Boolean`n"
      $bio = $a2 + "`n    companion object {`n        @JvmStatic var current: RustWebView? = null`n    }`n`n    /** 密码本 v2.6.0：生物识别 JS 桥（window.__passbook_bio）；v3.0.5 增加同步轮询 result() */`n    inner class JsBio {`n        @android.webkit.JavascriptInterface`n        fun available(): String {`n            val km = context.getSystemService(android.content.Context.KEYGUARD_SERVICE) as android.app.KeyguardManager`n            return if (km.isKeyguardSecure) `"yes`" else `"no`"`n        }`n`n        @android.webkit.JavascriptInterface`n        fun result(): String { return BioBridgeActivity.lastResult }`n`n        @android.webkit.JavascriptInterface`n        fun prompt(reason: String) {`n            BioBridgeActivity.reason = reason.ifBlank { `"解锁密码本`" }`n            val i = android.content.Intent(context, BioBridgeActivity::class.java)`n            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)`n            context.startActivity(i)`n        }`n    }`n`n    /** 密码本 v3.0.5：SAF 另存为 JS 桥（window.__passbook_saf，配合 SafSaveActivity） */`n    inner class JsSaf {`n        @android.webkit.JavascriptInterface`n        fun result(): String { return SafSaveActivity.lastResult }`n`n        @android.webkit.JavascriptInterface`n        fun save(name: String, tempPath: String) {`n            SafSaveActivity.displayName = name.ifBlank { `"passbook.bin`" }`n            SafSaveActivity.tempPath = tempPath`n            val i = android.content.Intent(context, SafSaveActivity::class.java)`n            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)`n            context.startActivity(i)`n        }`n    }`n"
      $rwvSrc = $rwvSrc.Replace($a2, $bio)
      $a3 = '        settings.javaScriptEnabled = true'
      $rwvSrc = $rwvSrc.Replace($a3, "        // 密码本 v2.6.0/v3.0.5：JS 桥（生物识别 + SAF 另存为）`n        current = this`n        addJavascriptInterface(JsBio(), `"__passbook_bio`")`n        addJavascriptInterface(JsSaf(), `"__passbook_saf`")`n" + $a3)
      $dirty = $true
    }
    # v4.0.0：摄像头权限桥——WebView onPermissionRequest 对 VIDEO_CAPTURE：grant WebView 请求
    # + 触发 Android runtime 权限弹窗（requestCode 41028，弹过即不再弹）。幂等锚点：'PbCamGrant'
    if (-not $rwvSrc.Contains('PbCamGrant')) {
      $a4 = '        settings.mediaPlaybackRequiresUserGesture = false'
      $cam = @'
        // 密码本 v4.0.0：相机权限转发（扫码）PbCamGrant
        webChromeClient = object : android.webkit.WebChromeClient() {
            override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
                if (!request.resources.contains(android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    request.deny(); return
                }
                // WebView 层放行 + 并行触发系统运行时权限（未授权时相机设备本就打不开，用户拒绝则流失败走 onFail）
                request.grant(request.resources)
                (context as? android.app.Activity)?.requestPermissions(arrayOf(android.Manifest.permission.CAMERA), 41028)
            }
        }
'@
      if (-not $rwvSrc.Contains($a4)) { Write-Host '    警告: a4 锚点(mediaPlaybackRequiresUserGesture)未命中，相机权限补丁跳过' }
      else { $rwvSrc = $rwvSrc.Replace($a4, $a4 + "`n" + $cam); $dirty = $true }
    }
    # v4.4.0：文件仓桥——JsSaf 增 open(系统打开) + pick/pickResult(SAF 批量导入)。
    # 幂等锚点：'PbFileHubOpen'（依赖 a2 已注入 JsSaf 类，锚点取 save 方法签名）
    if (-not $rwvSrc.Contains('PbFileHubOpen')) {
      $a5 = "        @android.webkit.JavascriptInterface`n        fun save(name: String, tempPath: String) {"
      $open = @'
        // 密码本 v4.4.0：文件仓「系统打开」桥 PbFileHubOpen（FileProvider + ACTION_VIEW）
        @android.webkit.JavascriptInterface
        fun open(tempPath: String, mime: String) {
            val f = java.io.File(tempPath)
            if (!f.exists()) return
            val uri = androidx.core.content.FileProvider.getUriForFile(
                context, context.packageName + ".fileprovider", f)
            val i = android.content.Intent(android.content.Intent.ACTION_VIEW)
            i.setDataAndType(uri, mime.ifBlank { "*/*" })
            i.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }

        // 密码本 v4.4.0：SAF 批量导入桥（配合 SafImportActivity，ACTION_OPEN_DOCUMENT 多选）
        @android.webkit.JavascriptInterface
        fun pick() {
            SafImportActivity.lastResult = "pending" // v4.6.4：同款残留隐患
            val i = android.content.Intent(context, SafImportActivity::class.java)
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }

        @android.webkit.JavascriptInterface
        fun pickResult(): String { return SafImportActivity.lastResult }

        // 密码本 v4.6.1：通用单文件选取桥（配合 SafPickRawActivity，导入选文件用）
        @android.webkit.JavascriptInterface
        fun pickRaw() {
            SafPickRawActivity.lastResult = "pending" // v4.6.4：启动前重置（静态残留教训）
            val i = android.content.Intent(context, SafPickRawActivity::class.java)
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }

        @android.webkit.JavascriptInterface
        fun pickRawResult(): String { return SafPickRawActivity.lastResult }

'@
      if (-not $rwvSrc.Contains($a5)) { Write-Host '    警告: a5 锚点(JsSaf save 方法)未命中，文件仓桥补丁跳过' }
      else { $rwvSrc = $rwvSrc.Replace($a5, $open + $a5); $dirty = $true }
    }
    if ($dirty) {
      [System.IO.File]::WriteAllText($rwv, $rwvSrc, [System.Text.UTF8Encoding]::new($false))
      Write-Host '    RustWebView.kt 已补丁（viewport + 生物识别桥 + SAF 保存桥 + 相机权限 + 文件仓系统打开）'
    }
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
