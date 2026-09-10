import test from 'node:test';
import assert from 'node:assert/strict';

/* notes.js / search.js 纯函数在 Node 的装载（同 importer.test.mjs 惯例：eval + window） */
globalThis.window = globalThis;
const fs = (await import('node:fs'));
(0, eval)(fs.readFileSync(new URL('../public/notes.js', import.meta.url), 'utf8'));
(0, eval)(fs.readFileSync(new URL('../public/search.js', import.meta.url), 'utf8'));
const P = globalThis.window.PassNotes;
const PassSearch = globalThis.window.PassSearch;

/* sql.js：真库验证迁移幂等（与 LocalStore.init() 同一套 IF NOT EXISTS 语义）。
 * sql-wasm.js 含 require 探测，与 ESM 顶层 await 同处会触发模块格式歧义，
 * 用 vm.runInThisContext 按经典脚本装载（(0,eval) 的替代）。 */
const vm = (await import('node:vm'));
const { createRequire } = await import('node:module');
// sql-wasm.js 的 Node 分支用到自由变量 require / __dirname —— 注入 ESM 等价物
// （直接在带顶层 await 的 ESM 里 eval 会触发 Node 模块格式歧义检测）
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
vm.runInThisContext(fs.readFileSync(new URL('../public/lib/sql-wasm.js', import.meta.url), 'utf8'), { filename: 'sql-wasm.js' });
const SQL = await globalThis.initSqlJs({ locateFile: (f) => 'public/lib/' + f });

/* ---------- pending 队列解析（JSON 行，容错空行/截断行） ---------- */

test('parsePendingQueue：合法 JSON 行解析 + source 归一化', () => {
  const text = [
    JSON.stringify({ content: '第一条', source: 'clipboard', ts: 1 }),
    JSON.stringify({ content: '来自分享', source: 'share', ts: 2 }),
    JSON.stringify({ content: '未知来源按 clipboard 不对——应归一 manual', source: 'wechat' }),
  ].join('\n');
  const r = P.parsePendingQueue(text);
  assert.equal(r.items.length, 3);
  assert.equal(r.skipped, 0);
  assert.equal(r.items[0].content, '第一条');
  assert.equal(r.items[0].source, 'clipboard');
  assert.equal(r.items[1].source, 'share');
  assert.equal(r.items[2].source, 'manual'); // 非法 source 归一 manual
});

test('parsePendingQueue：空行 / 截断行 / 损坏行 / 缺 content 跳过', () => {
  const text = [
    '',
    '   ',
    JSON.stringify({ content: '正常', source: 'clipboard' }),
    '{"content":"截断的行没有闭合',             // 写入中断的截断行
    '}}}不是json{{{',                          // 彻底损坏
    JSON.stringify({ no_content: 1 }),          // 缺 content
    JSON.stringify({ content: '   ' }),         // 空白 content
    '',
  ].join('\n');
  const r = P.parsePendingQueue(text);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].content, '正常');
  assert.equal(r.skipped, 4);
});

test('parsePendingQueue：空输入与纯空白输入', () => {
  assert.deepEqual(P.parsePendingQueue(''), { items: [], skipped: 0 });
  assert.deepEqual(P.parsePendingQueue(null), { items: [], skipped: 0 });
  assert.deepEqual(P.parsePendingQueue('\n\n \n'), { items: [], skipped: 0 });
});

/* ---------- 队列消费与去重 ---------- */

test('consumePending：队列内同内容去重（source 参与键）', () => {
  const text = [
    JSON.stringify({ content: '同一段文字', source: 'clipboard' }),
    JSON.stringify({ content: '同一段文字', source: 'clipboard' }), // 完全重复
    JSON.stringify({ content: '同一段文字', source: 'share' }),      // 来源不同保留
  ].join('\n');
  const r = P.consumePending(text, []);
  assert.equal(r.toInsert.length, 2);
  assert.equal(r.dup, 1);
  assert.equal(r.toInsert[0].source, 'clipboard');
  assert.equal(r.toInsert[1].source, 'share');
});

test('consumePending：与已有便签内容去重 + 跳过计数透传', () => {
  const text = [
    JSON.stringify({ content: '库里已有的便签', source: 'clipboard' }),
    JSON.stringify({ content: '新内容', source: 'share' }),
    '{"broken":', // 截断行计入 skipped
  ].join('\n');
  const existing = new Set(['库里已有的便签']);
  const r = P.consumePending(text, existing);
  assert.equal(r.toInsert.length, 1);
  assert.equal(r.toInsert[0].content, '新内容');
  assert.equal(r.dup, 1);
  assert.equal(r.skipped, 1);
});

test('consumePending：标题取内容首个非空行并截 30 字', () => {
  const long = 'x'.repeat(50);
  const r = P.consumePending(JSON.stringify({ content: '\n\n  \n标题行\n正文第二行', source: 'clipboard' }), []);
  assert.equal(r.toInsert[0].title, '标题行');
  const r2 = P.consumePending(JSON.stringify({ content: long, source: 'clipboard' }), []);
  assert.equal(r2.toInsert[0].title, 'x'.repeat(30) + '…');
});

