# 密码本 Roadmap（v4.3+ 存储扩展时代）

> 维护约定：每完成一个版本更新此文件并归档旧版到 docs/archive/。
> 当前已发布：**v4.1.2**（tag 已推送，Release 停在 v4.1.0——4.1.1/4.1.2 为手机端修复小版本，未发 Release）。
> 立项调研：[RESEARCH-v5-storage.md](RESEARCH-v5-storage.md)（随手记/文件仓/三标签页全案）。

## 版本规范
- 功能 +0.1.0，补丁 +0.0.1；里程碑经用户确认 → GitHub Release
- 版本 4 处同步：package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml / gen/android/app/tauri.properties（versionCode = M×10000+m×100+p）
- sw.js CACHE_NAME 每版 +1；产物 ASCII 命名；-preset 预置版仅本地永不上传

## v4.3.0（下一版）：随手记 + 三标签页框架
**目标：从「密码管理器」长成「个人保险箱」的第一步。**
- 数据层：`notes` 表（title/content/tags/source/created_at/updated_at，source ∈ manual|clipboard|share），进 SQLite 迁移链，随 .db 整库加密
- UI：顶栏下页面级三标签 `密码 | 随手记 | 文件仓`（state.view + localStorage 记忆）；密码页现有交互零改动；文件仓 tab 占位（v4.4 解锁）
- 便签页：列表 + 新建/编辑（标题、正文、标签、来源徽标）+ 删除；搜索框在便签页检索便签（复用 PassSearch 多词管线）
- **手机快捷方式（对标微信扫一扫）**：
  - 静态 App Shortcuts（res/xml/shortcuts.xml + manifest meta-data），长按图标直达
  - `QuickNoteActivity`（透明、noHistory）：onResume 读剪贴板（Android 10+ 仅焦点应用可读，此为合规通道）→ 原生确认框预览 → 确认写入 pending 队列文件（JSON 追加，纯原生零依赖秒开）→ Toast → finish
  - 应用启动时前端消费 pending 队列入 notes 表（source=clipboard），Toast 提示补了 N 条
- 文本分享接收：`ACTION_SEND text/plain` → ShareTextActivity → 同一 pending 队列（source=share）
- 桌面对齐：Tauri global-shortcut 全局快捷键 + clipboard-manager 读剪贴板 → 直接入 notes 表（桌面无队列必要）
- 测试：test/notes.test.mjs（纯函数：队列消费去重、便签检索命中、迁移幂等）

## v4.4.0（已规划）：文件仓
**目标：微信/QQ/任意来源的文档统一收纳 + 统一检索。**
- 数据层：`files` 表（name/mime/size/sha256/source/tags/note/created_at）；文件本体按 sha256 分桶存应用私有目录，AES-GCM 加密落盘（密钥从数据库密钥派生）；**不进 SQLite**
- 收文件三通道：
  1. 分享接收（主通道）：微信/QQ 文件长按 → 分享 → 密码本（ACTION_SEND */*），ShareFileActivity 流式拷贝 content:// URI（Android 11+ scoped storage 下唯一官方授权通道）→ 确认入库
  2. SAF 批量导入：ACTION_OPEN_DOCUMENT 多选
  3. 桌面：拖拽 + 系统对话框（pick_files 泛化）
- UI：文件仓页列表 + 类型/来源/标签/时间过滤 + 预览（图片/PDF 经解密 blob 在 WebView 预览；其他 FileProvider + ACTION_VIEW 系统打开）+ sha256 去重提示
- 统一检索：顶栏搜索跨 密码/便签/文件 分组返回
- 加密一致性：换密钥/关加密向导同步重加密文件本体
- 测试：test/filehub.test.mjs（元数据纯函数、去重键、检索命中、桶路径）

## v5.0.0（已规划）：统一入口收尾
- 三 tab 视觉统一打磨；便签贴图/富文本支持；文件文本抽取 FTS 全文检索评估（PDF/DOCX 依赖较重，先出评估再决定）；桌面托盘快捷入口
- Release 里程碑候选（发版前用户确认）

## 远期（方向已评估，未排期）
- Passkey 阶段 1（原 v4.2 规划顺延）：credentialId/rpId/userHandle/私钥结构化存储 + Bitwarden JSON 导入，只存不用
- Passkey 阶段 2/3：Android Credential Manager / WebView2 WebAuthn 桥 / 桌面浏览器扩展配对（架构级）
- KDF 参数可调 + 存量库重新加密向导
- 体检条目卡片「已泄露 N 次」徽标；Android「复制并打开目标 App」快填

## 明确不做
- 多用户/组织共享（单人自用定位）
- 云托管同步（本地优先；自建远程模式已覆盖）
- 后台常驻监听剪贴板（Android 10+ 不允许且违背「需要确认」的产品原则）
- 直接读取微信/QQ 私有目录（scoped storage 禁止；只走分享/SAF 官方通道）

## 竞品对标（2026 调研存量结论）
对标 Keyguard、KeePassXC（持续加导入器）、KeePassDX。本项目差异点转为**个人数据统一保险箱**（密码+便签+文件一体加密收纳），头部密码管理器均未覆盖此组合。
