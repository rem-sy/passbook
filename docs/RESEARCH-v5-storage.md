# 调研：密码本存储扩展（随手记 + 文件仓 + 三标签页）

> 2026-09 v4.1.2 之后立项调研。结论供 v4.3.0 / v4.4.0 / v5 规划使用。
> 结论先行：**全部可行**，且大部分基础设施（透明 Activity、SAF 桥、SQLite+加密管线、幂等构建补丁）项目中已有成熟先例。

## 一、需求拆解

1. **文件仓**：微信/QQ/其他来源发到手机的文档，统一收纳 + 统一检索
2. **随手记**：任意地方看到的长文本，快速存成便签；手机要「微信扫一扫」式的桌面/长按图标快捷方式，点击 → 剪贴板内容入库（需确认），后续进应用补充详情与管理
3. **UI 重构**：页面分三个标签页——密码 / 随手记 / 文件仓

## 二、随手记：手机快捷方式 + 剪贴板

### 2.1 快捷方式形态（对标微信扫一扫）

微信「扫一扫」快捷 = Android **静态 App Shortcuts**：长按应用图标弹出，点击直达功能。
实现：`res/xml/shortcuts.xml` 声明 shortcut（icon + label + intent 指向专用 Activity），主 Activity 的 manifest 里挂
`<meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />`。
参考：[App shortcuts overview（Android 官方）](https://developer.android.com/develop/ui/compose/system/shortcuts)、[Static App Shortcuts 实操指南](https://medium.com/@sandeepkella23/static-app-shortcuts-in-android-an-end-to-end-guide-f00e97855fd6)。

### 2.2 剪贴板读取（关键限制）

**Android 10+ 禁止后台应用读剪贴板**，只有「获得焦点（resumed）的 Activity 所属应用」能读——这正是需求里「点击后直接把剪贴板内容存下来（需要确认）」的合规做法：

- 快捷方式 → 启动 `QuickNoteActivity`（透明主题、无历史栈）
- `onResume`（已获焦点）读 `ClipboardManager` → 弹原生小确认框（预览前 ~80 字 + 确认/取消，满足"需要确认"）
- 确认 → 落库（source=clipboard）→ Toast → `finish()`
- 官方安全剪贴板指引：[Secure Clipboard Handling](https://developer.android.com/privacy-and-security/risks/secure-clipboard-handling)

不采用的备选：在 WebView 里 `navigator.clipboard.readText()`——WebView 内权限弹窗链路不稳，且冷启动慢；原生 Activity 是正路。

### 2.3 工程落地方式（已有成熟模式）

- 新增 `QuickNoteActivity.kt`（透明 + 确认 UI + 写库走 Rust 命令或直接写临时 json 由前端消费）
- **AndroidManifest.xml 在仓库内是稳定提交物**（BioBridgeActivity/SafSaveActivity 已如此），新 Activity + shortcuts.xml 声明直接改 manifest，不受 build.rs 重生成影响
- 桌面版对齐：Tauri `global-shortcut` 插件注册全局快捷键 + 托盘菜单「随手记」，Rust 端用 clipboard 插件读剪贴板 → 存库
- 顺带做**文本分享接收**：微信/QQ 里长按文字 → 分享 → 密码本（`ACTION_SEND text/plain`），体验比切出去复制更顺，与快捷方式共用入库管线（source=share）

## 三、文件仓：微信/QQ 文档的获取与统一检索

### 3.1 文件从哪来（三条通道）

| 通道 | 说明 | 可行性 |
|---|---|---|
| **分享接收**（主通道） | 微信/QQ 文件长按 → 分享 → 密码本。`ACTION_SEND`（`*/*` + 常见 mime）→ 透明 `ShareReceiveActivity` 拿 `content://` URI → `ContentResolver` 流式拷贝进应用私有目录 → 确认入库 | ✅ Android 11+ scoped storage 下**唯一官方授权通道**：微信文件在 `Android/data/com.tencent.mm` 下第三方不可直接读（[Android 11 storage 变更](https://developer.android.com/about/versions/11/privacy/storage)、[微信文件存储位置（知乎）](https://www.zhihu.com/en/answer/2833679872)），但分享出的 URI 自带临时授权 |
| **SAF 选择导入** | 应用内「导入文件」→ `ACTION_OPEN_DOCUMENT` 多选 → 拷贝 | ✅ 项目已有 SAF 桥经验（SafSaveActivity），照搬反向即可 |
| **桌面端** | 拖拽到窗口 / 系统对话框多选（泛化现有 `pick_import_db` 为 `pick_files`） | ✅ Rust 侧小改 |

### 3.2 存储模型

- 文件本体：应用私有目录（Android `filesDir` / 桌面 app data）下按内容寻址（sha256 前两位分桶）存放，天然去重；**不进 SQLite**（现有附件 BLOB ≤2MB 的教训——大文件进库拖垮内存与 IPC）
- 元数据入 `files` 表：`(id, name, mime, size, sha256, source, tags, note, created_at)`，source 记录来自微信/QQ/SAF/拖拽
- 加密：沿用数据库加密的密钥派生（DbCrypto），文件本体 AES-GCM 加密落盘，与 .db 同级安全；便签/文件元数据随 .db 整库加密（同一文件）

### 3.3 统一检索

- 顶栏搜索升级：跨**密码 / 便签 / 文件**分组返回（复用 PassSearch 多词模糊管线，文件按 名称+备注+标签+来源 命中）
- 文件仓内：按类型（pdf/doc/压缩包/图片）、来源、标签、时间过滤
- **明确推迟**：PDF/DOCX 文本抽取入 FTS 全文索引（体积大、依赖重）——先不做，文件名+备注+标签检索已覆盖个人场景，列入远期观察项

### 3.4 预览与打开

- 图片/PDF：Android WebView 可直接预览（加密文件解密到内存后 blob URL）
- 其他类型：`FileProvider` + `ACTION_VIEW` 交给系统应用打开（需 manifest 添加 provider + paths.xml）
- 桌面端：解密到临时目录后 `shell open`

## 四、三标签页 UI

- 顶栏下方页面级 tab：`密码 | 随手记 | 文件仓`，`state.view` + localStorage 记忆上次停留页
- 三个视图共享：顶栏搜索（随 tab 切换检索目标）、设置/锁定/自动锁（autolock 覆盖全部数据）、数据库与加密管线
- 便签页：瀑布/列表 + 新建/编辑（标题、正文、标签、来源徽标）；文件仓页：列表 + 导入/筛选/预览/删除
- 密码页现有交互（多选、漏斗、体检、扫码）不动——只做外层包裹，风险隔离

## 五、数据层与版本切分

### 表结构（随 v4.3 起进入 SQLite 迁移链，CREATE IF NOT EXISTS）

```sql
notes(id INTEGER PK, title TEXT, content TEXT, tags TEXT, source TEXT, created_at, updated_at)
files(id INTEGER PK, name TEXT, mime TEXT, size INTEGER, sha256 TEXT, source TEXT, tags TEXT, note TEXT, created_at)
```

### 建议版本切分（每版独立可交付、可测试）

- **v4.3.0「随手记」**：notes 表 + 便签页 + 三标签页框架（文件仓 tab 占位）+ 文本分享接收 + 手机静态快捷方式（QuickNoteActivity 剪贴板确认入库）+ 桌面全局快捷键。新测试 test/notes.test.mjs
- **v4.4.0「文件仓」**：files 表 + 文件页 + SAF 批量导入 + 分享文件接收（微信/QQ）+ sha256 去重 + FileProvider 打开 + 统一搜索分组。新测试 test/filehub.test.mjs（元数据/去重/检索纯函数）
- **v5.0.0「统一收尾」**：三 tab 视觉打磨、便签贴图/富文本、文件文本抽取 FTS 评估、桌面托盘快捷。Release 里程碑候选

## 六、风险清单

1. **快捷方式冷启动延迟**：QuickNoteActivity 必须不加载 WebView/Rust，纯原生写库（走 contentProvider 或直接 sqlcipher？——不行，库是 sql.js 前端管的）。**对策**：快捷入库先写 pending 队列文件（JSON 追加），应用下次启动时前端消费入 notes 表——零依赖、秒开
2. **分享大文件内存**：stream 拷贝（8KB buffer），禁止 readBytes 全量进内存
3. **加密一致性**：文件仓加密密钥 = 数据库密钥派生；换密钥/关加密时要同步重加密文件本体（v4.4 需写迁移向导）
4. **Android manifest / Activity 数量增加**：沿用 build-android.ps1 幂等锚点补丁模式，Kotlin 文件与 manifest 均为仓库提交物，构建重生成不受影响
5. **桌面/手机能力差异**：快捷方式仅手机；桌面用全局快捷键对齐，不硬做托盘小组件
