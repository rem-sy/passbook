# 密码本 Handoff 交接文档（2026，v4.1.2 之后）

> 新会话开工前必读。配套：[ROADMAP.md](ROADMAP.md)（版本规划）· [DEVELOPGUIDE.md](DEVELOPGUIDE.md)（架构/管线/规范）· [RESEARCH-v5-storage.md](RESEARCH-v5-storage.md)（v4.3+ 调研）。
> 历史文档已归档至 [archive/](archive/)。

## 项目定位与环境
- 单人自用的本地优先**个人数据保险箱**（v4.3 起由纯密码管理器扩展）：Tauri v2（Rust lib.rs）+ WebView 前端（public/ 单页）+ SQLite（加密 .db）
- 仓库：github.com/rem-sy/passbook（私有，main）；本地 `D:\hobby\源码\密码本`；产物 `D:\hobby\产物\密码本\`
- 环境：Windows + PowerShell 5.1；Node 测试；Android SDK/JDK 在 `D:\hobby\.android-dev\`；代理 `http://127.0.0.1:7890`（GitHub 必须走）
- token：`$env:TEMP\gh-token.txt`；curl 用 `$env:SystemRoot\System32\curl.exe`

## 当前状态（交接时点）
- HEAD = tag v4.1.2 = `0e4a9e7`；Release 停在 v4.1.0（383628895，正式 3 产物）；4.1.1/4.1.2 为修复小版本未发 Release
- v4.1.0 浏览器一键导入（Edge 实测通过）；v4.1.1 base64 IPC + 多选三修；v4.1.2 手机端 TOTP 断行修复（实测通过）
- v4.3.0 随手记 + 三标签页；v4.3.1 便签独立搜索/卡片详情/快捷方式剪贴板重试四修；**v4.4.x 文件仓 + v4.5.0 内容检索已交付（待用户真机验收）**；v4.5.0：files 表补 ftext/ftext_ok 列（迁移幂等），正文抽取管线（pdfjs getTextContent / JSZip 解 OOXML / SheetJS CSV，cap 256KB），导入后异步队列 + 工具栏内容索引按钮，searchFiles 内容命中合并（test/ftext.test.mjs 7 项）：files 表 + files-store 加密分桶（密钥从库密钥派生，未加密库用固定设备密钥，换密钥走 vaultReencryptAll 唯一重加密路径）；四通道收件（分享 ShareFileActivity / 其他应用打开 OpenFileActivity 双动作 / SAF 批量 SafImportActivity + __passbook_saf.pick 桥 / 桌面拖拽 + pick_files）；预览矩阵本地打包（public/lib：pdfjs / docx-preview + jszip / xlsx.full）；zip 导出（store-only 自写 buildZip）；test/filehub.test.mjs 15 项
- 工作树干净（惯例脏文件除外：RustWebView.kt / tauri.settings.gradle / Cargo.lock）
- 下一版：待用户对 v4.4.0 真机验收后定（候选：v4.4.x 文件仓补丁或 v5.0 收尾，见 ROADMAP）

## 近三期版本要点（新会话快速进入）
- v4.1.0：`public/importer.js` 浏览器 CSV 导入纯函数；导入弹窗第 4 tab（document 委托模式）
- v4.1.1：数据库读写一律 base64 IPC（`write/read_db_file_b64`、pick_import_db 返 b64）——**新增数据通道必须沿用 b64 模式**；多选 visibleIds 全选语义
- v4.1.2：卡片内关键数字 nowrap + 容器 wrap 兜底

## 下一步（v4.3.0）关键决策（调研已定，见 RESEARCH-v5-storage.md）
- 手机快捷方式 = 静态 App Shortcuts + 透明 QuickNoteActivity 读剪贴板（Android 10+ 仅焦点应用可读，合规）
- 快捷入库走 **pending 队列文件**（纯原生 JSON 追加，不加载 WebView），应用启动前端消费入 notes 表
- AndroidManifest/Activity/res-xml 均为仓库提交物，直接改；RustWebView 桥补丁模式不动
- 桌面对齐：global-shortcut + clipboard-manager（需加 tauri 插件依赖）

## 发布与构建速查
详见 DEVELOPGUIDE §3/§4。口诀：测试 → 版本 4 处 + sw +1（无 BOM 写法）→ 中文 commit（点名 add）→ 6 产物 → aapt2/apksigner（cc06eb3e）→ tag + push（代理）→ Release 等用户明示。

## 坑速查（完整版在 DEVELOPGUIDE §8）
PS5.1 BOM / -replace 全局 / .NET 绝对路径；失败构建后 RustWebView.kt 无补丁勿提交；IPC 大数据禁 JSON 数组走 b64；动态弹窗 document 委托；tab 新增加分支；file-drop display:block；构建串行勿并发。