test('previewText：压平空白 + 截 80 字', () => {
  assert.equal(P.previewText('a\n b   c'), 'a b c');
  assert.equal(P.previewText('字'.repeat(100)).length, 81); // 80 + 省略号
  assert.equal(P.previewText('字'.repeat(100)).endsWith('…'), true);
  assert.equal(P.previewText('短文本'), '短文本');
});

/* ---------- 便签检索（复用 PassSearch 多词管线） ---------- */

const NOTES = [
  { id: 1, title: '会议要点', content: '周三发布新版本，通知测试组', tags: '工作', source: 'manual', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 2, title: '快递单号', content: 'SF1234567890 顺丰', tags: '生活', source: 'clipboard', created_at: '2026-01-02', updated_at: '2026-01-02' },
  { id: 3, title: '灵感', content: '密码本可以加一个文件仓', tags: '灵感', source: 'share', created_at: '2026-01-03', updated_at: '2026-01-03' },
];

test('searchNotes：单词命中标题/正文/标签', () => {
  const r = P.searchNotes(NOTES, '会议', PassSearch);
  assert.ok(r);
  assert.equal(r.length, 1);
  assert.equal(r[0].note.id, 1);

  const r2 = P.searchNotes(NOTES, '顺丰', PassSearch); // 正文命中
  assert.equal(r2.length, 1);
  assert.equal(r2[0].note.id, 2);

  const r3 = P.searchNotes(NOTES, '灵感', PassSearch); // 标签命中（category 字段）
  assert.ok(r3.some((x) => x.note.id === 3));
});

test('searchNotes：多词 AND 语义', () => {
  const r = P.searchNotes(NOTES, '会议 发布', PassSearch);
  assert.equal(r.length, 1);
  assert.equal(r[0].note.id, 1);
  // 两词分布在不同便签 → 无人同时满足
  assert.equal(P.searchNotes(NOTES, '会议 快递', PassSearch).length, 0);
});

test('searchNotes：空查询返回 null（调用方全量展示）', () => {
  assert.equal(P.searchNotes(NOTES, '', PassSearch), null);
  assert.equal(P.searchNotes(NOTES, '   ', PassSearch), null);
});

test('searchNotes：noteToEntry 不丢原对象引用', () => {
  const e = P.noteToEntry(NOTES[0]);
  assert.equal(e.__note, NOTES[0]);
  assert.equal(e.owner, '会议要点');
  assert.equal(e.category, '工作');
});

/* ---------- 迁移幂等（真 sql.js 库） ---------- */

test('NOTES_SCHEMA_SQL：空库执行两次幂等，CRUD 正常', () => {
  const db = new SQL.Database();
  db.run(P.NOTES_SCHEMA_SQL);
  db.run(P.NOTES_SCHEMA_SQL); // 重入
  db.run(P.NOTES_SCHEMA_SQL); // 再重入
  db.run("INSERT INTO notes (title, content, tags, source, created_at, updated_at) VALUES ('t', 'c', 'g', 'clipboard', '2026-01-01', '2026-01-01')");
  const stmt = db.prepare('SELECT * FROM notes');
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  assert.equal(row.title, 't');
  assert.equal(row.source, 'clipboard');
  // 幂等重跑不破坏已有数据
  db.run(P.NOTES_SCHEMA_SQL);
  const stmt2 = db.prepare('SELECT COUNT(*) AS n FROM notes');
  stmt2.step();
  assert.equal(stmt2.getAsObject().n, 1);
  stmt2.free();
  db.close();
});

test('applyNotesSchema：配合 tableExists 首建判定', () => {
  const db = new SQL.Database();
  const exists = (t) => {
    const s = db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='${t}'`);
    s.step(); const r = s.getAsObject(); s.free(); return r.n > 0;
  };
  assert.equal(P.applyNotesSchema((sql) => db.run(sql), exists), true);  // 首次：无表 → true
  assert.equal(P.applyNotesSchema((sql) => db.run(sql), exists), false); // 二次：已有 → false
  db.close();
});

test('entries+notes 混合 schema：notes 迁移不影响既有 entries 表', () => {
  const db = new SQL.Database();
  db.run('CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL)');
  db.run("INSERT INTO entries (owner, created_at) VALUES ('a', '2026-01-01')");
  db.run(P.NOTES_SCHEMA_SQL);
  db.run(P.NOTES_SCHEMA_SQL);
  const s1 = db.prepare('SELECT COUNT(*) AS n FROM entries'); s1.step();
  assert.equal(s1.getAsObject().n, 1); s1.free();
  const s2 = db.prepare('SELECT COUNT(*) AS n FROM notes'); s2.step();
  assert.equal(s2.getAsObject().n, 0); s2.free();
  db.close();
});
