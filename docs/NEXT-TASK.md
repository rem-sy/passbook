# 下一任务提示词（新窗口直接粘贴）

---

密码本项目（D:\hobby\源码\密码本，私有仓 rem-sy/passbook，main 分支）。开工前先读 docs/HANDOFF.md（环境/管线/坑）和 docs/ROADMAP.md（本版规格）。

任务：实现 v4.1.0「浏览器一键导入」（规格已在 ROADMAP.md 定稿，要点重述）：

1. 导入弹窗新增第 4 个 tab「浏览器导入」，复用现有 file-drop 选 CSV
2. 表头自动识别：按 url/username/password/name/note 关键词模糊匹配映射到 所属/网址/账户/密码/备注，不硬编码列序；兼容 Chrome（name,url,username,password,note）、Edge（同源）、Firefox
3. 预览确认：「识别为 XX 格式 · N 条 · M 条与现有条目重复（同网址+账户）」+ 去重策略单选（跳过重复 / 仍导入）
4. 容错：密码列空行跳过并计数；CSV 引号转义 / BOM / CRLF 兼容
5. 导入完成提示：浏览器导出 CSV 为明文，建议删除原文件
6. 解析逻辑抽纯函数放 public/ 或复用现有 CSV 解析；新增 test/importer.test.mjs（Chrome/Edge 真实导出样例、表头变体、空密码、重复检测）

管线（HANDOFF.md 有完整版）：node --check + 全部 16 套测试 → 版本 4 处升 4.1.0（versionCode 40100）+ sw.js CACHE_NAME +1 → commit（中文信息、无英文双引号）→ build-android.ps1 + build-android.ps1 -Preset + build-desktop.ps1 全套 6 产物 → 验收（aapt2 versionName=4.1.0、apksigner 签名 cc06eb3e、APK 内 importer 关键词在包）→ tag v4.1.0 + push（代理 http://127.0.0.1:7890）。不发 Release，完成后报告等我测试。

关键坑提醒：动态弹窗内按钮绑定用 document 事件委托；file-drop 容器记得 display:block；PS 5.1 下 .NET File API 用绝对路径。

---

（本提示词随版本推进由 ROADMAP/HANDOFF 更新者维护。）
