# 密码本 Handoff 交接文档（2026，v4.0.3 之后）

> 新会话开工前必读。配套：[ROADMAP.md](ROADMAP.md)（版本规划）。

## 项目定位与环境
- 单人自用的本地优先密码管理器：Tauri v2（Rust 后端 lib.rs）+ WebView 前端（public/ 单页）+ SQLite（加密 .db）
- 仓库：github.com/rem-sy/passbook（私有，main 分支）；本地 `D:\hobby\源码\密码本`；产物 `D:\hobby\产物\密码本\`
- 环境：Windows + PowerShell 5.1；Node 测试；Android SDK/JDK 在 `D:\hobby\.android-dev\`；代理 `http://127.0.0.1:7890`（GitHub 访问必须走）
- token：`$env:TEMP\gh-token.txt`；curl 用 `$env:SystemRoot\System32\curl.exe`

## 代码结构（关键文件）
- `public/app.js`（~4000 行主逻辑，IIFE）· `public/index.html` · `public/style.css`（z-index 阶梯：sidebar 60/modal 500/ms-bar 550/建议 600/hint 650/lock 800/toast 900）
- 模块：`search.js`（搜索/多分类纯函数 + sortEntries）/ `watchtower.js`（体检 + HIBP k-匿名）/ `qr.js`（扫码五级解析 + jsQR 管线）/ `presets.js`（15 预置站点库）/ `biometric.js` / `autolock.js` / `lib/`（jsQR、qrcode-generator）
- Rust：`src-tauri/src/lib.rs`（favicon_fetch、SAF、加密、远程模式）
- 测试 16 套：`node --disable-warning=ExperimentalWarning test/X.test.mjs`（api/generator/agent/db-crypto/watchtower/totp/autolock/theme/search/backup/passphrase/biometric/presets/categories/sort/qr）

## Android bypass 构建管线
- `scripts/build-android.ps1`：cargo aarch64 交叉编译 → .so 入 jniLibs → public/ 入 assets（46/47 文件）→ gradle 打包（跳过 tauri-cli）。`-Preset` 出预置版（含 agent-config.local.js）
- RustWebView.kt 幂等锚点补丁：viewport + 生物识别桥(JsBio) + SAF 桥(JsSaf) + **相机权限(PbCamGrant: onPermissionRequest VIDEO_CAPTURE → grant + Activity.requestPermissions CAMERA 41028)**
- 预置版 agent-config.local.js 在 gitignore；正式构建会临时移出、构建后恢复
- 桌面：`scripts/build-desktop.ps1`（setup + portable × 正式/preset）
- 签名：`D:\hobby\产物\密码本\signing\passbook-release.jks`，密码 passbook2024，alias passbook；验收 SHA-256 前缀 **cc06eb3e**

## 标准发布流水线（每版照此）
1. 功能 + 测试（新功能配 test/*.test.mjs 纯函数测试）+ `node --check public/*.js`
2. 版本 4 处 + sw.js CACHE_NAME +1
3. commit（**中文信息，不含英文双引号**）
4. build-android.ps1 → build-android.ps1 -Preset → build-desktop.ps1（共 6 产物）
5. 验收：aapt2 dump badging（versionName/versionCode）+ apksigner verify（cc06eb3e）+ 解包 grep 新功能关键词
6. tag vX.Y.Z + `git push origin main vX.Y.Z`（走代理）
7. GitHub Release 仅在**用户明确说发**时：create-then-upload（curl POST releases → uploads assets 正式 3 件：APK/setup/portable）

## 版本纪律（用户既定）
- 功能 +0.1.0，补丁 +0.0.1；等用户测试确认再进下一版
- GitHub Release 只在用户确认的稳定里程碑（已发：3.0.0/3.2.0/3.3.9/3.4.4/4.0.3）
- 预置版永不外传；上边栏 AI/指南/分类/设置四按钮不轻易动
- tag 已推送后发现补丁：私有单人仓可移动 tag 强推（需核验 ls-remote），或独立 patch 版

## 已知坑与教训（血泪，勿重蹈）
- **PS 5.1**：编辑 .ps1 存 UTF-8 BOM；`-replace` 是全局正则（v3.4.4 曾把 `html.dark .ms-bar` 作用域打断→浅色主题操作台全黑）；.NET File API 用**绝对路径**（进程 cwd 可能是 D:\hobby）
- **HTML label 是 inline**：width:100% 不生效，file-drop 类容器要 `display:block`（v4.0.2 教训）
- **动态弹窗内按钮绑定用 document 事件委托**（`e.target.closest('#id')`），不要重包装 openModal（时机不稳，v4.0.2 教训）；tab 切换 handler 新增 tab 时记得加分支（v4.0.3 漏 scan 分支致面板不显示）
- WebView 内 fetch 外部域全被拦 → 走 Rust reqwest（favicon/HIBP 同理？否——HIBP 用前端 fetch 正常，仅 favicon 域被拦）
- 缓存目录 API 返回 Result 要 unwrap；`agent-config.local.js` 丢失时从 TEMP\v342 备份可还原
- 子代理可能因模型波动中断：派活时先让其盘点现场再继续；中断后新 fork 先查 git log/status 接管
- 分支操作前 `git checkout -- src-tauri/gen/android/tauri.settings.gradle`（构建惯例脏文件）

## 当前状态（交接时点）
- HEAD = tag v4.0.3 = `1331d8c`，Release 383250054 已发（正式 3 产物）
- 工作树干净（惯例脏文件除外）；16 套测试全绿
- 下一版：**v4.1.0 浏览器一键导入**（规格见 ROADMAP.md，提示词见 NEXT-TASK.md）
