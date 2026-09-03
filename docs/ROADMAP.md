# 密码本改造路线图（v1.1.0 → 3.0.0）

> 借鉴 [Keyguard](https://github.com/AChep/keyguard-app) 的产品思路（注：其源码为 source-available 个人使用许可，**只借鉴思路与交互，不复制代码**）。
> 密码本差异化定位：**轻量本地优先 + AI 助理**。

## 版本号规范

| 变更 | 版本动作 | 示例 |
|---|---|---|
| 完成一个功能且测试通过 | MINOR +1 | 1.2.0 → 1.3.0 |
| 版本内 bug 修复 / 小补丁 | PATCH +1 | 1.2.0 → 1.2.1 |
| A 档全部完成 | **2.0.0** | — |
| A + B + C 档全部完成 | **3.0.0** | — |

- 版本号落点：`tauri.conf.json`、`src-tauri/Cargo.toml`、`package.json` 三处同步（用 `scripts/bump-version.ps1`）
- 每个版本打 git tag `vX.Y.Z`，GitHub Release 挂双端产物（ASCII 命名，`-clean` = 纯净版）
- 当前基线：**v1.1.0**（tag 已推送，Release 已发布 6 个产物）

---

## A 档 · 安全运营 + 成熟度（→ 2.0.0）

### v1.2.0 安全体检（Watchtower）✅ 已完成（2026-09-03）
> 实现超出原计划：本地四项检查 + HIBP k-匿名联网检查均已交付，含 13 项单测。
- **本地检查**：重复密码（同密码多条目互相引用）、弱密码（长度 + 字符组合熵 + 常见密码词典）、不完整条目（缺账户或密码）、陈旧密码（最后修改超 N 月，N 可配置）
- **联网检查（可选，默认开，可关）**：HaveIBeenPwned k-匿名查询——仅发送密码 SHA-1 前 5 位十六进制，密码本体永不出本机；网络走现有 Rust `agent_http` 代理，不受 CORS 限制
- **UI**：主界面新增「体检」面板，按风险分级（高/中/低/提示），每项可点击跳到对应条目；支持一键重新体检与上次体检时间展示
- **验收**：`test/watchtower.test.mjs` 单测覆盖本地检查逻辑；面板在桌面与 Android 正常渲染

### v1.3.0 TOTP 动态验证码 ✅ 已完成（2026-09-03）
> 交付：`totp_secret` 列 + 旧库自动迁移（local/server 双端）、otpauth:// 链接粘贴自动提取、卡片实时码 + 倒计时 + 一键复制；10 项单测含 RFC 6238 附录向量全对。
- 条目 schema 新增 `totpSecret`（base32）；录入/编辑表单支持填写（带格式校验）
- 条目卡片与详情显示 6 位动态码 + 30 秒环形倒计时，点击复制
- 算法：WebCrypto HMAC-SHA1 实现 RFC 6238；单测对照 RFC 6238 附录测试向量
- 与体检联动：有网址但未配 TOTP 的条目给出提示级建议项

### v1.4.0 自动锁定 + 剪贴板自动清除 ✅ 已完成（2026-09-04）
> 交付：设置双开关（自动锁定 永不/1min/5min/切后台；剪贴板 关/15s/30s）、活动监听 + 5s 巡检 + visibilitychange、锁定时重新打码全部敏感信息、复制后定时覆写剪贴板；7 项单测。
- 设置新增：自动锁定（永不 / 1 分钟 / 5 分钟 / 切后台即锁）、剪贴板清除延时（关闭 / 15 秒 / 30 秒）
- 前端 idle 计时 + `visibilitychange`；锁定后回到现有 PIN 锁屏
- 剪贴板清除：桌面 / Android 由 Rust 侧定时覆写剪贴板（避免 WebView 局限）
- **验收**：设置项持久化；锁屏触发后需 PIN 解锁；复制密码后到时剪贴板被清

### v1.5.0 密码历史 + 时效
- 条目新增 `history: [{password, changedAt}]`；编辑改密时自动归档旧值
- 详情页可查看历史密码列表（点击复制，展示变更时间）
- 体检「陈旧密码」基于 `updatedAt`；与历史记录互相印证

### v1.6.0 深色主题
- 基于现有 CSS 变量体系补暗色调色板；设置三档：跟随系统 / 浅色 / 深色
- `prefers-color-scheme` 媒体查询 + 手动覆盖（localStorage 持久化）
- Android `values-night` 状态栏配色联动

### 2.0.0 发布（A 档收尾）
- 三处版本号统一为 2.0.0；双端双变体构建验证；README / 应用内指南更新
- tag `v2.0.0` + GitHub Release 挂 6 个产物

---

## B 档 · 效率与保障（2.1.0 – 2.4.0）

| 版本 | 功能 | 要点 |
|---|---|---|
| v2.1.0 | 强搜索 | 模糊匹配、全字段（所属/账户/网址/备注/分类）、操作符过滤（`分类:工作`、`有验证码`）、命中高亮 |
| v2.2.0 | 自动备份快照 | 定期把加密 `.db` 存为快照到应用数据目录，保留 N 份滚动覆盖；设置里可查看/一键恢复 |
| v2.3.0 | 密码短语生成 | 词表模式（中文词组/英文 diceware）、分隔符、词数、首字母大写等选项，与现有字符型生成器并存 |
| v2.4.0 | 附件 | 条目挂小文件（加密存入库，上限如 2MB/个），应用内查看不落盘 |

## C 档 · 原生增强（2.5.0 – 2.7.0 → 3.0.0）

| 版本 | 功能 | 要点 |
|---|---|---|
| v2.5.0 | Android 防截屏 | MainActivity 加 `FLAG_SECURE`：后台卡片与截屏均不可见内容（几行 Kotlin） |
| v2.6.0 | 生物识别解锁 | Windows Hello / Android 指纹（BiometricPrompt），作为 PIN 的可选替代；失败回退 PIN |
| v2.7.0 | 条目视觉增强 | 网站 favicon（本地缓存）、收藏/置顶、桌面端侧栏布局 |
| 3.0.0 | 发布 | 全档收尾、双端验证、tag + Release |

> 明确不做：passkeys、系统级自动填充、SSH/GPG agent、Bitwarden 同步——与轻量定位冲突且工程量巨大。

---

## Git 工作流

- 单主干 `main` + 短命 `feature/*` 分支（可选择）；**conventional commits**：`feat:` / `fix:` / `docs:` / `chore:` / `build:`
- 功能完成 → bump 版本 → commit → tag → 双端构建 → Release
- **密钥永不入库**：`public/agent-config.local.js` 已在 `.gitignore`；模板 `agent-config.example.js`；纯净版构建 = 构建期临时移出 local 文件
- 远端：`https://github.com/rem-sy/passbook`（私有）；git 走本机代理 `127.0.0.1:7890`（仓库级配置）

## 测试策略

- 单测（`node --test`，沙箱内逐文件运行）：现有 generator / db-crypto / agent / api 四套，新增 watchtower、totp、history
- 功能完成标准：单测通过 + `node --check` 语法 + 桌面构建成功（涉及移动端时 + Android 构建）
- 交付前双端手测：桌面便携版 + Android APK 各过一遍冒烟清单

## 环境恢复清单（构建环境曾被外部清空，重建时参考）

1. `npm install`（node_modules 已被清）
2. `cargo` 首次全量重编（src-tauri/target 已被清，约 10–20 分钟）
3. `npx tauri android init` 重新生成 gen/android，然后回填定制：
   - `AndroidManifest.xml` → `android:icon="@mipmap/ic_launcher"`
   - gradle 脚本加 `PASSBOOK_SKIP_TAURI_SCRIPT` 旁路守卫
   - 重跑 `scripts/icon-from-png.ps1` 生成各密度 mipmap 图标
   - cargo 重编后 `.so` 由构建脚本自动复制到 jniLibs

## 参考项目（合规边界）

| 来源 | 用途 | 协议边界 |
|---|---|---|
| Keyguard | 产品思路 / 交互模式 | source-available 个人使用许可：只借思路，禁复制代码 |
| otpauth / otplib | TOTP 算法参考 | MIT：可参考实现思路 |
| zxcvbn | 密码强度估算思路 | MIT：自行精简实现 |
| HIBP API | 泄露查询 | 官方公开 API，k-匿名 |
