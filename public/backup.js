/* 密码本 · 自动备份快照（v2.2.0）
 * 纯逻辑模块：快照命名/解析、滚动保留、节流决策、列表展示格式化。
 * IO 由 app.js 的 BackupAdapter 完成（Tauri 文件系统 / 浏览器 IndexedDB）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassBackup = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var NAME_RE = /^passbook-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/;
  var PREFIX = 'backup:';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 生成快照文件名：passbook-YYYYMMDD-HHmmss.db（本地时间） */
  function backupFileName(d) {
    var t = (d instanceof Date) ? d : new Date(d);
    if (isNaN(t.getTime())) throw new Error('invalid date');
    return 'passbook-' +
      t.getFullYear() + pad2(t.getMonth() + 1) + pad2(t.getDate()) + '-' +
      pad2(t.getHours()) + pad2(t.getMinutes()) + pad2(t.getSeconds()) + '.db';
  }

  /** 解析快照文件名 → Date；非法返回 null */
  function parseBackupName(name) {
    var m = NAME_RE.exec(String(name || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    // 校验月份/日期没有进位错位
    if (d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  }

  /** 按快照时间降序排序（解析失败的排最后，保持稳定） */
  function sortDesc(names) {
    return (names || []).slice().sort(function (a, b) {
      var da = parseBackupName(a), db = parseBackupName(b);
      if (da && db) return db - da;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });
  }

  /** 滚动保留：返回应删除的文件名（超出 keepN 的最旧快照；非法名不参与保留计数但会被清理） */
  function toDelete(names, keepN) {
    var sorted = sortDesc(names);
    var valid = sorted.filter(function (n) { return parseBackupName(n); });
    var invalid = sorted.filter(function (n) { return !parseBackupName(n); });
    var k = Math.max(0, keepN | 0);
    return valid.slice(k).concat(invalid);
  }

  /**
   * 是否应执行自动备份（节流）：
   * - enabled 为 false → 否
   * - 从未有快照 → 是
   * - 距最近快照 ≥ intervalMin 分钟 → 是
   */
  function shouldAutoBackup(opts) {
    var o = opts || {};
    if (!o.enabled) return false;
    var intervalMs = Math.max(1, (o.intervalMin || 60)) * 60 * 1000;
    if (!o.lastBackupAt) return true;
    var last = o.lastBackupAt instanceof Date ? o.lastBackupAt : new Date(o.lastBackupAt);
    var now = o.now instanceof Date ? o.now : new Date(o.now || Date.now());
    if (isNaN(last.getTime()) || isNaN(now.getTime())) return true;
    return (now - last) >= intervalMs;
  }

  /** 快照名 → 界面标签：passbook-20260903-142530.db → 2026-09-03 14:25:30 */
  function formatBackupLabel(name) {
    var d = parseBackupName(name);
    if (!d) return String(name || '');
    return (
      d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
    );
  }

  /** 字节数 → 人类可读（KiB/MiB） */
  function formatSize(bytes) {
    var b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KiB';
    return (b / 1024 / 1024).toFixed(2) + ' MiB';
  }

  /** IndexedDB 备份键前缀（浏览器模式） */
  function idbKey(name) { return PREFIX + name; }
  function isIdbBackupKey(key) { return typeof key === 'string' && key.indexOf(PREFIX) === 0; }
  function nameFromIdbKey(key) { return isIdbBackupKey(key) ? key.slice(PREFIX.length) : null; }

  return {
    backupFileName: backupFileName,
    parseBackupName: parseBackupName,
    sortDesc: sortDesc,
    toDelete: toDelete,
    shouldAutoBackup: shouldAutoBackup,
    formatBackupLabel: formatBackupLabel,
    formatSize: formatSize,
    idbKey: idbKey,
    isIdbBackupKey: isIdbBackupKey,
    nameFromIdbKey: nameFromIdbKey,
  };
});
