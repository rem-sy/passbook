/* 密码本 · 文件仓（v4.4.0）
 * 能力：files 表 schema（迁移链幂等）、pending 队列解析、元数据行构建、
 *       sha256 去重与引用计数删除判定、桶路径、检索（复用 PassSearch）、
 *       预览类型判定（含 ACTION_VIEW mime 表）、轻量 Markdown 渲染、
 *       store-only ZIP 构建（文件仓导出）、换密钥重加密任务列表。
 * 零依赖 UMD：浏览器挂 window.PassFiles，Node 测试走 module.exports。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassFiles = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- files 表 schema（v4.4.0，进 LocalStore.init() 迁移链） ---------- */
  var FILES_SCHEMA_SQL = [
    'CREATE TABLE IF NOT EXISTS files (',
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
    "  name TEXT NOT NULL DEFAULT '',",
    "  mime TEXT NOT NULL DEFAULT 'application/octet-stream',",
    '  size INTEGER NOT NULL DEFAULT 0,',
    "  sha256 TEXT NOT NULL DEFAULT '',",
    "  source TEXT NOT NULL DEFAULT 'other',",
    "  tags TEXT NOT NULL DEFAULT '',",
    "  note TEXT NOT NULL DEFAULT '',",
    '  created_at TEXT NOT NULL',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at);',
    'CREATE INDEX IF NOT EXISTS idx_files_sha ON files(sha256);',
    /* 文件仓 KV（salt / 密钥材料指纹等元数据，随 .db 走；本体绝不入库） */
    'CREATE TABLE IF NOT EXISTS file_kv (',
    '  k TEXT PRIMARY KEY,',
    "  v TEXT NOT NULL DEFAULT ''",
    ');',
  ].join('\n');

  /** 合法的 source 取值（v4.4.0 四通道 + other 兜底） */
  var SOURCES = ['wechat', 'qq', 'saf', 'drag', 'open', 'other'];

  var SOURCE_LABELS = {
    wechat: '微信', qq: 'QQ', saf: 'SAF 导入', drag: '拖拽', open: '其他应用打开', other: '其他',
  };

  function normSource(s) {
    return SOURCES.indexOf(s) >= 0 ? s : 'other';
  }

  /* ---------- 来源识别：按分享/打开方的包名尽量识别 ---------- */
  var PKG_SOURCE_MAP = {
    'com.tencent.mm': 'wechat',
    'com.tencent.mobileqq': 'qq',
  };

  /** EXTRA_CALLING_PACKAGE / getCallingPackage 等取到的包名 → source；识别不了归 other */
  function detectSource(pkg) {
    var p = String(pkg || '').trim().toLowerCase();
    if (PKG_SOURCE_MAP[p]) return PKG_SOURCE_MAP[p];
    // 常见包名兜底（微信分身/平行空间等前缀变体）
    if (p.indexOf('com.tencent.mm') === 0) return 'wechat';
    if (p.indexOf('com.tencent.mobileqq') === 0 || p === 'com.tencent.tim') return 'qq';
    return 'other';
  }

  /**
   * 应用 files 迁移（幂等可重入）：run 为执行 SQL 的函数。
   * 返回是否首次新建（无 files 表时）——仅供日志。
   */
  function applyFilesSchema(run, tableExists) {
    var first = false;
    if (typeof tableExists === 'function' && !tableExists('files')) first = true;
    run(FILES_SCHEMA_SQL);
    return first;
  }

  /* ---------- 元数据行构建 ---------- */

  /**
   * 构建入库行：{ name, mime, size, sha256, source, tags, note, created_at }
   * name/sha256 必填（sha256 须 64 位十六进制，非法抛错）；size 归一为非负整数；
   * mime 空时按扩展名推导；source 归一化。
   */
  function buildMetaRow(meta) {
    var m = meta || {};
    var name = String(m.name || '').trim();
    var sha = String(m.sha256 || '').trim().toLowerCase();
    if (!name) throw new Error('文件名不能为空');
    if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('sha256 格式非法');
    return {
      name: name,
      mime: String(m.mime || '').trim().toLowerCase() || mimeFromName(name) || 'application/octet-stream',
      size: Number.isFinite(+m.size) && +m.size >= 0 ? Math.floor(+m.size) : 0,
      sha256: sha,
      source: normSource(m.source),
      tags: String(m.tags || '').trim(),
      note: String(m.note || ''),
      created_at: m.created_at || new Date().toISOString(),
    };
  }

  /* ---------- 桶路径：files-store/<sha256前两位>/<sha256> ---------- */

  var SHA_RE = /^[0-9a-f]{64}$/;

  /** 桶内相对路径（两位前缀分桶）；非法 sha256 抛错 */
  function bucketPath(sha256) {
    var s = String(sha256 || '').toLowerCase();
    if (!SHA_RE.test(s)) throw new Error('sha256 格式非法');
    return s.slice(0, 2) + '/' + s;
  }

  /* ---------- sha256 去重 + 引用计数删除 ---------- */

  /** 同内容条数（rows 为全部 files 行）：用于「与已有 N 个文件内容相同」提示 */
  function dupCount(rows, sha256) {
    var s = String(sha256 || '').toLowerCase();
    var n = 0;
    var arr = rows || [];
    for (var i = 0; i < arr.length; i++) if (String(arr[i].sha256 || '').toLowerCase() === s) n++;
    return n;
  }

  /**
   * 引用计数删除判定：删除某行后，余下同 sha256 行数（remaining）为 0 才物理删桶内本体。
   */
  function shouldDeleteBlob(remainingRows) {
    return !(remainingRows || []).length;
  }

  /** 去重提示文案：0 → null（无提示）；N>0 → 「与已有 N 个文件内容相同」 */
  function dupHint(count) {
    return count > 0 ? '与已有 ' + count + ' 个文件内容相同（同内容共用一份加密存储）' : null;
  }

  /* ---------- 文件检索（复用 PassSearch 多词管线：名称+备注+标签+来源） ---------- */

  /** 文件行 → PassSearch 伪条目（owner=名称 / note=备注+来源 / category=标签） */
  function fileToEntry(f) {
    return {
      id: f.id,
      owner: f.name || '',
      account: '',
      password: '',
      url: '',
      category: f.tags || '',
      note: (f.note || '') + ' ' + (SOURCE_LABELS[normSource(f.source)] || ''),
      totp_secret: '',
      fav: 0,
      created_at: f.created_at,
      updated_at: f.created_at,
      __file: f,
    };
  }

  /**
   * 多词检索文件：借助 PassSearch.searchEntries。返回 [{ file, score }]（分数降序）；
   * 空查询返回 null（调用方全量展示）。
   */
  function searchFiles(files, query, PassSearch, opts) {
    if (!PassSearch || typeof PassSearch.searchEntries !== 'function') return null;
    var pq = PassSearch.parseQuery(query);
    if (!pq.terms.length && !Object.keys(pq.filters).length) return null;
    var arr = files || [];
    var entries = arr.map(fileToEntry);
    var res = PassSearch.searchEntries(entries, query) || [];
    var out = [];
    var seen = {};
    for (var i = 0; i < res.length; i++) {
      seen[res[i].entry.__file.id] = true;
      out.push({ file: res[i].entry.__file, score: res[i].score, contentHit: false });
    }
    /* v4.5.0 内容检索：抽取文本 ftext 命中全部检索词（AND）也返回，标记 contentHit */
    if (!opts || opts.content !== false) {
      var terms = pq.terms.map(function (t) { return String(t.term != null ? t.term : t).toLowerCase(); })
        .filter(Boolean);
      for (var j = 0; j < arr.length && terms.length; j++) {
        var f = arr[j];
        if (seen[f.id]) continue;
        var ft = String(f.ftext || '').toLowerCase();
        if (!ft) continue;
        var all = true;
        for (var k = 0; k < terms.length; k++) if (ft.indexOf(terms[k]) < 0) { all = false; break; }
        if (all) out.push({ file: f, score: 0.1, contentHit: true });
      }
    }
    return out;
  }

  /* ---------- v4.5.0 内容检索：抽取文本处理纯函数 ---------- */

  /** 每文件抽取文本上限（防大 PDF 撑库；截断即够个人检索用） */
  var FTEXT_CAP = 256 * 1024;

  function capText(t, max) {
    var s = String(t == null ? '' : t);
    var cap = max || FTEXT_CAP;
    return s.length > cap ? s.slice(0, cap) : s;
  }

  /**
   * OOXML 内部 XML → 纯文本：段落/单元格边界转换行、去标签、还原实体、压平空白。
   * 适配 docx（w:）、pptx（a:）、xlsx 共享字符串（<t>）等任意 OOXML XML 片段。
   */
  function xmlToText(xml) {
    var s = String(xml == null ? '' : xml);
    s = s.replace(/<w:p[ >]|<a:p[ >]/g, '\n');           // 段落起始换行（w:word a:ppt）
    s = s.replace(/<w:tab\/>|<w:tab[ >]/g, '\t');
    s = s.replace(/<[^>]*>/g, '');                        // 去标签
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
       .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
       .replace(/&amp;/g, '&');                           // 实体还原（&amp; 最后处理）
    s = s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }

  /** pptx 幻灯片路径排序（slide2 < slide10，避免字典序 10<2） */
  function slideKeyOrder(a, b) {
    var na = (String(a).match(/slide(\d+)\.xml$/i) || [])[1];
    var nb = (String(b).match(/slide(\d+)\.xml$/i) || [])[1];
    na = na ? +na : 1e9; nb = nb ? +nb : 1e9;
    return na - nb || String(a).localeCompare(String(b));
  }

  /**
   * 命中片段：在 text 中找 terms 首个出现位置，截前后 radius 字符的上下文（带 …）。
   * 未命中返回 null。
   */
  function snippetOf(text, terms, radius) {
    var s = String(text == null ? '' : text);
    var r = radius || 36;
    var lower = s.toLowerCase();
    var pos = -1, hitTerm = '';
    for (var i = 0; i < (terms || []).length; i++) {
      var t = String(terms[i]).toLowerCase();
      if (!t) continue;
      var p = lower.indexOf(t);
      if (p >= 0 && (pos < 0 || p < pos)) { pos = p; hitTerm = t; }
    }
    if (pos < 0) return null;
    var start = Math.max(0, pos - r);
    var end = Math.min(s.length, pos + hitTerm.length + r);
    return (start > 0 ? '…' : '') + s.slice(start, end).replace(/\s+/g, ' ') + (end < s.length ? '…' : '');
  }

  /* ---------- 预览类型判定（纯函数：mime/扩展名 → 渲染通道） ---------- */

  /** ACTION_VIEW intent-filter 覆盖的文档 mime（manifest 与本表共用，测试断言一致） */
  var VIEW_MIMES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.ms-office',
    'text/markdown',
    'text/plain',
    'text/csv',
    'application/json',
    'application/rtf',
  ];

  var EXT_MIME = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    md: 'text/markdown', markdown: 'text/markdown',
    txt: 'text/plain', log: 'text/plain', csv: 'text/csv', json: 'application/json',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon',
    rtf: 'application/rtf',
  };

  /** 按扩展名推导 mime（小写；未知返回 ''） */
  function mimeFromName(name) {
    var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? (EXT_MIME[m[1]] || '') : '';
  }

  /**
   * 预览类型判定：返回
   *   inline-pdf | inline-md | inline-docx | inline-xlsx | inline-img | text | system
   * 取舍：doc/ppt/xls 旧二进制与 pptx 不做内置渲染（依赖重），走「系统打开」通道。
   */
  function previewKind(mime, name) {
    var m = String(mime || '').trim().toLowerCase();
    var byName = mimeFromName(name);
    if (!m) m = byName;
    var ext = (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
    if (m === 'application/pdf' || ext === 'pdf') return 'inline-pdf';
    if (m.indexOf('wordprocessingml') >= 0 || ext === 'docx') return 'inline-docx';
    if (m.indexOf('spreadsheetml') >= 0 || ext === 'xlsx') return 'inline-xlsx';
    if (m === 'text/markdown' || ext === 'md' || ext === 'markdown') return 'inline-md';
    if (m.indexOf('image/') === 0) return 'inline-img';
    if (ext === 'txt' || m === 'text/plain' || m === 'text/csv' || m === 'application/json' ||
        m.indexOf('text/') === 0) return 'text';
    /* doc/ppt/xls/pptx 及一切未识别类型：保存 + 系统打开 */
    return 'system';
  }

  /* ---------- 轻量 Markdown 渲染（零依赖自写，先整体转义再套标签） ---------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inlineMd(s) {
    var out = esc(s);
    out = out.replace(/`([^`]+)`/g, function (_, c) { return '<code>' + c + '</code>'; });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return out;
  }

  /**
   * Markdown → HTML：标题/无序有序列表/代码块/引用/粗斜体/行内代码/链接/表格 基本集。
   * 输入先整体 HTML 转义，杜绝注入。
   */
  function mdToHtml(md) {
    var lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
    var html = [];
    var i = 0;
    var inCode = false, codeBuf = [];
    var listMode = null; // 'ul' | 'ol'
    var paraBuf = [];
    function flushPara() {
      if (paraBuf.length) { html.push('<p>' + paraBuf.map(inlineMd).join('<br/>') + '</p>'); paraBuf = []; }
    }
    function closeList() {
      if (listMode) { html.push('</' + listMode + '>'); listMode = null; }
    }
    function openList(mode) {
      if (listMode !== mode) { closeList(); html.push('<' + mode + '>'); listMode = mode; }
    }
    while (i < lines.length) {
      var line = lines[i];
      if (/^```/.test(line.trim())) {
        if (inCode) {
          html.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>');
          codeBuf = []; inCode = false;
        } else { flushPara(); closeList(); inCode = true; }
        i++; continue;
      }
      if (inCode) { codeBuf.push(line); i++; continue; }
      var t = line.trim();
      if (!t) { flushPara(); closeList(); i++; continue; }
      var h = t.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flushPara(); closeList(); html.push('<h' + h[1].length + '>' + inlineMd(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
      if (/^>\s?/.test(t)) {
        flushPara(); closeList();
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
        html.push('<blockquote>' + q.map(inlineMd).join('<br/>') + '</blockquote>');
        continue;
      }
      /* 表格：| a | b | 行 + 紧随的 |---|---| 分隔行 */
      if (/^\|.+\|$/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
        flushPara(); closeList();
        var rows = [];
        while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) { rows.push(lines[i].trim()); i++; }
        var cells = function (r) {
          return r.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        };
        var head = cells(rows[0]);
        var body = rows.slice(2).map(cells);
        var th = head.map(function (c) { return '<th>' + inlineMd(c) + '</th>'; }).join('');
        var tb = body.map(function (r) {
          return '<tr>' + head.map(function (_, k) { return '<td>' + inlineMd(r[k] || '') + '</td>'; }).join('') + '</tr>';
        }).join('');
        html.push('<table><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table>');
        continue;
      }
      var ul = t.match(/^[-*+]\s+(.*)$/);
      var ol = t.match(/^\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        flushPara();
        if (ul) openList('ul'); else openList('ol');
        html.push('<li>' + inlineMd((ul || ol)[1]) + '</li>');
        i++; continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); closeList(); html.push('<hr/>'); i++; continue; }
      closeList();
      paraBuf.push(t);
      i++;
    }
    if (inCode && codeBuf.length) html.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>');
    flushPara(); closeList();
    return html.join('\n');
  }

  /* ---------- pending 队列（手机分享/其他应用打开写入的 JSON 行） ---------- */

  /**
   * 解析 pending 文件队列 → { items: [{name,mime,size,sha256,source,tempPath,open,ts}], skipped: n }
   * 容错规则同便签队列：空行跳过；非法 JSON 跳过并计数；缺 name/sha256/tempPath 跳过。
   */
  function parsePendingFiles(text) {
    var items = [], skipped = 0;
    var lines = String(text == null ? '' : text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var obj = null;
      try { obj = JSON.parse(line); } catch (e) { obj = null; }
      if (!obj || typeof obj !== 'object') { skipped++; continue; }
      if (typeof obj.name !== 'string' || !obj.name.trim() ||
          !SHA_RE.test(String(obj.sha256 || '').toLowerCase()) ||
          typeof obj.tempPath !== 'string' || !obj.tempPath.trim()) { skipped++; continue; }
      items.push({
        name: obj.name.trim(),
        mime: String(obj.mime || '').trim(),
        size: Number.isFinite(+obj.size) && +obj.size >= 0 ? Math.floor(+obj.size) : 0,
        sha256: String(obj.sha256).toLowerCase(),
        source: normSource(obj.source),
        tempPath: obj.tempPath.trim(),
        open: obj.open === true, // 「用密码本打开」标记：入库后直接唤起预览
        ts: typeof obj.ts === 'number' ? obj.ts : null,
      });
    }
    return { items: items, skipped: skipped };
  }

  /* ---------- 换密钥重加密任务列表 ---------- */

  /**
   * 生成重加密任务列表：输入文件行（或 sha 列表），按 sha256 去重输出
   * [{ sha256, bucket }]。行里可能缺 sha（脏数据）→ 过滤并计数。
   */
  function reencryptTasks(rows) {
    var seen = {};
    var out = [];
    var invalid = 0;
    var arr = rows || [];
    for (var i = 0; i < arr.length; i++) {
      var s = String(arr[i] && arr[i].sha256 || arr[i] || '').toLowerCase();
      if (!SHA_RE.test(s)) { invalid++; continue; }
      if (seen[s]) continue;
      seen[s] = true;
      out.push({ sha256: s, bucket: bucketPath(s) });
    }
    return { tasks: out, invalid: invalid };
  }

  /* ---------- 文件仓导出 ZIP（store-only，零依赖自写） ---------- */

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

  /**
   * 构建 store-only ZIP（不压缩，加密本体本就是高熵数据）：files = [{ name, bytes }]
   * 返回 Uint8Array。文件名仅支持 ASCII/UTF-8（标志位 UTF-8 name 置 1）。
   */
  function buildZip(files) {
    var enc = new TextEncoder();
    var out = [];
    var central = [];
    var arr = files || [];
    for (var i = 0; i < arr.length; i++) {
      var nameB = enc.encode(arr[i].name);
      var data = arr[i].bytes instanceof Uint8Array ? arr[i].bytes : new Uint8Array(arr[i].bytes || []);
      var crc = crc32(data);
      var off = out.length;
      out.push.apply(out, u32(0x04034b50)); // local header
      out.push.apply(out, u16(20)); // version needed
      out.push.apply(out, u16(0x0800)); // UTF-8 name
      out.push.apply(out, u16(0)); // store
      out.push.apply(out, u16(0)); // time
      out.push.apply(out, u16(0)); // date
      out.push.apply(out, u32(crc));
      out.push.apply(out, u32(data.length));
      out.push.apply(out, u32(data.length));
      out.push.apply(out, u16(nameB.length));
      out.push.apply(out, u16(0)); // extra len
      out.push.apply(out, Array.prototype.slice.call(nameB));
      out.push.apply(out, Array.prototype.slice.call(data));
      central.push.apply(central, u32(0x02014b50));
      central.push.apply(central, u16(20)); // version made by
      central.push.apply(central, u16(20)); // version needed
      central.push.apply(central, u16(0x0800));
      central.push.apply(central, u16(0));
      central.push.apply(central, u16(0));
      central.push.apply(central, u16(0));
      central.push.apply(central, u32(crc));
      central.push.apply(central, u32(data.length));
      central.push.apply(central, u32(data.length));
      central.push.apply(central, u16(nameB.length));
      central.push.apply(central, u16(0));
      central.push.apply(central, u16(0));
      central.push.apply(central, u16(0));
      central.push.apply(central, u16(0));
      central.push.apply(central, u32(0));
      central.push.apply(central, u32(off));
      central.push.apply(central, Array.prototype.slice.call(nameB));
    }
    var cdOff = out.length;
    out.push.apply(out, central);
    var cdLen = out.length - cdOff;
    out.push.apply(out, u32(0x06054b50)); // EOCD
    out.push.apply(out, u16(0));
    out.push.apply(out, u16(0));
    out.push.apply(out, u16(arr.length));
    out.push.apply(out, u16(arr.length));
    out.push.apply(out, u32(cdLen));
    out.push.apply(out, u32(cdOff));
    out.push.apply(out, u16(0));
    return new Uint8Array(out);
  }

  /* ---------- 杂项 ---------- */

  /** 人类可读大小 */
  function formatSize(n) {
    var v = Math.max(0, +n || 0);
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB';
    return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  return {
    FILES_SCHEMA_SQL: FILES_SCHEMA_SQL,
    SOURCES: SOURCES,
    SOURCE_LABELS: SOURCE_LABELS,
    VIEW_MIMES: VIEW_MIMES,
    EXT_MIME: EXT_MIME,
    normSource: normSource,
    detectSource: detectSource,
    applyFilesSchema: applyFilesSchema,
    buildMetaRow: buildMetaRow,
    bucketPath: bucketPath,
    dupCount: dupCount,
    shouldDeleteBlob: shouldDeleteBlob,
    dupHint: dupHint,
    fileToEntry: fileToEntry,
    searchFiles: searchFiles,
    FTEXT_CAP: FTEXT_CAP,
    capText: capText,
    xmlToText: xmlToText,
    slideKeyOrder: slideKeyOrder,
    snippetOf: snippetOf,
    mimeFromName: mimeFromName,
    previewKind: previewKind,
    mdToHtml: mdToHtml,
    parsePendingFiles: parsePendingFiles,
    reencryptTasks: reencryptTasks,
    buildZip: buildZip,
    crc32: crc32,
    formatSize: formatSize,
  };
});
