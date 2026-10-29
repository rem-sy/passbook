# 密码本 v4.9.0 自动更新调研与设计（RESEARCH-v4.9-autoupdate）

> 结论定稿：桌面端 tauri-plugin-updater 全自动；Android 应用内下载 APK + 系统安装器半自动；
> 每版发 GitHub Release 挂产物。仓库将由私有转 public（转前需审计历史）。

## 一、现状与环境事实（调研确认）

- Tauri v2.0（tauri 2 + reqwest 0.12 rustls），本机 rustc 1.98.0（updater 插件要求 ≥1.90 ✓）
- 桌面构建走 `node_modules\.bin\tauri.cmd build`（NSIS 产物在 `src-tauri/target/release/bundle/nsis/`）→ 可直接开 `createUpdaterArtifacts` 出 `.sig`
- Android 已有基础设施：`__passbook_saf.open(path, mime)` 原生桥（FileProvider + ACTION_VIEW，
  `file_paths.xml` 已覆盖 `cache-path filehub_tmp/`）、`__passbook_saf.save(name, tempPath)` SAF 另存
- 前端无打包器（UMD/IIFE）：updater 的 JS 绑定不可用 → **全部走自写 Rust 命令包装插件 API**，不经
  webview 直接调插件命令（因此无需改 capabilities 权限文件）
- reqwest 默认不走系统代理 → GitHub 直连在本机可能失败 → Rust 侧实现「先按配置（默认直连），
  网络层失败自动回退 http://127.0.0.1:7890 再试一次」

## 二、官方 updater 插件要点（v2 文档核实）

- 端点：静态 JSON `https://github.com/rem-sy/passbook/releases/latest/download/latest.json`
  （`releases/latest/download` 固定指向最新非预发布 Release 的资产）
- **强制 minisign 签名，不可关**：`tauri signer generate` 生成密钥对；公钥进 tauri.conf.json，
  私钥在构建时以 `TAURI_SIGNING_PRIVATE_KEY` 环境变量注入 → 产出 `setup.exe.sig`
