# 密码本 v4.7.0 P0 三项调研（RESEARCH-v4.7-p0）

> 结论已定稿进 [ROADMAP.md](ROADMAP.md)，本文是设计细节与取舍依据。历史调研见 archive/。

## 一、AI 助手跨类型化

**现状**：agent-core.js = TOOLS（OpenAI function calling schema）+ createExecutor(store, passGen, onChange, onDisplay) + 对话循环；密码打码双通道已建立（模型只见 🔒已打码，明文走 onDisplay 应用内卡片）。

**扩展设计**：
- createExecutor 增第五参 `hub = { searchNotes, searchFiles, createNote, tagItems }`（app.js 组装，agent-core 保持零依赖可测）
- 工具与返回形态（隐私红线：**只回摘要不回全文**）：
  - `search_notes(keyword)` → [{id,title,preview(≤80字,PassNotes.previewText),tags,source,updated_at}]，命中数；全文由前端 onDisplay 弹便签详情卡
  - `search_files(keyword)` → [{id,name,size_fmt,tags,source,created_at,snippet(snippetOf 36 半径)}]，matched_meta/matched_content 两计数；**ftext 检索受设置开关控制**（agentFileContent，默认开；关闭时仅元数据命中并在结果里注明）
  - `create_note(content,tags?,title?)` → LocalStore.noteCreate(source='manual')，返回 {ok,id,title}
  - `tag_items(tag, targets)`：targets 数组元素 {type:'passwords'|'notes'|'files', id?|query?}——id 定位或 query 关键词定位（复用各自检索），逐项打标（entries: category 追加 catJoin；notes/files: tags 追加 tagsJoin），返回逐项结果
- SYSTEM_PROMPT 改写要点：定位「个人数据保险箱助理」；新增规则（存便签→create_note 落库才算；查文件/便签先调工具；正文只给摘要让用户在卡片看全文；禁止编造便签/文件内容）
- 服务器模式：hub 侧判 currentMode!=='local' → 工具返回 {error:'随手记/文件仓仅本地模式支持'}，模型转述

**取舍**：不给 AI 删除/改密文件能力（误操作代价高）；不做 AI 直读加密本体（只搜已抽取的 ftext 明文索引）。

## 二、文件仓体检

**问题**：行与桶可能单向失配——行在桶丢（历史导入中断）→ 文件打不开；桶在行无（删除中断/异常）→ 空间泄漏。v4.6.5 仅在 zip 导入路径做了单向自愈，缺常驻入口。

**纯函数** `PassFiles.healthPlan(rows, blobShas)`：
```
rows: files 全行；blobShas: store_blob_list 结果
→ { missingBlob:[sha...]（行引用但桶无）,
    orphanBlob:[sha...]（桶有但无行引用）,
    needIndex:[id...]（ftext_ok=0）,
    suspectIndex:[id...]（ftext_ok=1 且应有文本的类型(pdf/docx/xlsx/md/text/pptx)但 ftext 空） }
```
UI：文件仓工具栏「体检」→ openModal 报告（四段计数+前 20 明细+对应文件名）→ 动作按钮：清理孤儿桶（store_blob_delete 逐个，报回收字节数）、重建索引（needIndex+suspectIndex 并入 queueFtext）、missingBlob 提示「从 zip 备份导入可自愈或删除该行」。
**不做**：自动删行（用户确认制）。

## 三、zip 导入密钥迁移

**问题**：zip 本体用导出端材料加密（DbCrypto 容器自带 files_salt）。两端材料不同（常见：各自启用过加密）→ 导入后本体解不开，且无 .db 导入那样的换钥入口。

**流程**（importFilehubZip 改造）：
1. 收集 zipShas = manifest.files 的 sha 列表；首个有本体的 sha 作验解样本
2. `vaultEnsureCrypto()` 本机密钥试解样本：成功 → 同体系，现状路径
3. 失败 → `promptKeyInput`（z660，文案「文件仓加密体系与导出端不同。请输入导出端备份数据库加密密钥」）→ `DbCrypto.deriveKey(输入, manifest.files_salt)` 试解
4. 成功 → **全量迁移**：for each blob：read zip 原文 → 旧钥解密 → `DbCrypto.encryptBytes(plain, 本机key, 本机salt)` → store_blob_write_b64；toast「已迁移 N 个文件到本机加密体系」
5. 失败（密钥不对）→ 报错「密钥不正确，或导出端未启用加密（此时请在本机关闭数据库加密后再导，或让导出端启用加密重导）」→ **中止，不写任何桶/行**（事务性：先验后写）
6. 纯元数据 zip（无 blobs）跳过验解；v4.6.5 判重跳过时的自愈补桶改走同一迁移函数

**边界**：导出端未加密（固定设备密钥）+ 本机未加密 → 同体系免输入；导出端未加密 + 本机加密 → 无钥可输，走第 5 步指引。

## 测试与验收（汇总）

- 单测：agent 四工具（mock hub）；healthPlan 全分支；zip 迁移纯逻辑（派生/试解判定做成可注入 keyFn 的纯函数便于 Node 测）
- e2e-zip：异密钥 zip → 断言弹钥 → 填钥 → mock store 断言重加密落桶
- 真机验收清单见 ROADMAP v4.7.0 节
