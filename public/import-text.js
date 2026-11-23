/* 密码本 · 粘贴导入解析（v4.12.5 抽为纯模块，Node 可测）
 * 输入：粘贴文本。支持三类内容（可混合）：
 *  1. PASSBOOK 迁移文本（每行一条）
 *  2. 「密码本条目」分享卡片文本（可多张连粘）
 *  3. 经典 CSV 行：所属,账户,密码[,网址][,备注]（也支持 / 、制表符、空格分隔）
 * 依赖：PassQR（unpackMigrate / parseShareCard，qr.js 同页加载） */
(function (root) {
  'use strict';

  function parseImportReport(text, passqr) {
    const QR = passqr || (root && root.PassQR) || (typeof PassQR !== 'undefined' ? PassQR : null);
    const lines = String(text || '').split(/\r?\n/).map((line) => line.trim());
    const rows = [];
    let skipped = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('#')) continue;
      if (/^(所属|账户|账号|用户名|owner|account)[,，/\t ]/.test(line)) continue; // 表头
      let entry;
      if (/^PASSBOOK:/i.test(line)) {
        entry = QR?.unpackMigrate(line);
      } else if (line === '密码本条目') {
        const card = [line];
        while (/^(所属|账户|密码|TOTP|备注):/.test(lines[i + 1] || '')) card.push(lines[++i]);
        entry = QR?.parseShareCard(card.join('\n'));
      } else {
        entry = parseDelimitedLine(line);
      }
      if (!entry || !entry.owner) { skipped++; continue; }
      const { owner, account = '', password = '', url = '', category = '', note = '', totp_secret = '' } = entry;
      rows.push({ owner, account, password, url, category, note, totp_secret });
    }
    return { rows, skipped };
  }

  function parseDelimitedLine(line) {
    for (const delimiter of [',', '，', '/', /\t+/, /\s+/]) {
      const fields = line.split(delimiter).map((value) => value.trim());
      if (fields.length < 3) continue;
      const [owner, account, password, url, note] = fields;
      return { owner, account, password, url, note };
    }
    return null;
  }

  function parseImportText(text, passqr) {
    return parseImportReport(text, passqr).rows;
  }

  const api = { parseImportText, parseImportReport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node 测试
  if (root) root.PassImportText = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
