# 密码本 (passbook)

本地优先的个人数据保险箱：**密码 + 随手记 + 文件仓**一体加密收纳，内置 AI 助理。数据全部留在本机（SQLite 整库加密），通过 `.db` 文件在网盘 / Syncthing 中多端同步。

| 形态 | 存储 | 适用 |
| --- | --- | --- |
| **桌面版**（Windows，Tauri） | 本机 SQLite 文件（位置可自选，可指向网盘文件夹） | 日常主力，双击即用，可常驻托盘 |
| **手机版**（Android APK） | 应用私有 SQLite 文件 | 手机端随时查 / 存 |

两种形态同一套界面与数据格式；另有附带的浏览器模式见文末说明。

---

## 功能总览

| 功能 | 说明 |
| --- | --- |
| 密码管理 | 表单录入、随手保存、分类标签、快速筛选排序、密码历史（自动归档旧密码） |
| 强密码生成 | 长度 4-128；字符类型自由组合；自定义符号集；每类至少一个、排除易混淆字符、键盘布局不连续、禁止连续相同 / 顺序字符 |
| TOTP 动态验证码 | 条目可存 2FA 密钥（base32 或 otpauth:// 链接自动提取）；列表卡片实时显示验证码 + 倒计时，一键复制；RFC 6238 |
| 安全体检 | 重复 / 弱 / 信息不完整 / 长期未更新密码一键检查；可选联网核查泄露（HIBP k-匿名，密码本体不出本机）；按高 / 中 / 低分级 |
| 随手记（便签） | 快捷键读剪贴板一键记、分享接入、多词检索、跨类型标签 |
| 文件仓 | 任意文件加密收纳（sha256 分桶密文，不进数据库）；PDF / docx / xlsx / 图片应用内预览；正文内容检索；体检（孤儿桶清理、索引重建）；zip 加密导出导入 |
| 跨类型分类 | 密码 / 便签 / 文件三页共用一套分类体系，侧栏并集计数 |
| AI 助理 | 自然语言存 / 查 / 改密码、记便签、搜文件（function calling 18 工具）；查询结果密码打码，真实值只在应用卡片展示复制；流式输出可随时停止 |
| **托盘 + 快捷面板**（v4.10.0） | 应用常驻系统托盘；任意界面按 **Alt+P** 唤出快捷面板：搜密码一键复制（含 TOTP 实时码）、生成强密码、粘贴文本快速导入；无边框小窗失焦自隐，PIN 锁与主界面联动 |
| 自动锁定 | 无操作 1 / 5 分钟或切后台自动回 PIN 锁屏；复制密码 / 验证码后 15 / 30 秒自动清空剪贴板 |
| 数据库加密 | AES-256-GCM + PBKDF2 整库加密，密钥自动生成仅存本机，启动无感解密；导出备份均为密文；密钥可备份文本 |
| 自动更新 | 桌面启动静默检查 + 应用内更新（GitHub Release，签名校验）；手机应用内下载 APK 升级 |
| 导入导出 | 粘贴文本 / CSV / JSON / `.db`（SQLite）导入，可合并（跳过重复）或覆盖；导出 `.db` 与 JSON 备份；文件仓 zip 迁移（异密钥自动重加密） |
| 多端同步 | 各端独立保存，通过 `.db` 文件在网盘 / Syncthing 中同步合并 |
| 启动锁 | 可选 PIN 锁（界面拦截，与加密密钥相互独立）；支持 Windows Hello / 手机生物识别解锁 |

---

## 桌面版

