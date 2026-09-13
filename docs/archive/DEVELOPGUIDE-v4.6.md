# 密码本 开发指南（DEVELOPGUIDE）

> 面向实现者的一页通：架构、代码地图、数据层、构建、发布、测试、UI 规范、坑。
> 环境与当前状态见 [HANDOFF.md](HANDOFF.md)；版本规划见 [ROADMAP.md](ROADMAP.md)。

## 1. 总架构

- **Tauri v2**（Rust `src-tauri/src/lib.rs`）+ **WebView 前端**（`public/` 单页，无框架，IIFE）
- 数据：**SQLite**（前端 sql.js 内存库 + 整库落盘持久化；Android/桌面写应用私有文件，浏览器写 IndexedDB）；可选远程服务端模式（/api）
- 三平台一份前端：桌面（WebView2）/ Android（RustWebView + 原生桥）/ 浏览器 PWA（Service Worker 离线）
- 原生能力以两种方式接入：
  1. **Rust 命令**（favicon_fetch / SAF / 加解密 / agent_http 等，`tauriInvoke` 调用）
  2. **原生 Activity + JS 桥**（生物识别 BioBridgeActivity、SAF 另存 SafSaveActivity —— RustWebView.kt 里注入 `@JavascriptInterface` 内部类，前端轮询 result()）

## 2. 代码地图

### public/（前端，全部零依赖 UMD 或 IIFE）
| 文件 | 职责 |
|---|---|
| app.js | 主逻辑 ~4200 行 IIFE：state/store/列表渲染/弹窗/导入导出/多选/设置 |
| index.html / style.css | 单页壳与全部样式（z-index 阶梯见 §7） |
| search.js | PassSearch：多词 AND 模糊、操作符、高亮、sortEntries、分类集合 |
| watchtower.js | 体检 + HIBP k-匿名 |
| qr.js + lib/ | 扫码五级解析、jsQR、qrcode-generator |
| importer.js | 浏览器 CSV 一键导入（表头识别/容错/判重纯函数，v4.1.0） |
| presets.js / generator.js / passphrase.js / totp.js / biometric.js / autolock.js / theme.js / backup.js / db-crypto.js / agent-core.js | 预置库/密码生成/口令句/TOTP/生物识别/自动锁/主题/备份/加密/AI 渠道 |

### src-tauri/src/lib.rs（Rust 命令层）
文件读写（read/write_db_file 与 **_b64 base64 版本**——v4.1.1 起数据库 IPC 一律走 b64，JSON 数字数组随体积线性变慢）、pick_import_db、export_db/export_json/export_bytes、SAF 临时写、favicon_fetch、agent_http(_stream)、生物识别桥。

### 前端数据层（app.js 内）
- `LocalStore`（sql.js）：`init()` 迁移链（ALTER/CREATE IF NOT EXISTS 幂等）→ `persist()` 导出整库 → 可选 DbCrypto 加密 → b64 IPC 写盘
- `ServerStore`：远程模式 fetch /api
- `store` 适配器按 currentMode 分发；统一接口 list/create/update/remove/importItems/…

## 3. 构建管线（Android bypass）

`scripts/build-android.ps1`：cargo aarch64 交叉编译 → .so 入 jniLibs → public/ 入 assets → gradle 打包（跳过 tauri-cli）。`-Preset` 出预置版（含 gitignore 的 agent-config.local.js，正式构建临时移出后恢复）。
- **RustWebView.kt 幂等锚点补丁**：tauri build.rs 每次构建重生成该文件，脚本按锚点重新打上 viewport / JsBio / JsSaf / PbCamGrant 补丁
- **AndroidManifest.xml 与自建 Activity（BioBridge/SafSave）是仓库提交物**，不受 build.rs 重生成影响——新增 Activity/快捷方式/分享过滤器走这条路
- 桌面：`scripts/build-desktop.ps1`（setup + portable × 正式/preset）
- 签名：`D:\hobby\产物\密码本\signing\passbook-release.jks`，alias passbook；验收 SHA-256 前缀 **cc06eb3e**

## 4. 标准发布流水线（每版照此）

1. 功能 + 测试（新功能配 `test/X.test.mjs` 纯函数测试）+ `node --check public/*.js`
2. 跑全部测试套件（`test/*.test.mjs`，channel-live 为外部探测不计）
3. 版本 4 处 + sw.js CACHE_NAME +1（**改版本文件用 .NET WriteAllText + UTF8Encoding($false) + 绝对路径**，见 §8 坑）
4. commit（中文信息、不含英文双引号；只 add 明确文件，勿 `git add -u` 一把梭）
5. build-android.ps1 → build-android.ps1 -Preset → build-desktop.ps1（共 6 产物，顺序执行勿并发——agent-config.local.js 移出恢复互斥）
6. 验收：aapt2 dump badging（versionName/versionCode）+ apksigner verify（cc06eb3e，需 JAVA_HOME=D:\hobby\.android-dev\jdk）+ 解包 grep 新功能关键词
7. tag vX.Y.Z + `git push origin main vX.Y.Z`（代理 127.0.0.1:7890；TLS 偶发抖动重试即可）
8. GitHub Release 仅在用户明确说发时：curl POST releases（token 在 `$env:TEMP\gh-token.txt`，走代理，用 System32 curl）→ 上传正式 3 件（APK/setup/portable）

