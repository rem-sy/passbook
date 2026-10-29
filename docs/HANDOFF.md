# 密码本 Handoff 交接文档（2026，v4.6.5 之后）

> 新会话开工前必读。配套：[ROADMAP.md](ROADMAP.md)（v4.7.0 定稿规格）· [DEVELOPGUIDE.md](DEVELOPGUIDE.md)（架构/管线/规范/坑）· [RESEARCH-v4.7-p0.md](RESEARCH-v4.7-p0.md)（P0 三项设计）· [NEXT-TASK.md](NEXT-TASK.md)（v4.7.0 开工提示词）。
> 历史文档已归档至 [archive/](archive/)。

## 项目定位与环境
- 单人自用的本地优先**个人数据保险箱**：密码 + 随手记 + 文件仓一体加密收纳，跨类型分类体系，内置 AI 助理
- Tauri v2（Rust lib.rs）+ WebView 前端（public/ 单页）+ SQLite（整库加密）+ files-store 分桶密文本体
- 仓库：github.com/rem-sy/passbook（私有，main）；本地 `D:\hobby\源码\密码本`；产物 `D:\hobby\产物\密码本\`
- 环境：Windows + PowerShell 5.1；Node 测试；Android SDK/JDK 在 `D:\hobby\.android-dev\`；代理 `http://127.0.0.1:7890`（GitHub 必须走；**代理进程可能没起，失败改直连**：`git -c http.https://github.com.proxy= -c http.proxy= push`）
- token：`$env:TEMP\gh-token.txt`；curl 用 `$env:SystemRoot\System32\curl.exe`

## 当前状态（交接时点）
- HEAD = tag **v4.9.0**（自动更新：桌面 tauri-plugin-updater 全自动 + Android 应用内下载 APK + 每版发 GitHub Release）；对外里程碑 Release 停在 v4.1.0
- 版本演进：v4.3 随手记 → v4.4 文件仓 → v4.5 内容检索 → v4.6 跨类型分类 → v4.7 保险箱一体化 → v4.8 AI 全库化（18 工具+确认删除）→ v4.8.1 UI 对齐应用图标 → v4.9.0 自动更新
- 测试：21 套单测 + channel-live；e2e：e2e-import（加密 .db）、e2e-zip（zip+异密钥迁移）、e2e-updater（手动：桌面更新真链路）
- 自动更新关键物：minisign 密钥在 `D:\hobby\产物\密码本\signing\`（密码 passbook2024，绝不入库/丢失即断更）；token 在 `%TEMP%\gh-token.txt`；私有仓下载只能走 assets API（见 DEVELOPGUIDE §8 v4.9.0 新坑）；仓库拟转 public（转前审计 git 历史）
- 惯例脏文件：RustWebView.kt（带补丁的正确状态）/ tauri.settings.gradle；Cargo.lock 随版本提交；docs/archive 已 gitignore 不入库
- 下一版：v4.7~v4.9 均待用户真机验收（清单见 ROADMAP）；仓库转 public 后让用户复测免 token 更新链路

## 近期重要教训（新会话必看，DEVELOPGUIDE §8 有完整版）
- 自建弹窗层 z-index 一律 **660**（promptKeyInput 曾沉在导入弹窗背后 → 用户"看不到密钥输入"）
- 原生桥静态 lastResult **启动 Activity 前必须置 pending**（残留旧 JSON → zip 导入"读取文件失败"）
- Android tauri dialog 返回 content:// **不可用**——选文件一律 pickRaw 桥
- 导入解析必须**取全字段**（totp_secret/fav 曾被 6 字段 SELECT 截断）
- ps1 **恰好单 BOM**（双 BOM → param() 失效 → -Preset 静默变正式版覆盖产物）
- headless Edge 测试：去 --disable-gpu、挑 type=page、僵尸端口守卫、清 SW+HTTP 缓存——四坑全踩过，scripts/ 里现成写法照抄

## 发布与构建速查
详见 DEVELOPGUIDE §3/§4。口诀：测试 → 版本 4 处（tauri.properties 有 versionCode/versionName 两行）+ sw +1 → 中文 commit（点名 add）→ 6 产物（串行）→ aapt2/apksigner（cc06eb3e）+ 解包 grep → tag + push（代理或直连）→ Release 等用户明示。
