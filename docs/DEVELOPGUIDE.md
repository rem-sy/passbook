# 密码本 开发指南（DEVELOPGUIDE · v4.6.5 现状版）

> 面向实现者的一页通：架构、代码地图、数据层、构建、发布、测试、UI 规范、坑。
> 环境与当前状态见 [HANDOFF.md](HANDOFF.md)；版本规划见 [ROADMAP.md](ROADMAP.md)；历史版指南在 archive/。

## 1. 总架构

- **Tauri v2**（Rust `src-tauri/src/lib.rs`）+ **WebView 前端**（`public/` 单页，无框架，IIFE，UMD 模块）
- 数据：**SQLite**（前端 sql.js 内存库 + 整库落盘；Android/桌面写应用私有文件，浏览器写 IndexedDB）+ **文件仓本体**（files-store/ 分桶密文，绝不进 SQLite）；可选远程服务端模式（/api，仅密码条目）
- 三平台一份前端：桌面（WebView2）/ Android（RustWebView + 原生桥）/ 浏览器 PWA（Service Worker 离线）
- 原生能力两条路：
  1. **Rust 命令**（tauriInvoke；字节 IPC 一律 base64）
  2. **原生 Activity + JS 桥**（RustWebView.kt 注入 `@JavascriptInterface`；manifest 与 Activity 是仓库提交物，RustWebView.kt 每次构建由 build.rs 重新生成、**由 build-android.ps1 按锚点幂等补丁**）

## 2. 代码地图

### public/（前端）
| 文件 | 职责 |
|---|---|
| app.js | 主逻辑 IIFE：state/store/三页渲染/弹窗/导入导出/多选/设置/加密钩子/AI 面板装配；`__PB_DEBUG` 只读调试出口（e2e 用） |
| index.html / style.css | 单页壳与全部样式（z-index 阶梯见 §7） |
| search.js | PassSearch：多词 AND 模糊、操作符（分类：/有验证码/有收藏）、catSplit/catJoin、sortEntries |
| notes.js | PassNotes：notes 表 schema、pending 队列解析消费、便签检索 |
| filehub.js | PassFiles：files/file_kv schema、sha256 分桶路径、引用计数、previewKind 矩阵+VIEW_MIMES、mdToHtml、parsePendingFiles、buildZip/**parseZip**、ftext 处理（xmlToText/snippetOf/capText）、tagsSplit/Join/unionTagCounts（跨类型分类） |
| agent-core.js | AI 工具定义（OpenAI function calling）+ 对话循环 + 打码双通道（onDisplay） |
| importer.js / qr.js / watchtower.js / generator.js / passphrase.js / totp.js / biometric.js / autolock.js / theme.js / backup.js / db-crypto.js / agent-core.js | 其余功能模块 |
| lib/ | 本地打包第三方库：sql-wasm、jsQR、qrcode-generator、**pdfjs/**、docx-preview、jszip、xlsx（绝不走 CDN） |
| guide/ guide-mobile/ | 使用说明截图（桌面/手机两套，进 sw ASSETS） |

### src-tauri/src/lib.rs（Rust 命令层）
- 数据库：read/write_db_file(_b64)、pick_import_db（**Android 返回 content:// 不可用**，前端走 pickRaw 桥）
- 文件仓：store_blob_write/read/exists/delete/list(_b64)、get_files_store_dir、pick_files（多选）、read_file_bytes_b64、filehub_temp_write_b64、shell_open、export_bytes_b64
- 随手记：read_pending_notes / read_pending_files、set_quicknote_shortcut
- 其他：saf_temp_write、favicon_fetch、agent_http(_stream)、bio_available/prompt

### Android 原生（gen/android/app/src/main/java/com/passbook/app/）
| 文件 | 职责 |
|---|---|
| FileHub.kt | 收件公共管线：stage 流式拷贝(8KB)+sha256、来源识别、pending 队列、明文库 dupCount |
| QuickNoteActivity / ShareTextActivity | 快捷方式读剪贴板 / 文本分享（pending 队列） |
| ShareFileActivity / OpenFileActivity | 文件分享（ACTION_SEND */*）/ 其他应用打开（ACTION_VIEW，先拷贝再弹框双动作） |
| SafImportActivity / SafPickRawActivity | SAF 多选批量导入 / 通用单文件选取（导入选 .db/.json/.zip 用） |
| RustWebView.kt（生成+补丁） | JsBio/JsSaf 桥（result/save/open/pick/pickRaw 系列） |