## 5. 测试规范

- `node:test` + `node:assert/strict`；`node --disable-warning=ExperimentalWarning test/X.test.mjs`
- UMD 模块在 Node 装载惯例：`globalThis.window = globalThis` + `(0, eval)(src)` 取 `window.PassXxx`（见 test/qr.test.mjs / test/importer.test.mjs）
- 新功能必须有纯函数测试；UI 交互不强行 mock，靠真机验收清单
- 当前套件：api/generator/agent/db-crypto/watchtower/totp/autolock/theme/search/backup/passphrase/biometric/presets/categories/sort/qr/importer（17）+ channel-live（外部探测，非单测）

## 6. 数据层规范（v4.3 起新表照此）

- 新表进 `LocalStore.init()` 迁移链：`CREATE TABLE IF NOT EXISTS`，字段加默认值，**幂等可重入**
- 大二进制不进 SQLite（附件 BLOB ≤2MB 上限的教训）；文件仓本体走文件系统 sha256 分桶 + 元数据入表
- 加密：整库落盘前 DbCrypto（AES-GCM + 密钥派生）；新数据类型优先整库加密覆盖，单独文件加密需从同密钥派生并在换密钥向导中处理

## 7. UI 规范（血泪沉淀）

- z-index 阶梯：sidebar 60 / modal 500 / ms-bar 550 / 建议 600 / hint 650 / lock 800 / toast 900
- **动态弹窗内按钮绑定用 document 事件委托**（`e.target.closest('#id')`），change/dragover/drop 同理（v4.0.2/v4.1.0 教训）
- tab 切换 handler 新增 tab 必须加分支（v4.0.3 scan 分支遗漏教训）
- `label.file-drop` 必须 `display:block`（label 是 inline，width:100% 不生效）
- 移动端卡片右列（时间+操作钮）会挤压左主体：关键数字内容加 `white-space:nowrap; flex:none`，容器 `flex-wrap:wrap` 兜底（v4.1.2 TOTP 断行教训）
- WebView 内 fetch 外部域被拦 → favicon 走 Rust reqwest；HIBP 前端 fetch 正常

## 8. 已知坑（勿重蹈）

- **自建弹窗层的 z-index 统一 660**：`promptKeyInput`/`showKeyBackup` 等手工 `document.createElement('div.modal-mask')` 的层曾用 320——业务弹窗（openModal）是 500，叠在导入/设置弹窗上打开时会被压在下面看不见（加密 .db 导入的密钥框"没弹出来"即此因）。新增自建层一律 660（联想 650 之上、锁页 800 之下）
- **ps1 文件必须恰好单 BOM**：对已有 BOM 的脚本再用 utf-8-sig 写一遍会产生双 BOM，第二个 BOM 使 `param()` 不在首语句 → `-Preset` 开关静默失效（预置版按正式版构建并覆盖产物）。改 ps1 用 `io.open(p,'rb')` 剥干净再写单 BOM

- **PS 5.1**：`-Encoding UTF8` 带 BOM（曾致 tauri.conf.json 解析失败）；`-replace` 是全局正则（v3.4.4 曾打断 dark 作用域）；.NET File API 用**绝对路径**（进程 cwd 可能是 D:\hobby）
- **失败构建后 RustWebView.kt 处于无补丁重生成状态**，勿误提交；构建后它与 tauri.settings.gradle 是惯例脏文件
- **Cargo.lock 随版本号变动**：版本 bump 后首次 cargo 构建会改它，随功能一起提交即可
- 缓存目录 API 返回 Result 要 unwrap；`agent-config.local.js` 丢失从 TEMP\v342 备份还原
- 子代理可能因模型波动中断：派活先盘点现场；接管先查 git log/status
- 分支操作前 `git checkout -- src-tauri/gen/android/tauri.settings.gradle`
- Tauri IPC 传大数据禁用 JSON 数字数组（曾致兆级库删除近 10 秒）：一律 base64（write/read_db_file_b64 模式）

## 9. 版本纪律

- 功能 +0.1.0，补丁 +0.0.1；等用户测试确认再进下一版
- GitHub Release 只在用户确认的稳定里程碑（已发：3.0.0/3.2.0/3.3.9/3.4.4/4.0.3/4.1.0）
- 预置版永不外传；上边栏 AI/指南/分类/设置四按钮不轻易动
- tag 已推送后发现补丁：私有单人仓可移动 tag 强推（需核验 ls-remote），或独立 patch 版
