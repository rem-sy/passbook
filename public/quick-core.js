/**
 * 密码本 · 快捷面板纯逻辑（v4.10.0）
 * quick.html/quick.js 的可测试内核：面板视图状态机 / 搜索结果裁剪 / 导入预览 /
 * 剪贴板自动清除延时。UI 与 Tauri 桥接在 quick.js，此处零依赖（Node 可测）。
 *
 * 浏览器 (window.PassQuick) 与 Node (module.exports) 双端可用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassQuick = factory();
})(globalThis, function () {
  'use strict';

  /**
   * 面板应显示哪个视图。
   * @param {{ready:boolean, needsPin:boolean, unlocked:boolean}} s 主窗状态
   * @returns {'loading'|'pin'|'unavailable'|'ready'}
   *  - loading：主窗尚未完成初始化（加密库解锁/数据加载中）
   *  - pin：已启用启动锁且当前处于锁定态 → 先过 PIN
   *  - unavailable：非桌面应用 / 主窗不存在（理论上不会出现）
   *  - ready：直接进面板功能
   */
  function gateView(s) {
    const st = s || {};
    if (st.ready === false) return 'loading';
    if (st.available === false) return 'unavailable';
    if (st.needsPin && !st.unlocked) return 'pin';
    return 'ready';
  }

  /** 搜索结果裁剪：最多 limit 条，字段收敛到面板渲染所需（密码完整返回——复制在本机完成）。
   *  容错：主窗若传来 PassSearch 的 {entry,score,fields} 包装（v4.11.1 前的 bug 形态），自动解包取 entry。 */
  function trimResults(items, limit = 30) {
    return (items || []).slice(0, limit).map((raw) => {
      const it = raw && raw.entry ? raw.entry : raw || {};
      return {
        id: it.id,
        owner: it.owner || '',
        account: it.account || '',
        password: it.password || '',
        url: it.url || '',
        note: it.note || '',
        category: it.category || '',
        totp_secret: it.totp_secret || '',
        fav: !!it.fav,
      };
    });
  }

  /** 导入预览文案（脱敏）：解析条数 + 前 12 条「所属 | 账户 | ***」 */
  function importPreview(rows, limit = 12) {
    const list = rows || [];
    if (!list.length) return '未解析出任何记录';
    const lines = list.slice(0, limit).map((r) => `${r.owner} | ${r.account} | ${'*'.repeat(Math.min((r.password || '').length, 12))}`);
    return `解析出 ${list.length} 条：\n` + lines.join('\n') + (list.length > limit ? `\n… 共 ${list.length} 条` : '');
  }

  /** 剪贴板自动清除延时毫秒（0 = 不清除）；与主窗同规则：lock.clipboard ∈ 0/15/30 秒 */
  function clearDelayMs(lockCfg) {
    const v = lockCfg && Number(lockCfg.clipboard);
    return [0, 15, 30].includes(v) ? v * 1000 : 0;
  }

  return { gateView, trimResults, importPreview, clearDelayMs };
});