### scripts/
build-android.ps1（含 RustWebView 幂等补丁链 a1~a5）/ build-desktop.ps1 / shot-cdp.mjs（CDP 截图，含僵尸端口守卫）/ take-guide-shots.ps1（GDI 备用）/ **e2e-import.mjs / e2e-zip.mjs**（headless Edge 端到端回归，mock Tauri 可跑应用级逻辑）

### 前端数据层（app.js 内）
- `LocalStore`（sql.js）：init() 迁移链（entries/attachments/notes/files/file_kv 全 IF NOT EXISTS + 老库 ALTER 补列幂等）→ persist()（可选 DbCrypto 整库加密）→ b64 IPC 写盘；files CRUD + fileSetFtext + fileKv
- `ServerStore`：仅密码条目；notes/files 同口径「仅本地模式支持」提示
- 文件仓密钥：`vaultEnsureCrypto`（file_kv 存 salt/材料指纹）；换密钥唯一路径 `vaultReencryptAll`（挂 enable/disable/migrateToAutoKey 三钩子）
- 跨类型分类：`state.category` 全局筛选三页；侧栏并集计数（unionTagCounts）；管理分类弹窗同步三类记录

## 3. 构建管线（Android bypass）

`build-android.ps1`：cargo aarch64 交叉编译 → .so 入 jniLibs → public/ 入 assets → gradle 打包（--no-daemon）。`-Preset` 出预置版（含 gitignore 的 agent-config.local.js）。
- **RustWebView.kt 幂等锚点补丁**：a1 viewport / a2 JsBio+JsSaf / a4 相机权限 / a5 文件仓桥（open/pick/pickRaw，**启动 Activity 前先重置对应 lastResult**）
- 桌面：build-desktop.ps1（setup + portable × 正式/preset）
- 签名：`D:\hobby\产物\密码本\signing\passbook-release.jks`，alias passbook；验收 SHA-256 前缀 **cc06eb3e**

## 4. 标准发布流水线（每版照此）

1. 功能 + 测试（新功能配 `test/X.test.mjs` 纯函数测试；涉及导入/zip 的加 e2e 场景）+ `node --check public/*.js`
2. 跑全部测试套件（`test/*.test.mjs`，channel-live 为外部探测不计；当前 21 套——v4.9.0 加 updater）
3. 版本 4 处 + sw.js CACHE_NAME +1（改版本文件用 .NET WriteAllText + UTF8Encoding($false) + 绝对路径；tauri.properties 有 versionCode/versionName 两行）
4. commit（中文信息、不含英文双引号；只 add 明确文件，勿 `git add -u`——**v4.9.0 教训：逐个列路径漏了 lib.rs，tag 一度指向缺实现的提交**）
5. build-android.ps1 → -Preset → build-desktop.ps1（共 6 产物，**串行勿并发**；gradle daemon 偶发被内存压力杀掉，重跑即可）
6. 验收：aapt2 dump badging（versionName/versionCode）+ apksigner verify（cc06eb3e，JAVA_HOME=D:\hobby\.android-dev\jdk）+ 解包 grep 新功能关键词（unzip -p assets/...）
7. tag vX.Y.Z + `git push origin main vX.Y.Z`（代理 127.0.0.1:7890；代理进程可能没起——先探测，失败改 `-c http.https://github.com.proxy= -c http.proxy=` 直连）
8. **v4.9.0 起必跑 `scripts/publish-release.ps1 -Tag vX.Y.Z`**：建 Release 挂四资产（正式 setup/portable/APK + latest.json——latest.json 最后传，platforms.url 指向 setup 资产的 assets API 地址）；预置版绝不上传；token 读 `%TEMP%\gh-token.txt`；同 tag 重跑幂等（先删旧资产）。对外里程碑 Release（发说明/置顶）仍需用户明示

## 5. 测试规范

- `node:test` + `node:assert/strict`；UMD 装载惯例：`globalThis.window = globalThis` + `(0, eval)(src)`
- **e2e**（e2e-import/e2e-zip）：headless Edge + 服务器 + `Network.setCacheDisabled` + **启动前清 SW 缓存 + 僵尸端口守卫**（见 §8）
- 套件清单：api/generator/agent/autolock/backup/biometric/categories/db-crypto/filehub/ftext/generator/importer/notes/passphrase/presets/qr/search/sort/theme/totp/watchtower（20）+ channel-live（外部）

## 6. 数据层规范

- 新表进 `LocalStore.init()` 迁移链：CREATE IF NOT EXISTS + 老库 PRAGMA table_info 检查补列，幂等可重入
- 大二进制不进 SQLite；文件仓本体走 sha256 分桶密文
- 导入字段保真教训（v4.6.3）：跨端导入解析必须取全字段（totp_secret/fav/history）
- 判重语义：文件仓 zip 导入按 sha256+name+size 三重一致才跳过

