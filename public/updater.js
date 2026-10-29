/* 密码本 · 自动更新前端模块（v4.9.0，UMD：浏览器与 Node 双端可用）
 * 纯函数：版本比较（semver/tag）、Release 资产挑选、latest.json 构建、启动检查节流。
 * 网络与安装动作在 app.js（经 Rust 命令：update_check / update_download_install /
 * update_query_latest / update_download_apk / update_restart）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassUpdater = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 解析版本串：去 v 前缀 → [major, minor, patch]；非法段按 0 处理；完全非法返回 null */
  function parseVer(s) {
    var m = String(s == null ? '' : s).trim().toLowerCase().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m) return null;
    return [+m[1] || 0, +m[2] || 0, +m[3] || 0];
  }

  /** a < b → -1；a > b → 1；相等/任一非法 → 0（非法不判更新，宁可漏报不误报） */
  function cmpVer(a, b) {
    var va = parseVer(a), vb = parseVer(b);
    if (!va || !vb) return 0;
    for (var i = 0; i < 3; i++) {
      if (va[i] < vb[i]) return -1;
      if (va[i] > vb[i]) return 1;
    }
    return 0;
  }

  /** 远端 tag/版本 是否比当前新 */
  function isNewer(remote, current) {
    return cmpVer(remote, current) > 0;
  }

  /** 从 GitHub Release 资产里挑正式 APK（排除 preset；arm64）→ {url, size} | null */
  function pickApkAsset(assets) {
    var arr = Array.isArray(assets) ? assets : [];
    for (var i = 0; i < arr.length; i++) {
      var n = String((arr[i] || {}).name || '');
      if (n.indexOf('Passbook-Android-') === 0 && n.slice(-10) === '-arm64.apk' && n.indexOf('preset') < 0) {
        return { url: arr[i].browser_download_url || '', size: +arr[i].size || 0 };
      }
    }
    return null;
  }

  /** 构建 latest.json（updater 插件静态清单）——构建管线用，前端运行时不依赖 */
  function buildLatestJson(version, setupUrl, signature) {
    return {
      version: String(version || '').replace(/^v/, ''),
      notes: '',
      pub_date: new Date().toISOString(),
      platforms: {
        'windows-x86_64': { signature: String(signature || '').trim(), url: setupUrl },
      },
    };
  }

  /** 启动检查节流（Android 24h；桌面每次启动都查） */
  var THROTTLE_MS = 24 * 60 * 60 * 1000;

  /** 是否应做启动静默检查：开关心 + （仅移动端）距上次检查 ≥ 24h */
  function shouldAutoCheck(opts) {
    var o = opts || {};
    if (!o.enabled) return false;
    if (!o.mobile) return true; // 桌面：每次启动
    var last = +o.lastCheckTs || 0;
    return Date.now() - last >= THROTTLE_MS;
  }

  return {
    parseVer: parseVer,
    cmpVer: cmpVer,
    isNewer: isNewer,
    pickApkAsset: pickApkAsset,
    buildLatestJson: buildLatestJson,
    shouldAutoCheck: shouldAutoCheck,
    THROTTLE_MS: THROTTLE_MS,
  };
});
