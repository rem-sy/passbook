# 密码本 Roadmap（v4.7+ 一体化时代）

> 维护约定：每完成一个版本更新此文件并归档旧版到 docs/archive/（archive 不入 git）。
> 当前已发布：**v4.8.1**（… → v4.8 AI 助手全库化 → v4.8.1 UI 对齐应用图标）。
> v4.7 调研：[RESEARCH-v4.7-p0.md](RESEARCH-v4.7-p0.md)；v4.9 调研：[RESEARCH-v4.9-autoupdate.md](RESEARCH-v4.9-autoupdate.md)。

## v4.9.0（进行中）：自动更新（GitHub Release 分发）

**目标：桌面全自动更新（官方 updater 插件）；Android 应用内下载 APK 半自动；每版发 GitHub Release。设计细节见 [RESEARCH-v4.9-autoupdate.md](RESEARCH-v4.9-autoupdate.md)。**

- 桌面：tauri-plugin-updater（passive 安装）+ minisign 签名（私钥与 jks 同目录保管）+ latest.json 静态端点；启动静默检查 + 设置手动检查；token/代理可配，网络失败自动回退 127.0.0.1:7890
- Android：GitHub API 查最新 Release → Rust 流式下载 APK 到 cache → FileProvider+ACTION_VIEW 拉起系统安装器（需 REQUEST_INSTALL_PACKAGES）；SAF 另存与浏览器打开兜底；启动检查 24h 节流
- 发布管线：build-desktop 产 latest.json；新增 publish-release.ps1（gh release create 附正式产物，预置版永不上传）；版本纪律改 tag→push→publish 三连
- 仓库将转 public：转前审计 git 历史敏感文件；docs/archive 移出 git 跟踪（已 gitignore）

## 版本规范
- 功能 +0.1.0，补丁 +0.0.1；v4.9.0 起每版发 GitHub Release（自动更新依赖）；对外里程碑 Release 照旧需用户明示
- 版本 4 处同步：package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml / gen/android/app/tauri.properties（versionCode = M×10000+m×100+p；**versionName 也在该文件**，两行都要改）
- sw.js CACHE_NAME 每版 +1；产物 ASCII 命名；-preset 预置版仅本地永不上传（Release 也只挂正式产物）

## v4.8.0（已完成，待用户验收）：AI 助手全库化

**目标：AI 从「带关键词检索」扩为「无关键词盘点 + 详情 + 管理」，删除走确认卡。**

- 盘点：`list_items`（type+limit+tag 过滤，密码打码/便签摘要/文件元数据；服务器模式 passwords 可用）；`vault_overview`（三类条数/文件仓占用/索引覆盖率/top 标签/最近更新）
- 详情：`get_note`（≤80 字摘要+全文卡片）、`get_file`（元数据+正文前 200 字摘要，受 agentFileContent 开关控制）；id/query 定位，多条命中只列出不猜
- 管理：`update_note`（多条不写先确认）、`remove_tag`（与 tag_items 对称）、`rename_tag`（三侧同步重命名）
- 删除确认卡：`delete_note`/`delete_file` 只能发起，应用内红色确认卡 5 分钟内点「确认删除」才真删（文件走引用计数）；AI 无单删权，密码不给删
- 工具总数 9→18；SYSTEM_PROMPT 13 条规则；全套测试无回归

## v4.7.0（已完成）：保险箱一体化（P0 三项）

**目标：AI 助手从「密码助理」长成「保险箱助理」；文件仓数据自体检；跨设备迁移密钥免折腾。**

### 1. AI 助手跨类型化
- 新工具：`search_notes`（PassNotes.searchNotes，标题/正文/标签多词）、`search_files`（元数据 + ftext 正文检索，返回 snippetOf 片段）、`create_note`（source=manual）、`tag_items`（跨类型打标签：passwords/notes/files 各走对应 update 管线）
- 架构：agent-core.js 保持零依赖——createExecutor 注入 `hub` 参数包（app.js 组装 LocalStore 侧能力）；TOOLS/SYSTEM_PROMPT 扩写为「个人数据保险箱助理」
- 隐私红线：便签/正文只回传**摘要片段（≤80 字）**，全文走 onDisplay 应用内卡片；设置 → AI 助理加「允许 AI 检索文件正文」开关（默认开，文案注明会发送片段摘要）
- 服务器模式：notes/files 工具返回「仅本地模式支持」提示语

### 2. 文件仓体检
- 纯函数 `PassFiles.healthPlan(rows, blobShas)` → { missingBlob / orphanBlob / needIndex / suspectIndex }
- 入口：文件仓工具栏「体检」按钮；报告弹窗（四段计数+明细前 20 条）+「清理孤儿桶 N 个」「重建索引 N 个」
- Rust 无新命令（store_blob_list/exists/delete 已齐）；重建索引用现有 queueFtext 管线

### 3. zip 导入密钥迁移（对齐 .db 导入体验）
- importFilehubZip 落桶前**试解**首个本体（本机文件密钥）：同体系直接写；异体系弹 promptKeyInput（z660）→ 「原密钥 + manifest.files_salt」派生导出端密钥再试解
- 试解成功 → 全量**重加密迁移**（解密→本机密钥加密→落桶），toast 报迁移数；再失败 → 明确报错并**中止导入**（不落半套数据）
- 特例：纯元数据 zip 跳过验解；导出端未加密（固定设备密钥）且本机加密时提示「导出端先启用加密再导出」
- v4.6.5 的跳过判重自愈补桶同样走迁移路径

**测试**：agent.test 扩四工具执行器用例（mock hub：打码/截断/落库）；ftext/filehub.test 补 healthPlan 全分支；e2e-zip 加「异密钥 zip → 弹钥 → 迁移后可解」场景。全套 22 套不回归。

**验收（真机）**：AI 问「体检报告在哪/上周快递单号」出文件/便签卡片；让 AI 记便签；跨类型打标签；体检报告与清理；异密钥 zip 迁移后可打开预览；关正文检索开关后 AI 只搜文件名。

## P1（v4.8+/v5.0 候选，按需排期）
- 便签贴图：复用文件仓图片管线（便签附件=files 表引用+关联字段，零新存储）
- 备份容灾：自动快照可选附带 files-store 本体（或每日增量 zip）
- 全局命令面板（桌面 Ctrl+K）：跨三页搜名称/正文/账号，回车跳转；三框交互基线不动
- 桌面托盘（记一条/锁屏/打开）+ Android 小组件一键随手记
- 三页视觉统一打磨（v5.0 原有项）

## P2（远期/评估后缓行）
- Passkey 阶段 1：credentialId/rpId/userHandle 结构化存储 + Bitwarden JSON 导入（只存不用）
- FTS5 全文索引（个人量级 LIKE 毫秒级，不急）
- 云同步（违背本地优先；最多做启动时检测同步目录变更提示合并）
- OCR（20MB 语料+秒级/张，性价比低不做）；旧 doc/ppt 内置渲染（依赖重不做）

## 明确不做
- 多用户/组织共享；云托管同步；后台常驻监听剪贴板；直读微信/QQ 私有目录

## 竞品对标存量结论
头部密码管理器（Keyguard/KeePassXC/KeePassDX）均未覆盖「密码+便签+文件一体加密收纳+AI 助理」组合——本项目差异点已从密码管理器转为个人数据统一保险箱。
