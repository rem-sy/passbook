# 下一任务提示词（新窗口直接粘贴）

---

密码本项目（D:\hobby\源码\密码本，私有仓 rem-sy/passbook，main 分支）。开工前先读 docs/HANDOFF.md（环境/现状/坑）、docs/DEVELOPGUIDE.md（架构/管线/规范）和 docs/ROADMAP.md（本版规格），v4.3+ 全案调研在 docs/RESEARCH-v5-storage.md。

任务：实现 v4.3.0「随手记 + 三标签页框架」（规格在 ROADMAP.md 已定稿，要点重述）：

1. **数据层**：notes 表（id/title/content/tags/source/created_at/updated_at，source ∈ manual|clipboard|share）进 LocalStore.init() 迁移链（CREATE IF NOT EXISTS 幂等），随 .db 整库加密；store 适配器补 notes CRUD
2. **三标签页框架**：顶栏下页面级 tab「密码 | 随手记 | 文件仓」，state.view + localStorage 记忆停留页；密码页现有交互（多选/漏斗/体检/扫码）零改动，文件仓 tab 本版占位（v4.4 解锁）
3. **便签页**：列表 + 新建/编辑（标题、正文、标签、来源徽标）+ 删除；搜索框在便签页检索便签（复用 PassSearch 多词管线）
4. **手机快捷方式（对标微信扫一扫）**：
   - res/xml/shortcuts.xml 静态 App Shortcuts + 主 Activity manifest 挂 meta-data（这些是仓库提交物，直接改）
   - QuickNoteActivity（透明主题、noHistory、不加载 WebView）：onResume 读剪贴板 → 原生确认框预览前 80 字 → 确认后追加写 pending 队列文件（JSON 行，filesDir 下）→ Toast → finish；空剪贴板直接 toast 退出
   - 应用启动时前端经 Rust 命令读 pending 队列消费入 notes 表（source=clipboard），Toast 报「已收入 N 条随手记」；队列文件读完清空
5. **文本分享接收**：manifest 加 ACTION_SEND text/plain intent-filter → ShareTextActivity（透明）拿 EXTRA_TEXT 走同一 pending 队列（source=share）
6. **桌面对齐**：tauri global-shortcut + clipboard-manager 插件，全局快捷键（默认 Ctrl+Alt+N，设置里可改）读剪贴板 → 应用内确认框 → 直接入 notes 表
7. **测试**：新增 test/notes.test.mjs 纯函数（pending 队列消费与去重、便签检索命中、迁移幂等）；队列 JSON 行解析容错（空行/截断行）

管线（DEVELOPGUIDE §4 有完整版）：node --check + 全部 17+1 套测试 → 版本 4 处升 4.3.0（versionCode 40300，用 .NET WriteAllText 无 BOM 绝对路径）+ sw.js CACHE_NAME +1（ASSETS 加新文件）→ commit（中文信息、无英文双引号、点名 git add 勿 -u）→ build-android.ps1 → -Preset → build-desktop.ps1 共 6 产物（串行）→ 验收：aapt2 versionName=4.3.0 + apksigner cc06eb3e + 解包 grep（notes 表/quicknote 关键词/shortcuts.xml 在包，用 aapt2 dump xmltree 查 manifest shortcuts meta-data）→ tag v4.3.0 + push（代理 http://127.0.0.1:7890，TLS 抖动重试）。不发 Release，完成后报告等我测试。

真机验收清单（报告里列出请用户测）：长按图标出现「随手记」快捷方式；复制文本 → 点快捷方式 → 确认框 → Toast；打开应用便签已入库；微信里长按一段文字分享给密码本；桌面 Ctrl+Alt+N；三标签页切换与记忆。

关键坑提醒：新 Activity 文件放 gen/android/app/src/main/java/com/passbook/app/（与 BioBridgeActivity 同目录）；QuickNoteActivity 绝不初始化 WebView/Tauri（秒开是产品核心）；manifest 是提交物但构建后照例核对是否被 gradle 动过；动态弹窗按钮 document 委托；tab 切换 handler 记得加 view 分支；IPC 传数据一律 base64 模式；PS 5.1 写文件勿用 -Encoding UTF8。

---

（本提示词随版本推进由 ROADMAP/HANDOFF 更新者维护。）