给别人的是 **NSIS 安装包**（`D:\hobby\产物\密码本\` 下的 `Passbook_<版本>_x64-setup.exe`）：下载 → 双击安装（免管理员）→ 开始菜单启动。

**本机自用请用便携版**：`Passbook_<版本>_portable.exe` + 启动器 bat，数据全部留在 `产物\密码本\app-data`，不写 C 盘。

构建：

```powershell
cd D:\hobby\源码\密码本
powershell -ExecutionPolicy Bypass -File scripts\build-desktop.ps1
# 产物 -> D:\hobby\产物\密码本\：Passbook_<版本>_x64-setup.exe + portable.exe + latest.json（更新通道）
# v4.10.0 起默认只出正式版；确需预置渠道版加 -Preset
```

> 目录规范：源码在 `D:\hobby\源码\密码本`，对外交付物统一放 `D:\hobby\产物\密码本`。

### 托盘与快捷面板（v4.10.0）

- 关闭主窗默认**最小化到托盘**（设置里可改为直接退出）；托盘左键打开主界面，右键菜单：打开 / 快捷面板 / 记一条 / 锁定 / 退出
- 全局快捷键 **Alt+P**（默认，设置里可改）唤出快捷面板小窗：
  - **搜索**：即时过滤，一键复制密码 / 账号 / TOTP 实时验证码
  - **生成**：复用主界面生成器偏好，生成 → 复制 → 可直接存入
  - **导入**：粘贴「所属, 账户, 密码」文本，合并导入
- 失焦或 Esc 自动隐藏；启用 PIN 时托盘锁定期间唤出需先解锁（与主界面同一把锁）
- 快捷键配置为**录入模式**：设置里点按钮后直接按组合键（Esc 取消），无需手敲文本

## 手机版（Android）

交付物：`D:\hobby\产物\密码本\Passbook-Android-<版本>-arm64.apk`，直接安装（需允许未知来源），数据存应用私有目录。前端与桌面版同一套，AI 网络请求走应用内 Rust 代理。

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1
# 前置：D:\hobby\.android-dev\ 下有 jdk / sdk(ndk 27) / cmdline-tools
```

升级安装请保持同一签名（`产物\密码本\signing\passbook-release.jks`）。

---

## AI 助理

顶栏对话面板，直接说人话：存 / 查 / 改密码、记便签、搜文件仓、生成强密码。渠道在设置里配置（OpenAI 兼容接口均可），**启动后随时可改、立即生效**。

- **获取模型列表**：设置页按当前地址 + Key 拉取 `/models`，点模型名下拉选择（v4.10.0）
- **检测渠道可用性**：发一条最小探活消息，报往返延迟；失败按 401（鉴权）/ 404（地址或模型名）/ 429（限流）分级给原因（v4.10.0）
- 隐私分级：查询 / 列表工具返回给模型的密码一律打码，真实密码由应用在对话内渲染卡片；存 / 改密码时明文会发送给所配置的渠道，请只配置可信渠道

---

## 多端同步

**同步介质是 `.db` 数据库文件**（各端 schema 一致）：

| 方向 | 做法 |
| --- | --- |
| 桌面 → 网盘 | 设置里把「数据库文件位置」指到网盘同步文件夹；或「导出 .db」手动复制 |
| 手机 → 网盘 | 手机端「导出 → 下载 .db 数据库文件」 |
| 网盘 → 各端 | 「导入 → 选择 `.db` → 合并（跳过重复）」 |

文件仓本体不随 `.db` 同步，单独用「文件仓导出 zip（加密本体 + 清单）」迁移；异密钥环境的 zip 导入会自动重加密迁移。建议合并前先各端导出留底。

---

## 导入格式

**粘贴文本**（每行一条，逗号 / 中文逗号 / 斜杠 / Tab / 空格分隔都认）：

```
微信,13800138000,P@ssw0rd1
GitHub,user@example.com,Abc12345,https://github.com,主账号
```

顺序：`所属, 账户, 密码[, 网址][, 备注]`，带表头自动跳过。

**CSV / JSON**：字段名支持中文或英文——`所属/owner`、`账户/account`、`密码/password`、`网址/url`、`分类/category`、`备注/note`。浏览器（Chrome/Edge/Firefox）导出的 CSV 可一键导入并自动去重。

**`.db` 文件**：直接读取 `entries` 表；若文件已加密，导入时输入密钥文本解锁。

---

## 测试

