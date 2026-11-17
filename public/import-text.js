/* 密码本 · 粘贴导入解析（v4.12.5 抽为纯模块，Node 可测）
 * 输入：粘贴文本。支持三类内容（可混合）：
 *  1. PASSBOOK 迁移密文（每行一条，来自「条目分享 → 迁移模式 → 复制文本」）
 *  2. 「密码本条目」分享卡片文本（可多张连粘）
 *  3. 经典 CSV 行：所属,账户,密码[,网址][,备注]（也支持 / 、制表符、空格分隔）
 * 依赖：PassQR（unpackMigrate / parseShareCard，qr.js 同页加载） */
(function (root) {
  'use strict';

  function parseImportText(text, passqr) {
    const QR = passqr || (root && root.PassQR) || (typeof PassQR !== 'undefined' ? PassQR : null);
    const rows = [];
    let rest = [];
    for (const rawLine of String(text || '').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (/^PASSBOOK:/i.test(line)) {
        const e = QR ? QR.unpackMigrate(line) : null;
        if (e) rows.push({ owner: e.owner || '', account: e.account || '', password: e.password || '', url: e.url || '', category: e.category || '', note: e.note || '', totp_secret: e.totp_secret || '' });
        continue;
      }
      rest.push(rawLine);
    }
    const body = rest.join('\n');
    if (body.includes('密码本条目')) {
      for (const chunk of body.split(/(?=密码本条目)/)) {
        const card = QR ? QR.parseShareCard(chunk) : null;
        if (card) rows.push({ owner: card.owner || '', account: card.account || '', password: card.password || '', url: '', category: '', note: card.note || '', totp_secret: card.totp_secret || '' });
      }
      return rows;
    }
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      if (/^(所属|账户|账号|用户名|owner|account)[,，/\t ]/.test(line)) continue; // 表头
      let parts = line.split(',').map((s) => s.trim());
      if (parts.length < 3) parts = line.split('，').map((s) => s.trim());
      if (parts.length < 3) parts = line.split('/').map((s) => s.trim());
      if (parts.length < 3) parts = line.split(/\t+/).map((s) => s.trim());
      if (parts.length < 3) parts = line.split(/\s+/).map((s) => s.trim());
      if (parts.length < 3) continue;
      const [owner, account, password, url = '', note = ''] = parts;
      rows.push({ owner, account, password, url, category: '', note });
    }
    return rows;
  }

  const api = { parseImportText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node 测试
  if (root) root.PassImportText = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
