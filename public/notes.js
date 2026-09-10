/* 密码本 · 随手记（v4.3.0）
 * 能力：notes 表 schema（迁移链幂等）、pending 队列解析与消费去重、
 *       便签检索（复用 PassSearch 多词管线）。
 * 零依赖 UMD：浏览器挂 window.PassNotes，Node 测试走 module.exports。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassNotes = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- notes 表 schema（v4.3.0，进 LocalStore.init() 迁移链） ---------- */
  var NOTES_SCHEMA_SQL = [
    'CREATE TABLE IF NOT EXISTS notes (',
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
    "  title TEXT NOT NULL DEFAULT '',",
    "  content TEXT NOT NULL DEFAULT '',",
    "  tags TEXT NOT NULL DEFAULT '',",
    "  source TEXT NOT NULL DEFAULT 'manual',",
    '  created_at TEXT NOT NULL,',
    '  updated_at TEXT NOT NULL',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);',
  ].join('\n');

  /** 合法的 source 取值 */
  var SOURCES = ['manual', 'clipboard', 'share'];

  function normSource(s) {
    return SOURCES.indexOf(s) >= 0 ? s : 'manual';
  }

  /**
   * 应用 notes 迁移（幂等可重入）：run 为执行 SQL 的函数（如 db.run）。
   * 返回是否首次新建（无 notes 表时）——仅供日志，不影响语义。
   */
  function applyNotesSchema(run, tableExists) {
    var first = false;
    if (typeof tableExists === 'function' && !tableExists('notes')) first = true;
    run(NOTES_SCHEMA_SQL);
    return first;
  }

  /* ---------- pending 队列（JSON 行）解析：容错空行 / 截断行 ---------- */

  /**
   * 解析 pending 队列文件内容 → { items: [{content, source, ts}], skipped: n }
   * 容错规则：按行切分；空行/纯空白跳过；非法 JSON（截断/损坏）跳过并计数；
   * JSON 合法但缺 content 或 content 非字符串 → 跳过；source 归一化。
   */
  function parsePendingQueue(text) {
    var items = [], skipped = 0;
    var lines = String(text == null ? '' : text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue; // 空行
      var obj = null;
      try { obj = JSON.parse(line); } catch (e) { obj = null; }
      if (!obj || typeof obj !== 'object') { skipped++; continue; } // 截断/损坏行
      if (typeof obj.content !== 'string' || !obj.content.trim()) { skipped++; continue; }
      items.push({
        content: obj.content,
        source: normSource(obj.source || 'clipboard'),
        ts: typeof obj.ts === 'number' ? obj.ts : null,
      });
    }
    return { items: items, skipped: skipped };
  }

  /**
   * 消费 pending 队列：解析 + 去重（队列内同内容去重；与已有便签内容比对去重）。
   * existing 为已有便签内容集合（数组或 Set）。
   * 返回 { toInsert: [{title, content, tags, source}], dup: n, skipped: n }
   */
  function consumePending(text, existing) {
    var seen = {};
    var exSet = existing instanceof Set ? existing : new Set(existing || []);
    var parsed = parsePendingQueue(text);
    var out = [], dup = 0;
    for (var i = 0; i < parsed.items.length; i++) {
      var it = parsed.items[i];
      var key = it.source + '\u0000' + it.content;
      if (seen[key] || exSet.has(it.content)) { dup++; continue; }
      seen[key] = true;
      out.push({
        title: titleOf(it.content),
        content: it.content,
        tags: '',
        source: it.source,
      });
    }
    return { toInsert: out, dup: dup, skipped: parsed.skipped };
  }

  /** 由内容推导便签标题：首个非空行，截 30 字 */
  function titleOf(content) {
    var s = String(content == null ? '' : content);
    var first = '';
    var lines = s.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim()) { first = lines[i].trim(); break; }
    }
    if (!first) first = s.trim();
    return first.length > 30 ? first.slice(0, 30) + '…' : first;
  }

  /** 确认框预览文本：压平换行 + 截 80 字 */
  function previewText(content, n) {
    var cap = n || 80;
    var s = String(content == null ? '' : content).replace(/\s+/g, ' ').trim();
    return s.length > cap ? s.slice(0, cap) + '…' : s;
  }

  /* ---------- 便签检索（复用 PassSearch 多词管线） ---------- */

  /** 便签 → PassSearch 伪条目（owner=标题 / note=正文 / category=标签） */
  function noteToEntry(note) {
    return {
      id: note.id,
      owner: note.title || '',
      account: '',
      password: '',
      url: '',
      category: note.tags || '',
      note: note.content || '',
      totp_secret: '',
      fav: 0,
      created_at: note.created_at,
      updated_at: note.updated_at,
      __note: note,
    };
  }

  /**
   * 多词检索便签：借助 PassSearch.searchEntries（多词 AND 模糊 + 打分排序）。
   * 返回 [{ note, score }]（分数降序）；空查询返回 null（调用方全量展示）。
   */
  function searchNotes(notes, query, PassSearch) {
    if (!PassSearch || typeof PassSearch.searchEntries !== 'function') return null;
    var pq = PassSearch.parseQuery(query);
    if (!pq.terms.length && !Object.keys(pq.filters).length) return null;
    var entries = (notes || []).map(noteToEntry);
    var res = PassSearch.searchEntries(entries, query) || [];
    return res.map(function (r) { return { note: r.entry.__note, score: r.score }; });
  }

  return {
    NOTES_SCHEMA_SQL: NOTES_SCHEMA_SQL,
    SOURCES: SOURCES,
    applyNotesSchema: applyNotesSchema,
    parsePendingQueue: parsePendingQueue,
    consumePending: consumePending,
    titleOf: titleOf,
    previewText: previewText,
    noteToEntry: noteToEntry,
    searchNotes: searchNotes,
  };
});
