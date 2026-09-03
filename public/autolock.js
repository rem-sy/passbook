/**
 * 密码本 · 自动锁定与剪贴板清除（纯逻辑，UI 无关）
 * autoLock: 'never' | '60' | '300' | 'hidden'（秒数或切后台即锁）
 * clipboard: 0 | 15 | 30（复制后清空剪贴板的延时秒数，0 = 关闭）
 * 浏览器 (window.PassLock) 与 Node (module.exports) 双端可用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassLock = factory();
})(globalThis, function () {
  'use strict';

  const AUTOLOCK_VALUES = ['never', '60', '300', 'hidden'];
  const CLIPBOARD_VALUES = [0, 15, 30];

  /** 归一化配置：非法值回退默认（never / 0） */
  function normalizeLockConfig(raw) {
    const r = raw || {};
    const autoLock = AUTOLOCK_VALUES.includes(String(r.autoLock)) ? String(r.autoLock) : 'never';
    const clipboard = CLIPBOARD_VALUES.includes(Number(r.clipboard)) ? Number(r.clipboard) : 0;
    return { autoLock, clipboard };
  }

  /**
   * 是否应触发锁定。
   * @param {{lastActivity?:number, now?:number, hidden?:boolean, cfg?:object}} arg
   *   lastActivity 最后一次用户活动时间戳；hidden 当前是否处于后台
   */
  function shouldLock(arg) {
    const { lastActivity = 0, now = Date.now(), hidden = false, cfg } = arg || {};
    const c = normalizeLockConfig(cfg);
    if (c.autoLock === 'hidden') return hidden;
    if (c.autoLock === 'never') return false;
    return (now - lastActivity) >= Number(c.autoLock) * 1000;
  }

  /** 剪贴板清除延时毫秒数（0 = 不清除） */
  function msUntilClear(cfg) {
    return normalizeLockConfig(cfg).clipboard * 1000;
  }

  return { normalizeLockConfig, shouldLock, msUntilClear, AUTOLOCK_VALUES, CLIPBOARD_VALUES };
});