## 7. UI 规范（血泪沉淀）

- z-index 阶梯：sidebar 60 / modal 500 / 联想 600~650 / **自建弹窗层一律 660** / 锁页 800 / toast 900
- 动态弹窗按钮 document 委托；tab 切换 handler 加分支；`label.file-drop` display:block
- 移动端工具栏按钮多时允许换行（tb-line wrap）；文件详情四按钮 2×2（foot-wrap）
- 三页三搜索框互不干扰（顶栏只搜密码）；侧栏三页通用（跨类型分类）
- 便签/文件标签串读取用 tagsSplit（容错逗号/顿号/空格），保存用 tagsJoin 规范

## 8. 已知坑（勿重蹈；含 v4.6 系列新坑）

- **PS 5.1**：`-Encoding UTF8` 带 BOM；.NET File API 用绝对路径；**ps1 文件必须恰好单 BOM**（对已有 BOM 文件再写 utf-8-sig 会双 BOM → param() 失效 → -Preset 静默变正式版）
- **自建弹窗层 z-index 660**：promptKeyInput/showKeyBackup 曾用 320 沉在业务弹窗背后（加密 .db 导入"没有密钥输入"即此因）
- **静态桥结果残留**：Activity companion lastResult 静态字段——桥方法启动 Activity **前必须置回 "pending"**，否则轮询读到上次 JSON 拿已删临时路径（zip 导入"读取文件失败"）
- **Android tauri dialog 不可用**：返回 content://（Rust 读不了）——选文件一律走 pickRaw 桥
- **headless Edge 测试三坑**：①`--disable-gpu` 会令新版 headless 完全不出帧（去掉）；②`/json` 多目标必须挑 `type==='page'`；③**调试端口被残留僵尸占用时新实例绑不上、CDP 连旧实例旧数据**——脚本启动前用 PowerShell 按 `remote-debugging-port+headless` 双特征精准清理（绝不按映像名杀 Edge），退出 finally 同步 taskkill /T，每轮独立 profile
- **SW/HTTP 缓存吃旧代码**：测试页连应用前先 unregister SW + caches.delete + Network.setCacheDisabled，否则跑到旧版 app.js 全部断言失真
- 其余旧坑：RustWebView.kt 构建后处于无补丁状态勿提交（惯例脏文件）；Cargo.lock 随版本提交；Tauri IPC 大数据禁 JSON 数字数组（一律 b64）；`-replace` 全局；缓存目录 API unwrap；分支操作前 checkout tauri.settings.gradle
- **v4.9.0 新坑（自动更新调试血泪）**：
  1. **编辑工具重写 ps1 会丢 BOM**——每次改完 ps1 必须补单 BOM 再跑（丢 BOM = PS5.1 按 ANSI 解析中文 = 意外的 `}` 解析错）
  2. **updater 签名密钥必须带密码**——PS5.1 给环境变量赋空串等于删除变量；空密码密钥会令 tauri CLI 交互式等密码输入、在 cmd 重定向下永久挂死。密钥+密码存 `产物\signing\`（passbook2024），公钥嵌 tauri.conf.json，私钥绝不入库
  3. **NSIS 必须 `displayLanguageSelector: false`**——语言选择窗在 updater passive 安装时照样弹出等交互，安装卡死
  4. **私有仓 `github.com/releases/...` 直链带 token 也是 404**——资产下载一律走 `api.github.com/repos/.../releases/assets/<id>` + `Accept: application/octet-stream`（公开后同样有效）；latest.json 的 platforms.url 由 publish-release.ps1 用资产 id 生成
  5. 桌面更新检查在有 token 时走「API 发现 latest.json 资产地址 → UpdaterBuilder.endpoints 动态注入」；网络失败自动回退 `http://127.0.0.1:7890` 重试一次
  6. e2e-updater.mjs：便携版真链路回归（CDP 驱动真实应用完成 检查→下载→验签→安装→重启），需配合谎报版本的测试 Release

## 9. 版本纪律

- 功能 +0.1.0，补丁 +0.0.1；等用户测试确认再进下一版
- v4.9.0 起每版 tag 后必发 Release（publish-release.ps1，自动更新通道依赖）；对外里程碑 Release（带说明的正式发布页）仍在用户确认时（已发：3.0.0/3.2.0/3.3.9/3.4.4/4.0.3/4.1.0）
- 预置版永不外传（Release 只挂正式产物）；上边栏四按钮不轻易动
- tag 已推送后发现补丁：独立 patch 版（私有单人仓也可移 tag 强推，需核验 ls-remote）