```bash
# 沙箱环境注意：node --test 会因子进程管道受限而失败，直接跑文件：
node --disable-warning=ExperimentalWarning test/api.test.mjs        # 服务端 API
node --disable-warning=ExperimentalWarning test/generator.test.mjs  # 生成器
node --disable-warning=ExperimentalWarning test/agent.test.mjs      # AI 助手核心
node --disable-warning=ExperimentalWarning test/quick.test.mjs      # 快捷面板 + 快捷键录入（v4.10.0）
node --disable-warning=ExperimentalWarning test/agent-check.test.mjs # AI 渠道检测（v4.10.0）
# 其余套件见 test/ 目录（当前 23 套 + channel-live 外部探测 + e2e-import/e2e-zip/e2e-updater）
```

---

## 项目结构

```
密码本/
├── public/               # 三端共用前端（零构建，Tauri 直接打包）
│   ├── app.js            # 主逻辑（存储适配器 / 三页渲染 / 弹窗 / 导入导出 / AI 面板）
│   ├── quick.html/.js    # 快捷面板小窗（v4.10.0，与主窗经事件通信）
│   ├── quick-core.js     # 快捷面板纯逻辑（可测）
│   ├── shortcut-input.js # 快捷键录入组件（可测）
│   ├── agent-core.js     # AI 工具定义 + 对话循环 + 打码双通道
│   ├── agent-check.js    # AI 渠道检测纯逻辑（可测）
│   ├── filehub.js        # 文件仓：分桶 / zip / 体检 / 正文索引
│   ├── generator.js / passphrase.js / totp.js / watchtower.js / search.js / notes.js / …
│   └── lib/              # 本地打包第三方库（sql.js / jsQR / pdfjs / jszip / xlsx…）
├── src-tauri/            # 应用壳（Tauri v2，桌面 + Android 共用）
│   ├── src/lib.rs        # Rust 命令：数据库文件读写 / 文件仓分桶 / 托盘 / 快捷面板窗口 / agent_http 代理 / 更新
│   ├── tauri.conf.json   # NSIS 打包，currentUser 安装
│   └── gen/android/      # gradle 工程（签名 + 旁路补丁）
├── scripts/              # 构建与发布（build-desktop / build-android / publish-release / e2e）
├── docs/                 # ROADMAP / DEVELOPGUIDE / HANDOFF
└── test/                 # 测试套件
```

---

## 安全提示

- 数据库默认整库加密（自动密钥）；**密钥务必备份**（设置 → 数据库加密 → 备份密钥），丢失无法恢复。
- 启动锁 PIN 只是界面拦截，不加密数据；与数据库加密相互独立。
- 局域网共享（附带的浏览器模式 `--lan`）无鉴权，仅在可信网络使用。

## 技术要点

- 前端零构建单页（IIFE + UMD 模块），`frontendDist` 直接指向 `public/`；核心逻辑抽为可测纯模块（Node 单测覆盖）。
- 三存储适配器：Tauri 桌面 / Android 走 sql.js 内存库 + Rust 命令原子写盘（临时文件 + rename）；服务器模式走 REST。
- 文件本体不进 SQLite：sha256 分桶 + 引用计数，整库备份保持小文件。
- 托盘与全局快捷键在 Rust 层（tauri tray-icon / global-shortcut）；快捷面板小窗与主窗经 Tauri 事件通信，数据库单点持有避免双写。
- Android 原生能力（SAF 选文件 / 生物识别 / 分享接入）走 Activity + JS 桥，构建脚本对生成代码做幂等补丁。

---

## 附：浏览器模式（可选，非主要形态）

仓库内含 Node 服务器模式，供局域网临时访问或无安装环境使用：

```bash
npm start                                  # http://127.0.0.1:3947
node server.mjs --lan                      # 局域网（无鉴权，仅可信网络）
node server.mjs --port 8080                # 自定义端口
DATA_DIR=D:\网盘同步文件夹 node server.mjs  # 数据库直接放进同步文件夹
```

仅密码条目走服务端存储；便签 / 文件仓 / 托盘 / 快捷面板等能力需桌面或手机应用。手机浏览器打开局域网地址可「添加到主屏幕」作为 PWA 使用（本机存储，与桌面数据互不干扰）。
