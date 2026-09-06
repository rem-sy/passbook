/* 密码本 · 浏览器一键导入（v4.1.0）
 * 能力：Edge/Chrome/Firefox 导出 CSV 解析（BOM/CRLF/引号转义容错）、
 *       表头自动识别映射（不硬编码列序）、格式识别、重复检测（同网址+账户）。
 * 零依赖 UMD：浏览器挂 window.PassImporter，Node 测试走 module.exports。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassImporter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- CSV 解析（容错：BOM / CRLF / 引号转义 / 逗号在引号内） ---------- */

  /** 解析 CSV 文本 → 二维数组（每行为单元格数组）。去 BOM、兼容 \r\n 与 \n、支持 "" 转义引号。 */
  function parseCsv(text) {
    var s = String(text == null ? '' : text);
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1); // BOM
    var rows = [], row = [], cell = '', inQ = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inQ) {
        if (c === '"') {
          if (s[i + 1] === '"') { cell += '"'; i++; } // "" → 字面引号
          else inQ = false;
        } else cell += c;
      } else if (c === '"' && cell === '') {
        inQ = true; // 引号只在字段开头生效（容错：行内杂散引号按字面处理）
      } else if (c === ',') {
        row.push(cell); cell = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++; // CRLF 一体
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row); // 跳过全空行
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  /* ---------- 表头识别 ---------- */

  var COL_PATTERNS = {
    url: [/^u(ri|rl)s?$/i, /^(web|site|website|login[ -]?url|login[ -]?uri|action[ -]?url|location|origin|网址|网站|地址|登录地址)/i],
    account: [/^(user|username|user[ -]?name|user[ -]?id|login|login[ -]?name|account|acct|email|e-mail|mail|账户|账号|用户名|登录名|邮箱)/i],
    password: [/^(password|pass|pwd|passphrase|密码|口令|登录密码)/i],
    owner: [/^(name|title|site[ -]?name|site|item[ -]?name|app|application|label|所属|名称|标题|应用|站点名)/i],
    note: [/^(notes?|comment|comments?|extra|description|memo|备注|注释|说明|附注)/i],
  };

  /** 表头单元格数组 → {url,account,password,owner,note} 列索引（未识别为 -1）。关键词模糊匹配，不依赖列序。 */
  function detectColumns(header) {
    var map = { url: -1, account: -1, password: -1, owner: -1, note: -1 };
    var used = {};
    // owner / note 含糊词（name/site）后配，先配硬词（url/account/password），避免 "name" 抢占 "username"
    var order = ['url', 'account', 'password', 'owner', 'note'];
    for (var oi = 0; oi < order.length; oi++) {
      var key = order[oi];
      for (var i = 0; i < header.length; i++) {
        if (used[i]) continue;
        var h = String(header[i] == null ? '' : header[i]).trim().toLowerCase();
        if (!h) continue;
        for (var pi = 0; pi < COL_PATTERNS[key].length; pi++) {
          if (COL_PATTERNS[key][pi].test(h)) { map[key] = i; used[i] = 1; break; }
        }
        if (map[key] >= 0) break;
      }
    }
    return map;
  }

  /** 格式识别：chrome / edge / firefox / generic（null = 未识别为浏览器导出）。 */
  function detectFormat(header) {
    var hs = header.map(function (h) { return String(h == null ? '' : h).trim().toLowerCase(); });
    var has = function (re) { return hs.some(function (h) { return re.test(h); }); };
    if (has(/^httprealm$/) || has(/^formactionorigin$/) || has(/^guid$/)) return 'firefox';
    if (has(/^name$/) && has(/^url$/) && has(/^username$/) && has(/^password$/)) return 'chrome'; // Edge 同源列头，统一按 Chrome/Edge 处理
    if (has(/^url$/) && has(/^username$/) && has(/^password$/)) return 'generic';
    return null;
  }

  var FORMAT_LABELS = { chrome: 'Chrome / Edge', firefox: 'Firefox', generic: '浏览器 CSV' };

  /* ---------- 网址归一（重复检测键） ---------- */

  /** 网址 → 归一化站点键（去协议 / www / 路径 / 大小写）；空返回 ''。 */
  function siteKey(url) {
    var s = String(url == null ? '' : url).trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s; // Firefox url 字段可能缺协议
    try {
      var u = new URL(s);
      var h = u.hostname.toLowerCase();
      if (h.indexOf('www.') === 0) h = h.slice(4);
      return h || s.toLowerCase();
    } catch (e) {
      return s.toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[\/?#]/)[0];
    }
  }

  /** 重复检测键：网址归一 + 账户小写（无网址则退化为 所属+账户）。 */
  function dupKey(row) {
    var k = siteKey(row.url);
    if (k) return k + '\u0000' + String(row.account || '').trim().toLowerCase();
    return '#' + String(row.owner || '').trim().toLowerCase() + '\u0000' + String(row.account || '').trim().toLowerCase();
  }

  /**
   * 解析浏览器导出 CSV。
   * 返回 { format, formatLabel, ok, error, total, skippedEmpty, rows, dupCount, dupIndexes }
   * - 密码为空的行跳过并计入 skippedEmpty
   * - 重复 = 与库内已有条目同（网址+账户），或文件内部与前文同（网址+账户）——dupIndexes 为行序号集合
   */
  function parseBrowserCsv(text, existingEntries) {
    var rows2d = parseCsv(text);
    if (!rows2d.length) return { ok: false, error: '文件为空' };
    var header = rows2d[0];
    var cols = detectColumns(header);
    if (cols.account < 0 || cols.password < 0) {
      return { ok: false, error: '未识别出账户/密码列（表头需含 username/password 等关键词）' };
    }
    var format = detectFormat(header);
    var existingKeys = {};
    (existingEntries || []).forEach(function (e) {
      // 逐条构造与导入行同构的键源
      var k = siteKey(e.url);
      var key = k
        ? k + '\u0000' + String(e.account || '').trim().toLowerCase()
        : '#' + String(e.owner || '').trim().toLowerCase() + '\u0000' + String(e.account || '').trim().toLowerCase();
      if (key) existingKeys[key] = 1;
    });
    var rows = [], dupIndexes = {}, seen = {}, skippedEmpty = 0;
    for (var i = 1; i < rows2d.length; i++) {
      var cells = rows2d[i];
      var get = function (idx) { return idx >= 0 && idx < cells.length ? String(cells[idx] == null ? '' : cells[idx]).trim() : ''; };
      var password = get(cols.password);
      if (!password) { skippedEmpty++; continue; } // 密码列空行跳过并计数
      var row = {
        owner: get(cols.owner) || get(cols.url), // 无 name 列时用网址所属域兜底
        account: get(cols.account),
        password: password,
        url: get(cols.url),
        category: '',
        note: get(cols.note),
      };
      var key = dupKey(row);
      var isDup = !!(existingKeys[key] || seen[key]);
      if (isDup) dupIndexes[i] = 1;
      seen[key] = 1;
      row._dup = isDup; // UI 按去重策略过滤用（导入时被 FIELDS 过滤，不会入库）
      rows.push(row);
    }
    var dupCount = 0;
    for (var k2 in dupIndexes) dupCount++;
    return {
      ok: true, format: format, formatLabel: FORMAT_LABELS[format] || '浏览器 CSV',
      header: header, total: rows.length, skippedEmpty: skippedEmpty,
      rows: rows, dupCount: dupCount, dupIndexes: dupIndexes,
    };
  }

  return {
    parseCsv: parseCsv,
    detectColumns: detectColumns,
    detectFormat: detectFormat,
    siteKey: siteKey,
    dupKey: dupKey,
    parseBrowserCsv: parseBrowserCsv,
    FORMAT_LABELS: FORMAT_LABELS,
  };
});