- **私钥丢失 = 已装用户永远收不到更新**（与数据库密钥同级保管，存 `D:\hobby\产物\密码本\signing\`）
- Windows `installMode: passive`（带进度小窗、免交互，默认推荐）
- latest.json 必需键：`version`（semver）、`platforms.<os-arch>.{url,signature}`
- 私有仓：release 资产下载需认证 → 检查请求带 `Authorization: Bearer <PAT>` 头（构建器级 header，
  清单与安装包下载同生效）；转 public 后 token 留空即可

## 三、设计

### 3.1 桌面（全自动）
1. 新增依赖 `tauri-plugin-updater`（仅 desktop init）；tauri.conf.json 增 `createUpdaterArtifacts: true`
   与 `plugins.updater { pubkey, endpoints, windows.installMode: "passive" }`
2. 新 Rust 命令：
   - `update_check(token?, proxy?)`：UpdaterExt 构建（带 token 头/代理/回退代理）→ `check()` →
     `{version, notes?, date?}`；Update 对象暂存 `State<Mutex<Option<Update>>>`
   - `update_download_install()`：对暂存 Update `download_and_install`，进度经事件
     `update-progress {downloaded, total}` 推送；完成由前端提示重启
   - `update_restart()`：`app.restart()`
   - `app_version()`：`env!("CARGO_PKG_VERSION")`（Android 端比较版本用）
3. 前端 `public/updater.js`（UMD，纯函数可测）+ app.js 接线：
   - 启动静默检查（默认开，设置可关；失败静默）
   - 发现新版 → 更新弹窗（版本/说明/「下载并安装」带进度条/「暂不」）
   - 安装完成 →「重启应用」按钮

### 3.2 Android（应用内下载半自动）
1. `update_query_latest(token?, proxy?)`（双平台通用）：GET
   `api.github.com/repos/rem-sy/passbook/releases/latest`（GitHub API 强制 User-Agent）→
   `{tag, name, notes, apk_url, apk_size, html_url}`（资产取 `Passbook-Android-*-arm64.apk`，排除 preset）
2. `update_download_apk(url, token?, proxy?)`：流式下载到 `<cache>/filehub_tmp/passbook-update.apk`
   （FileProvider 覆盖路径），进度事件 `update-progress`
3. 安装：`__passbook_saf.open(path, 'application/vnd.android.package-archive')` →
   系统包安装器（首次需允许「安装未知应用」）；弹窗另给「保存 APK 到…」（SAF save）与
   「浏览器打开 Release 页」兜底
4. AndroidManifest 增 `<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>`
5. 手机端启动检查 24h 节流（localStorage 记上次检查时间；手动点「立即检查」不受限）

### 3.3 设置（设置 → 自动更新）
- 「启动时自动检查更新」开关（默认开）
- 「GitHub Token」输入（私有仓期间必填，contents 读权限即可；转 public 后可清空）
- 「更新代理」输入（默认空 = 直连；网络失败自动回退 127.0.0.1:7890）
- 「立即检查更新」按钮

### 3.4 发布管线（每版发 Release）
- `build-desktop.ps1`：正式版构建后生成 `latest.json`（读 nsis 目录 `.sig`，URL 指向
  `releases/download/vVER/Passbook_VER_x64-setup.exe`）到产物目录；签名密钥缺失时警告并跳过（产物照常）
- 新 `scripts/publish-release.ps1`：tag push 后跑——`gh release create vX.Y.Z`（token 读
  `%TEMP%\gh-token.txt`，走代理探测/直连）附资产：正式 setup.exe、portable.exe、正式 APK、
  latest.json。**预置版（-preset）与预置 APK 绝不上传**
- 版本纪律：tag → push → publish-release 三连（DEVELOPGUIDe §4 同步更新）

## 四、测试计划

- 单测 `test/updater.test.mjs`（新第 21 套）：版本比较（semver/tag 前缀 v/不等长）、Release 资产挑选
  （排除 preset/取 arm64）、latest.json 构建纯函数、24h 节流判定
- 桌面真链路自测（私有期带 token）：
  1. 发 Release v4.9.0（含 latest.json）
  2. 造测试 Release `v4.9.9-test`：latest.json 谎报 version 4.9.9，URL/sig 指向 v4.9.0 真实 setup ——
     用于验证「旧版本 → 下载 → 验签 → passive 安装 → 重启」全链路（releases/latest 指向它）
  3. 以 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<p>` 启动 portable，
     CDP 驱动真实应用 UI 完成升级流；验证后删除 v4.9.9-test
- Android 自测：同测试 Release，e2e-zip 风格 mock invoke 验证 UI 流（弹窗/进度/按钮分派）；
  真机安装链路（下载→安装器→覆盖安装）留用户验收
- 网络降级：断 token（私有期应 404/401 明确报错）、清 SW 后重查

## 五、转 public 前检查清单（用户执行）

1. `git log --all --diff-filter=A --name-only | sort -u` 核对历史文件名，确认无密钥/token/.db 真实数据入库
2. （本次已完成设计）docs/archive 已从 git 索引移除并 gitignore——历史提交里仍有旧文档，无敏感内容可不清史
3. Settings 里 GitHub Token 转正后可清空（public 资产免认证）
4. 在 GitHub 仓库 Settings → General → Danger Zone 改 Visibility

## 六、风险与取舍

- minisign 私钥单点：丢失后老安装只能手动重装；与 jks 同目录保管 + 文档警示
- PAT 存应用本机：泄露面 = 私有仓只读（fine-granted contents:read），单人可接受
- `releases/latest` 不含 prerelease/draft：测试 Release 验完即删，避免抢 latest
- updater 插件对 Android 不支持自装（系统限制）——半自动是上限，非缺陷
- portable 版无安装器：更新功能仅对 setup 安装版生效，portable 用户继续手动换文件（弹窗中注明）
