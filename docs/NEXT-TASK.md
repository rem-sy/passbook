# 下一任务提示词（新窗口直接粘贴 · v4.7.0）

---

密码本项目（D:\hobby\源码\密码本，私有仓 rem-sy/passbook，main 分支）。开工前先读 docs/HANDOFF.md（环境/现状）、docs/DEVELOPGUIDE.md（架构/管线/规范/坑速查）和 docs/ROADMAP.md（v4.7.0 定稿规格），三项优化设计细节在 docs/RESEARCH-v4.7-p0.md。

任务：实现 v4.7.0「保险箱一体化」（规格在 ROADMAP.md 已定稿，要点重述）：

1. **AI 助手跨类型化**：agent-core.js 新增四工具——`search_notes`（PassNotes.searchNotes 多词匹配，返回标题+previewText 截断预览）、`search_files`（元数据 PassFiles.searchFiles + ftext 正文检索，返回 snippetOf 片段，matched_meta/matched_content 双计数）、`create_note`（LocalStore.noteCreate，source=manual）、`tag_items`（跨类型打标签，targets={type:passwords|notes|files, id或query}，各走 catJoin/tagsJoin 规范追加）。架构：createExecutor 增 hub 参数包（app.js 组装，agent-core 保持零依赖）；SYSTEM_PROMPT 改写为「个人数据保险箱助理」（存便签必须落库才算、查文件/便签先调工具、正文只给摘要让用户看卡片、禁止编造内容）。**隐私红线**：便签/正文只回传 ≤80 字摘要，全文走 onDisplay 应用内卡片；设置 → AI 助理加「允许 AI 检索文件正文」开关（默认开，settings key 建议 agentFileContent），关闭时 search_files 仅元数据；服务器模式 hub 返回「仅本地模式支持」提示语。

2. **文件仓体检**：filehub.js 纯函数 `healthPlan(rows, blobShas)` → { missingBlob / orphanBlob / needIndex / suspectIndex }（suspect=ftext_ok=1 且应有文本类型但 ftext 空）；UI：文件仓工具栏「体检」按钮 → 报告弹窗（四段计数+明细前 20 条+文件名）→ 动作：「清理孤儿桶 N 个」（store_blob_delete，报回收字节数）、「重建索引 N 个」（并入现有 queueFtext 管线）、missingBlob 提示从 zip 备份导入可自愈或手动删行（不自动删）。Rust 无新命令。

3. **zip 导入密钥迁移**：importFilehubZip 改为**先验后写**——落桶前用本机文件密钥（vaultEnsureCrypto）试解 zip 首个本体；失败弹 promptKeyInput（z660，文案「文件仓加密体系与导出端不同，请输入导出端的数据库加密密钥」）→ 用「输入密钥+manifest.files_salt」派生导出端密钥再试解：成功则全量重加密迁移（解密→本机密钥加密→落桶，toast 报迁移数，抽成可注入 keyFn 的纯函数便于测试）；失败则明确报错并**中止导入不落半套数据**。纯元数据 zip 跳过验解；v4.6.5 判重跳过时的自愈补桶同走迁移函数。边界：导出端未加密+本机加密时无钥可输，提示「导出端先启用加密再导出或本机关闭加密」。

测试：agent.test.mjs 扩四工具执行器用例（mock hub：打码/截断/落库调用/tag_items 三类型）；filehub/ftext.test 补 healthPlan 全分支与迁移判定纯函数；e2e-zip.mjs 加异密钥场景（Node 构造另一把钥加密的 zip → 断言弹钥 → 填钥 → mock store 断言重加密落桶）；全套 20 套不得回归，node --check 全过。

管线（DEVELOPGUIDE §4）：测试 → 版本 4 处升 4.7.0（versionCode 40700；tauri.properties 有 versionCode/versionName 两行；PS 写文件 .NET WriteAllText 无 BOM 绝对路径）+ sw.js CACHE_NAME +1 → commit（中文信息、无英文双引号、点名 git add 勿 -u）→ build-android.ps1 → -Preset → build-desktop.ps1 共 6 产物（串行；gradle daemon 被内存压力杀掉就重跑）→ 验收：aapt2 versionName=4.7.0 + apksigner cc06eb3e + 解包 grep（search_notes/search_files/healthPlan/密钥迁移关键词在 assets）→ 使用说明 AI 助理节与文件仓节更新 + 文件仓页截图重拍（新按钮）→ tag v4.7.0 + push（代理 http://127.0.0.1:7890；代理没起先探测，失败走 git -c http.https://github.com.proxy= -c http.proxy= 直连）。不发 Release，完成后报告等我测试。

真机验收清单（报告里列出请用户测）：AI 问「体检报告放哪了」→ 出文件卡片（含正文命中片段）；AI 问「上周记的快递单号」→ 出便签卡片；让 AI 记一条便签并打标签；tag_items 跨类型打「工作」后三页侧栏计数变化；文件仓「体检」出报告（可先删库文件造孤儿桶验证清理）；异密钥导出的 zip 在另一台导入 → 弹密钥框 → 输钥 → 文件可打开预览；关「允许 AI 检索文件正文」后 AI 只搜到文件名命中；密码/便签既有 AI 功能无回归。

关键坑提醒（DEVELOPGUIDE §8 有完整版）：自建弹窗层 z-index 一律 660（promptKeyInput 已修过一次，别再犯）；静态桥 lastResult 启动 Activity 前必须置 pending；Android 选文件走 pickRaw 桥（tauri dialog 返回 content:// 不可用）；headless Edge 测试须 Network.setCacheDisabled + 清 SW + 僵尸端口守卫（双特征精准杀，勿按映像名杀 Edge）；导入解析取全字段（totp/fav 教训）；ps1 恰好单 BOM；heredoc 写 JS 文件注意 \n 转义会被吃（用 chr(10) 或写临时文件）。

---

（本提示词随版本推进由 ROADMAP/HANDOFF 更新者维护。）
