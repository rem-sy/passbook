# 🗝️ 密码本 (passbook)

本地密码管理工具：**强密码生成 → 随手保存 → 快速筛选查询**，支持多端同步（桌面安装版 / 浏览器 / 手机 PWA，各端独立保存，通过 `.db` 文件在网盘/Syncthing 中同步）。

三种使用形态，同一套界面与数据格式：

| 形态 | 存储 | 适用 |
| --- | --- | --- |
| **桌面安装版**（Tauri） | 本机 SQLite 文件（位置可自选，可指向网盘文件夹） | 日常主力，双击即用 |
| **浏览器版**（Node 服务器） | 服务端 SQLite 文件 | 需要局域网共享或不想装 App |
| **手机 PWA** | 手机浏览器本地存储 | 手机端随时查/存 |

---

## ✨ 功能

| 功能 | 说明 |
| --- | --- |
| 强密码生成 | 指定长度（4-128）；字符类型自由组合（大写/小写/数字/特殊符号）；自定义符号集 |
| **安全体检** | 一键检查：重复密码、弱密码（词典+复杂度）、信息不完整、长期未更新；可选联网核查泄露密码（HIBP k-匿名，仅上传 SHA-1 前 5 位，密码本体不出本机），按高/中/低/提示分级，点击直达条目 |
| **TOTP 动态验证码** | 条目可存 2FA 密钥（base32 或直接粘贴 otpauth:// 链接自动提取）；列表卡片实时显示 6 位验证码 + 倒计时秒数，一键复制；算法 RFC 6238，兼容各类验证器 |
| **自动锁定 + 剪贴板清除** | 无操作 1/5 分钟或切后台自动回到 PIN 锁屏（配合启动锁）；复制密码/验证码后 15/30 秒自动清空剪贴板，防止残留泄露 |
| **密码历史** | 修改密码时自动归档旧密码（最多 20 条，含变更时间）；条目卡片「历史」按钮查看，支持显示/复制；JSON 备份与导入完整保留历史 |
| **深色主题** | 跟随系统 / 浅色 / 深色三档（设置 → 外观）；auto 模式下系统切换实时换肤，首帧无闪烁；原生控件（滚动条/下拉）联动 |
| 自定义密码要求 | 每类至少一个、排除易混淆字符（0O1lI 等）、**键盘布局不连续**、禁止连续相同字符、禁止顺序/倒序字符对、额外排除指定字符 |
| 表单录入 | 工具栏「＋ 手动录入」：宽体专属表单（必填项整行大输入框）填写 所属/账户/密码（内嵌生成器）/分类/网址/**备注（记忆关键词）**，支持「保存并继续录入」连续录入 |
| AI 助手对话 | 侧边栏 🤖 对话：自然语言存/查/列/**改**密码、生成强密码（function calling 五工具；查询结果密码打码，真实值只在应用卡片展示/复制；流式输出可随时停止；渠道在设置里配置，OpenAI 兼容接口均可） |
| 随手保存 | 生成后一键存入，命名格式建议 **（所属，账户）**，如 `微信, 13800138000`；支持分类/网址/备注 |
| 快速筛选 | 顶部搜索框即时过滤（所属/账户/网址/备注），分类标签点击筛选，支持排序 |
| 人工导入 | 粘贴文本（`所属,账户,密码`）、CSV / JSON / `.db`（SQLite 文件），可合并（自动跳过重复）或覆盖 |
| 导出备份 | 导出 `.db` 数据库文件、JSON 备份（桌面版走系统保存对话框） |
| 多端同步 | 各端独立保存，通过 `.db` 文件在网盘/Syncthing 中同步合并 |
| 数据库加密 | 可选 AES-256-GCM + PBKDF2 文件级加密：密钥由应用自动生成并仅保存在本机，启动自动解密、使用无感；加密后 `.db` 文件与导出备份均为密文，防文件被拷走后明文泄露；**密钥务必备份（设置 → 数据库加密 → 备份密钥），丢失无法恢复** |
| 启动锁 | 可选 PIN 锁（仅界面拦截，与加密密钥相互独立） |

---

## 🖥 桌面安装版（推荐分发形态）

给别人的是 **NSIS 安装包**（`D:\hobby\产物\密码本\` 下的 `Passbook_<版本>_x64-setup.exe`，另有 `-clean` 纯净版变体与免安装便携版 `Passbook_<版本>_portable.exe`）：接收方下载 → 双击安装（免管理员，装到当前用户）→ 开始菜单/桌面启动「密码本」。

> 注意：正式分发用安装包会装入接收方自己的用户目录（对方机器）；**本机自用请用「便携版 + 启动器 bat」**，数据全部留在 `产物\密码本\app-data`，不写 C 盘。

构建（一次出两个发行版）：

```bash
cd D:\hobby\源码\密码本
powershell -ExecutionPolicy Bypass -File scripts\build-desktop.ps1
# 产物 -> D:\hobby\产物\密码本\：
#   Passbook_1.1.0_x64-setup.exe（预置渠道）      + Passbook_1.1.0_portable.exe
#   Passbook_1.1.0_x64-setup-clean.exe（纯净版）  + Passbook_1.1.0_portable-clean.exe
```

> 目录规范：源码在 `D:\hobby\源码\密码本`，对外交付物统一放 `D:\hobby\产物\密码本`。

---

## 🌐 浏览器版（Node 服务器）

```bash
cd 密码本
npm start            # http://127.0.0.1:3947，数据库在 data/passwords.db
```

常用参数：

```bash
node server.mjs --lan          # 监听局域网，手机可访问 http://<电脑IP>:3947
node server.mjs --port 8080    # 自定义端口
DATA_DIR=D:\网盘同步文件夹 node server.mjs   # 数据库直接放进同步文件夹
node server.mjs --no-open      # 不自动打开浏览器
```

---

## 📱 手机端

两种形态按需选用：

### Android 安装包（推荐）

交付物在 `D:\hobby\产物\密码本\`：`Passbook-Android-<版本>-arm64.apk`（预置渠道）与 `Passbook-Android-<版本>-arm64-clean.apk`（需自行配置渠道）。手机上直接安装（需允许「安装未知来源应用」），数据存在应用私有目录，无需网络服务器。

- 架构 `arm64-v8a`（覆盖近几年的主流安卓机）；
- 前端与桌面版同一套（`public/` 打进 APK assets），数据库为应用私有 SQLite 文件；
- AI 助手网络请求走应用内 Rust 代理（`agent_http` 命令），不受 WebView CORS 限制；
- 已用发布证书签名（`产物\密码本\signing\passbook-release.jks`），升级安装请保持同一签名。

构建（本机无符号链接权限的旁路方案，脚本做了全自动）：

```bash
powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1          # 预置渠道版
powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 -Clean  # 纯净版
# 前置：D:\hobby\.android-dev\ 下有 jdk / sdk(ndk 27) / cmdline-tools
# 流程：cargo 交叉编译 → 复制 .so 与前端到 gen/android → gradle 打包签名
```

### 手机 PWA

1. 电脑上以 `--lan` 启动：`npm run start:lan`。
2. 手机与电脑连**同一 WiFi**，浏览器打开局域网地址（如 `http://192.168.1.5:3947`）。
3. 点浏览器菜单「**添加到主屏幕**」安装为 App（PWA），之后**离线也能用**。
4. 手机端自动使用**本机存储**（浏览器内 SQLite + IndexedDB），与桌面数据互不干扰——符合"各端一份"的同步模型。

> 在设置里可手动切换存储模式：`自动检测 / 服务器存储 / 本机存储`（桌面安装版固定为本机数据库文件，不可切换）。

---

## 🤖 AI 助手（聊天存/查密码）

顶栏 🤖 打开侧边对话面板，直接说人话即可：

- 「帮我存：网银，张三，密码 XyZ!6789，工资卡」→ 落库（备注=工资卡）
- 「宽带密码是多少」/「我 Github 的账号」→ 查询返回（密码在应用卡片展示，AI 只见打码值）
- 「把 GitHub 的密码改成 Xk9#New2025」→ 修改已存密码（多条匹配时会先向你确认账户）
- 「最近存的几条密码」→ 列出最近记录
- 「生成一个 16 位强密码」→ 调用内置生成器

渠道配置（设置 ⚙ → AI 助手）：`接口地址`（OpenAI 兼容 `/chat/completions`）+ `模型名` + `API Key`，**启动后随时可改、立即生效**。默认渠道来自 `public/agent-config.js`，出两种发行版：

| 发行版 | AI 助理开箱即用 | 适合 |
| --- | --- | --- |
| 预置渠道版（默认文件名） | 是（内置自定义渠道） | 自己人用，拿来就能聊 |
| 纯净版（文件名带「-clean」） | 否，需在设置里手动配置渠道 | 对外分发，不暴露渠道密钥 |

核心逻辑在 `public/agent-core.js`（渠道无关，Node 可测），网络路由分三路：桌面/Android → Rust `agent_http_stream`（流式事件 + 可中止）；浏览器服务器模式 → `/api/agent/proxy-stream`；PWA → 直连。

🔒 隐私分级：**查询/列表**工具返回给模型的密码一律打码，真实密码由应用在对话内渲染卡片（可显示/一键复制），不经过 AI 渠道；**存/改**密码时你提供的明文会发送给所配置的模型渠道，请只配置可信渠道；不配置则面板提示未启用，不影响其他功能。

---

## 🔄 多端同步（各端一份 + 文件同步）

**同步介质是 `.db` 数据库文件**（SQLite，各端 schema 一致）。

| 方向 | 做法 |
| --- | --- |
| 桌面 → 网盘 | 设置里把「数据库文件位置」直接指到网盘同步文件夹（一劳永逸）；或「导出 .db」手动复制 |
| 手机 → 网盘 | 手机端「导出 → 下载 .db 数据库文件」，存入同步文件夹 |
| 网盘 → 桌面 | 「导入 → 选择文件…」选 `.db`，选**合并**（自动跳过重复） |
| 网盘 → 手机 | 手机端「导入 → .db 文件」，选合并 |

⚠️ 建议：合并时选「合并（跳过重复）」；「覆盖」会清空当前全部记录。同步前最好先在各端「导出」一次留底。

---

## 📥 导入格式

**粘贴文本**（每行一条，三种分隔都认）：

```
微信,13800138000,P@ssw0rd1
GitHub,user@example.com,Abc12345
网银/张三/XyZ!6789
支付宝	李四	Pay#2024
```

顺序：`所属, 账户, 密码[, 网址][, 备注]`。带表头（如 `所属,账户,密码`）会被自动跳过。

**CSV / JSON**：字段名支持中文或英文 —— `所属/owner`、`账户/account`、`密码/password`、`网址/url`、`分类/category`、`备注/note`。

**`.db` 文件**：直接读取 SQLite 中的 `entries` 表；若该文件已加密，导入时输入密钥文本解锁即可（密钥在源设备设置 → 数据库加密 → 备份密钥）。

---

## 🧪 测试

```bash
# 沙箱环境注意：node --test 会因子进程管道受限而失败，直接跑文件：
node --disable-warning=ExperimentalWarning test/api.test.mjs        # 服务端 API 14 项
node --disable-warning=ExperimentalWarning test/generator.test.mjs # 生成器 10 项
node --disable-warning=ExperimentalWarning test/agent.test.mjs     # AI 助手核心 16 项
node --disable-warning=ExperimentalWarning test/db-crypto.test.mjs # 数据库加密 6 项
node --disable-warning=ExperimentalWarning test/watchtower.test.mjs # 安全体检 13 项
node --disable-warning=ExperimentalWarning test/totp.test.mjs      # TOTP 10 项（含 RFC 6238 向量）
```

---

## 🗂 项目结构

```
密码本/
├── server.mjs            # 浏览器版服务端：静态托管 + REST API + SQLite (node:sqlite)
├── public/               # 三端共用的前端（零构建，Tauri 直接打包此目录）
│   ├── index.html        # 页面骨架
│   ├── app.js            # 前端逻辑（三适配器：服务器 REST / 浏览器 sql.js+IndexedDB / Tauri 文件桥）
│   ├── generator.js      # 密码生成器（UMD，浏览器与 Node 双端可用）
│   ├── style.css
│   ├── manifest.webmanifest / sw.js   # PWA
│   ├── lib/sql-wasm.js / .wasm        # sql.js：浏览器内运行 SQLite
│   └── icons/            # 图标（脚本生成，含 .ico）
├── src-tauri/            # 桌面壳（Tauri v2，桌面 + Android 共用）
│   ├── src/lib.rs        # 命令：数据库文件读写 / 位置选择 / 导入导出对话框 / agent_http(_stream) 代理（UTF-8 增量解码 + 可中止）；桌面窗口与单实例 cfg(desktop)
│   ├── tauri.conf.json   # frontendDist=../public，NSIS 打包，currentUser 安装
│   ├── gen/android/      # tauri android init 生成的 gradle 工程（签名配置 + 旁路补丁）
│   ├── capabilities/     # 权限清单
│   └── icons/            # 应用图标（含 icon.ico 多尺寸）
├── scripts/
│   ├── make-icons.mjs    # 生成 PNG + 多尺寸 ICO（纯 Node，零依赖）
│   ├── build-android.ps1 # Android APK 一键构建（无符号链接权限旁路方案）
│   └── download-sqljs.mjs# 重新下载 sql.js
├── data/                 # 浏览器版数据库目录（运行时创建）
└── test/                 # 测试
```

---

## ⚠️ 安全提示

- 1.1.0 起支持**数据库加密（自动密钥）**：设置 → 数据库加密，启用后 `.db` 文件与导出备份均为 AES-256 密文；密钥由应用自动生成并仅保存在本机，启动自动解密、使用无感。**密钥务必备份**（设置 → 数据库加密 → 备份密钥），丢失或换设备导入加密 .db 文件时都需要它。
- `--lan` 模式下局域网内任何设备都能访问该地址（无鉴权），仅在可信网络使用；用完可关闭。
- 启动锁 PIN 只是界面拦截，不加密数据，防君子不防小人；与数据库加密（自动密钥）相互独立，加密密钥不因 PIN 启用/停用而改变。

## 🛠 技术要点

- 生成器使用 `crypto.getRandomValues`（拒绝采样，无偏随机）。
- 键盘布局不连续基于 QWERTY 坐标表（含错位偏移）判断物理相邻键。
- 浏览器版服务端 SQLite 使用 WAL 模式；导出 `.db` 时先 `wal_checkpoint` 保证文件完整。
- 前端三存储适配器：`server` 走 REST API；`local` 走 sql.js + IndexedDB；Tauri 桌面版复用 `local` 的 SQL 逻辑，持久层换成 Rust 命令原子写（临时文件 + rename）真实 `.db` 文件。
- 桌面版 WebView2 数据收敛到应用数据目录 `webview2/` 子目录；`PASSBOOK_DATA_DIR` 环境变量可整体重定位数据根目录。
- Tauri 前端零构建：`frontendDist` 直接指向 `public/`，界面改动无需编译前端工程。
