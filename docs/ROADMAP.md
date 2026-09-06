# 密码本 Roadmap

> 维护约定：每完成一个版本更新此文件。当前已发布：**v4.1.0**（tag + GitHub Release 383628895 齐全，正式 3 产物）。
> 历史路线图（v1.1.0→3.0.0 改造期）见 [ROADMAP-history-v1-3.md](ROADMAP-history-v1-3.md)。

## 版本规范
- 功能完成 → MINOR +1；bug 修复 → PATCH +1；里程碑经用户确认 → GitHub Release
- 版本 4 处同步：package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml / gen/android/app/tauri.properties（versionCode = M×10000+m×100+p）
- sw.js CACHE_NAME 每版 +1；产物 ASCII 命名；-preset 预置版仅本地永不上传

## 4.0 已交付（扫码时代）
- 扫码进出四功能：TOTP 扫码录入（otpauth 全参数）/ 条目二维码（明文分享卡片 + PASSBOOK 迁移码双模式，保存/复制）/ 扫码填写（五级识别）/ 扫码导入（连续入库）
- jsQR 相机+相册统一管线（public/qr.js，public/lib/）；Android 相机权限按需申请（build-android.ps1 RustWebView 补丁 PbCamGrant + manifest CAMERA）
- 应用图标零白边（逐像素 bbox 0 边距裁剪 + 边界泛洪白底转透明，边界区白像素=0）

## 4.1.0 已交付（浏览器一键导入）
Edge/Chrome 导出 CSV 一键导入：
- 导入弹窗第 4 个 tab「浏览器导入」，复用 file-drop 选 CSV；Tauri 环境走 Rust 系统对话框
- **表头自动识别**（不硬编码列序，public/importer.js 纯函数）：url/username/password/name/note 关键词模糊匹配 → 所属/网址/账户/密码/备注；Chrome/Edge（含无 note 变体）/Firefox/中文乱序表头均支持
- 预览确认：「识别为 XX 格式 / N 条 / M 条重复（同网址+账户，网址归一去协议/www）」+ 去重策略单选（跳过 / 仍导入）
- 容错：密码列空行跳过并计数；引号转义 / BOM / CRLF 兼容
- 安全提示：导入完成 toast 提醒删除明文 CSV；测试 17 套（新增 test/importer.test.mjs 14 例）

## v4.2.0（下一版，已规划）：Passkey 阶段 1（数据托管）
- 新增「Passkey」条目类型：credentialId / rpId / userHandle / 私钥（JWK/PEM）结构化存储
- 支持从 Bitwarden 导出 JSON 导入；**只存不用**（集中备份价值）
- 不做完整 WebAuthn provider（见远期阶段 2/3）

## 远期（方向已评估，未排期）
- Passkey 阶段 2：Android Credential Manager / WebView2 WebAuthn 桥（架构级，需原生服务层）
- Passkey 阶段 3：桌面浏览器扩展配对（同自动填充，需常驻本地服务）
- KDF 参数可调 + 存量库重新加密向导
- 体检条目卡片「已泄露 N 次」徽标（HIBP 检测已有，仅展示增强）
- Android「复制并打开目标 App」快填（低成本的自动填充替代）

## 明确不做
- 多用户/组织共享（单人自用定位）
- 云托管同步（本地优先；自建远程模式已覆盖）

## 竞品对标结论（2026 调研）
对标 Keyguard（androidLibAutofill / SSH / GPG agent，github.com/AChep/keyguard-app）、KeePassXC（ANSSI 认证 / Passkeys BE-BS 标记 / 持续加导入器，keepassxc.org）、KeePassDX（passkeys / prf，github.com/Kunzisoft/KeePassDX）。本项目 **HIBP 泄露检测已有**（watchtower.js checkPwned，k-匿名 SHA-1 前 5 位）。自动填充与 passkey provider 是与头部产品的最大差距，均为架构级工程，按远期路线渐进。