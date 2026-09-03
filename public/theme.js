/**
 * 密码本 · 主题切换（浅色 / 深色 / 跟随系统）
 * 生效机制：<html> 加/去 .dark 类，CSS 变量整体换肤；auto 模式监听系统变化。
 * 浏览器 (window.PassTheme) 与 Node (module.exports) 双端可用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassTheme = factory();
})(globalThis, function () {
  'use strict';

  const THEMES = ['auto', 'light', 'dark'];

  function normalizeTheme(v) {
    return THEMES.includes(v) ? v : 'auto';
  }

  /** 解析实际生效主题：auto → 按系统偏好 */
  function resolveTheme(setting, prefersDark) {
    const s = normalizeTheme(setting);
    if (s === 'auto') return prefersDark ? 'dark' : 'light';
    return s;
  }

  /** 应用到文档：切换 <html>.dark 类，返回生效主题 */
  function applyTheme(doc, setting, prefersDark) {
    const eff = resolveTheme(setting, prefersDark);
    doc.documentElement.classList.toggle('dark', eff === 'dark');
    return eff;
  }

  return { THEMES, normalizeTheme, resolveTheme, applyTheme };
});
