import test from 'node:test';
import assert from 'node:assert/strict';

/* filehub.js / search.js 纯函数在 Node 的装载（同 notes.test.mjs 惯例：eval + window） */
globalThis.window = globalThis;
const fs = (await import('node:fs'));
(0, eval)(fs.readFileSync(new URL('../public/filehub.js', import.meta.url), 'utf8'));
(0, eval)(fs.readFileSync(new URL('../public/search.js', import.meta.url), 'utf8'));
const P = globalThis.window.PassFiles;
const PassSearch = globalThis.window.PassSearch;

/* sql.js：真库验证迁移幂等（同 notes.test.mjs） */
const vm = (await import('node:vm'));
const { createRequire } = await import('node:module');
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
vm.runInThisContext(fs.readFileSync(new URL('../public/lib/sql-wasm.js', import.meta.url), 'utf8'), { filename: 'sql-wasm.js' });
const SQL = await globalThis.initSqlJs({ locateFile: (f) => 'public/lib/' + f });

const SHA_A = 'ab'.padEnd(64, '0');
const SHA_B = 'cd'.padEnd(64, '1');
const SHA_C = ('ef' + 'f'.repeat(62));

/* ---------- 元数据行构建 ---------- */

test('buildMetaRow：正常构建（mime 缺省按扩展名推导 / size 归一 / source 归一）', () => {
  const r = P.buildMetaRow({ name: '报告.pdf', size: '1024', sha256: SHA_A, source: 'wechat', tags: '工作' });
  assert.equal(r.name, '报告.pdf');
  assert.equal(r.mime, 'application/pdf'); // 无 mime 按扩展名
  assert.equal(r.size, 1024);              // 字符串数字归一
  assert.equal(r.sha256, SHA_A);
  assert.equal(r.source, 'wechat');
  assert.ok(r.created_at);
  const r2 = P.buildMetaRow({ name: '照片', mime: 'IMAGE/JPEG', size: -5, sha256: SHA_B, source: 'troll' });
  assert.equal(r2.mime, 'image/jpeg');     // 小写归一
  assert.equal(r2.size, 0);                // 负数归 0
  assert.equal(r2.source, 'other');        // 非法 source 归 other
});

test('buildMetaRow：缺文件名 / 非法 sha256 抛错', () => {
  assert.throws(() => P.buildMetaRow({ name: '', sha256: SHA_A }), /文件名/);
  assert.throws(() => P.buildMetaRow({ name: 'a.pdf', sha256: 'xyz' }), /sha256/);
  assert.throws(() => P.buildMetaRow({ name: 'a.pdf', sha256: SHA_A.slice(0, 63) }), /sha256/);
  assert.throws(() => P.buildMetaRow({ name: 'a.pdf', sha256: 'g'.repeat(64) }), /sha256/);
  // 大写十六进制合法（内部小写归一）
  assert.equal(P.buildMetaRow({ name: 'a.pdf', sha256: SHA_A.toUpperCase() }).sha256, SHA_A);
});

/* ---------- 桶路径（两位前缀分桶） ---------- */

test('bucketPath：<sha256前两位>/<sha256>，大写归一，非法抛错', () => {
  assert.equal(P.bucketPath(SHA_A), 'ab/' + SHA_A);
  assert.equal(P.bucketPath(SHA_B), 'cd/' + SHA_B);
  assert.equal(P.bucketPath(SHA_C.toUpperCase()), 'ef/' + SHA_C);
  assert.throws(() => P.bucketPath('zz'), /sha256/);
  assert.throws(() => P.bucketPath('g'.repeat(64)), /sha256/);
});

/* ---------- sha256 去重与引用计数删除 ---------- */

test('dupCount / dupHint：同内容条数与提示文案', () => {
  const rows = [
    { sha256: SHA_A }, { sha256: SHA_A }, { sha256: SHA_B },
  ];
  assert.equal(P.dupCount(rows, SHA_A), 2);
  assert.equal(P.dupCount(rows, SHA_B), 1);
  assert.equal(P.dupCount(rows, SHA_C), 0);
  assert.equal(P.dupHint(0), null);
  assert.equal(P.dupHint(2), '与已有 2 个文件内容相同（同内容共用一份加密存储）');
});

test('shouldDeleteBlob：最后一条引用删掉才物理删本体', () => {
  assert.equal(P.shouldDeleteBlob([]), true);            // 无剩余引用 → 删本体
  assert.equal(P.shouldDeleteBlob([{ sha256: SHA_A }]), false); // 还有引用 → 保留本体
});

/* ---------- 文件检索（PassSearch 多词管线：名称+备注+标签+来源） ---------- */

test('searchFiles：多词 AND 模糊命中 名称/备注/标签/来源', () => {
  const files = [
    { id: 1, name: '2025 体检报告.pdf', note: '医院出的', tags: '健康', source: 'wechat', created_at: '2025-01-01T00:00:00Z' },
    { id: 2, name: '排期表.xlsx', note: '', tags: '工作', source: 'qq', created_at: '2025-01-02T00:00:00Z' },
    { id: 3, name: '合同.docx', note: '甲方腾讯', tags: '工作', source: 'open', created_at: '2025-01-03T00:00:00Z' },
  ];
  let r = P.searchFiles(files, '体检', PassSearch);
  assert.equal(r.length, 1);
  assert.equal(r[0].file.id, 1);
  r = P.searchFiles(files, '工作 排期', PassSearch); // 多词 AND：名称+标签
  assert.equal(r.length, 1);
  assert.equal(r[0].file.id, 2);
  r = P.searchFiles(files, '微信', PassSearch);      // 来源中文标签命中
  assert.equal(r.length, 1);
  assert.equal(r[0].file.id, 1);
  r = P.searchFiles(files, '甲方', PassSearch);      // 备注命中
  assert.equal(r.length, 1);
  assert.equal(r[0].file.id, 3);
  assert.equal(P.searchFiles(files, '', PassSearch), null); // 空查询 → 全量展示信号
});

/* ---------- 预览类型判定矩阵（含 ACTION_VIEW mime 表覆盖） ---------- */

test('previewKind：矩阵——pdf/docx/xlsx/md/img/text/system', () => {
  assert.equal(P.previewKind('application/pdf', 'a.pdf'), 'inline-pdf');
  assert.equal(P.previewKind('', 'b.PDF'), 'inline-pdf'); // 扩展名兜底
  assert.equal(P.previewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx'), 'inline-docx');
  assert.equal(P.previewKind('', 'x.docx'), 'inline-docx');
  assert.equal(P.previewKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx'), 'inline-xlsx');
  assert.equal(P.previewKind('', 'x.XLSX'), 'inline-xlsx');
  assert.equal(P.previewKind('text/markdown', 'note.md'), 'inline-md');
  assert.equal(P.previewKind('', 'README.markdown'), 'inline-md');
  assert.equal(P.previewKind('image/png', 'p.png'), 'inline-img');
  assert.equal(P.previewKind('', 'p.webp'), 'inline-img');
  assert.equal(P.previewKind('text/plain', 'a.txt'), 'text');
  assert.equal(P.previewKind('text/csv', 'a.csv'), 'text');
  assert.equal(P.previewKind('application/json', 'a.json'), 'text');
  // 旧二进制格式与 pptx：不做内置渲染 → system（保存 + 系统打开）
  assert.equal(P.previewKind('application/msword', 'old.doc'), 'system');
  assert.equal(P.previewKind('application/vnd.ms-excel', 'old.xls'), 'system');
  assert.equal(P.previewKind('application/vnd.ms-powerpoint', 'old.ppt'), 'system');
  assert.equal(P.previewKind('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'p.pptx'), 'system');
  assert.equal(P.previewKind('application/zip', 'z.zip'), 'system');
  assert.equal(P.previewKind('', 'noext'), 'system');
});

test('VIEW_MIMES：与预览矩阵一致（VIEW 通道 mime 覆盖判定所用的同一张表）', () => {
  // manifest ACTION_VIEW 过滤器与本表共用；doc/ppt/pptx 允许进（走系统打开），渲染侧判 system
  const must = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'text/markdown',
    'text/plain',
  ];
  for (const m of must) assert.ok(P.VIEW_MIMES.includes(m), '缺少 ' + m);
});

/* ---------- 来源识别（包名 → source） ---------- */

test('detectSource：微信/QQ 包名识别，识别不了归 other', () => {
  assert.equal(P.detectSource('com.tencent.mm'), 'wechat');
  assert.equal(P.detectSource('com.tencent.mm.longer'), 'wechat');
  assert.equal(P.detectSource('com.tencent.mobileqq'), 'qq');
  assert.equal(P.detectSource('com.tencent.tim'), 'qq');
  assert.equal(P.detectSource('com.other.app'), 'other');
  assert.equal(P.detectSource(''), 'other');
  assert.equal(P.detectSource(null), 'other');
});

/* ---------- pending 文件队列解析（容错） ---------- */

test('parsePendingFiles：合法行解析 + open 标记 + 容错', () => {
  const text = [
    JSON.stringify({ name: 'a.pdf', mime: 'application/pdf', size: 12, sha256: SHA_A, source: 'wechat', tempPath: '/tmp/a', open: false, ts: 1 }),
    JSON.stringify({ name: 'b.docx', size: 34, sha256: SHA_B, source: 'open', tempPath: '/tmp/b', open: true }),
    '',
    '{"name":"截断',
    JSON.stringify({ name: 'no-sha', tempPath: '/tmp/c' }),
    JSON.stringify({ name: 'no-temp', sha256: SHA_C }),
    'garbage',
  ].join('\n');
  const r = P.parsePendingFiles(text);
  assert.equal(r.items.length, 2);
  assert.equal(r.skipped, 4);
  assert.equal(r.items[0].source, 'wechat');
  assert.equal(r.items[0].open, false);
  assert.equal(r.items[1].open, true);
  assert.equal(r.items[1].source, 'open');
  assert.deepEqual(P.parsePendingFiles(''), { items: [], skipped: 0 });
});

/* ---------- 换密钥重加密任务列表 ---------- */

test('reencryptTasks：按 sha256 去重生成任务，脏数据过滤计数', () => {
  const rows = [
    { sha256: SHA_A }, { sha256: SHA_A }, { sha256: SHA_B }, { sha256: '' }, null, { sha256: 'bad' },
  ];
  const r = P.reencryptTasks(rows);
  assert.equal(r.tasks.length, 2);
  assert.deepEqual(r.tasks[0], { sha256: SHA_A, bucket: 'ab/' + SHA_A });
  assert.deepEqual(r.tasks[1], { sha256: SHA_B, bucket: 'cd/' + SHA_B });
  assert.equal(r.invalid, 3); // 空串 / null / 非法串（重复条不算 invalid）
  // 也接受纯 sha 列表
  const r2 = P.reencryptTasks([SHA_A, SHA_A, SHA_C]);
  assert.equal(r2.tasks.length, 2);
});

/* ---------- store-only ZIP 构建（文件仓导出） ---------- */

test('buildZip：store-only zip 结构与 CRC（PK 头/EOCD/可被中心目录描述）', () => {
  const enc = new TextEncoder();
  const files = [
    { name: 'manifest.json', bytes: enc.encode('{"ok":true}') },
    { name: 'blobs/' + SHA_A, bytes: new Uint8Array([1, 2, 3, 4, 5]) },
  ];
  const zip = P.buildZip(files);
  assert.equal(zip[0], 0x50); assert.equal(zip[1], 0x4b); // PK
  assert.equal(zip[2], 0x03); assert.equal(zip[3], 0x04); // local file header
  const s = Buffer.from(zip);
  const eocd = s.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, 'EOCD 存在');
  assert.equal(s.readUInt16LE(eocd + 10), 2);  // 本条目数
  assert.equal(s.readUInt16LE(eocd + 8), 2);   // 总条目数
  const cdOff = s.readUInt32LE(eocd + 16);
  assert.equal(s.readUInt32LE(cdOff), 0x02014b50); // 中心目录头
  // store：压缩后大小 == 原始大小
  const lfhSize = s.readUInt32LE(4 + 18 + 13 + 9 + 5); // 粗查：用中心目录读
  const cd = cdOff;
  assert.equal(s.readUInt32LE(cd + 20), s.readUInt32LE(cd + 24)); // crc 对应
  // 解回内容验证（局部头之后紧跟文件名+数据）
  const nameLen = s.readUInt16LE(26);
  assert.equal(s.toString('utf8', 30, 30 + nameLen), 'manifest.json');
  const dataStart = 30 + nameLen;
  assert.equal(s.subarray(dataStart, dataStart + 11).toString(), '{"ok":true}'); // 11 字节
  // CRC32 基准值
  assert.equal(P.crc32(new Uint8Array([0])), 0xd202ef8d);
});

/* ---------- FILES_SCHEMA_SQL：真库迁移幂等 + CRUD + 引用计数删除判定 ---------- */

test('FILES_SCHEMA_SQL：空库执行三次幂等，files/file_kv CRUD 正常', () => {
  const db = new SQL.Database();
  db.run(P.FILES_SCHEMA_SQL);
  db.run(P.FILES_SCHEMA_SQL); // 重入
  db.run(P.FILES_SCHEMA_SQL); // 再重入
  const ins = (name, sha, source) => {
    const r = P.buildMetaRow({ name, size: 10, sha256: sha, source });
    db.run('INSERT INTO files (name, mime, size, sha256, source, tags, note, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [r.name, r.mime, r.size, r.sha256, r.source, r.tags, r.note, r.created_at]);
  };
  ins('a.pdf', SHA_A, 'saf');
  ins('b.pdf', SHA_A, 'drag');
  db.run('INSERT INTO file_kv (k, v) VALUES (?, ?)', ['files_salt', 'AAAA']);
  db.run("INSERT INTO file_kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", ['files_salt', 'BBBB']);
  const stmt = db.prepare('SELECT COUNT(*) AS n FROM files WHERE sha256 = ?');
  stmt.bind([SHA_A]);
  stmt.step();
  const n = stmt.getAsObject().n;
  stmt.free();
  assert.equal(n, 2);
  // 引用计数删除：删一行后剩余同 sha 行 → 本体保留；再删 → 本体删
  const rest = (rows, sha, delId) => rows.filter((r) => r.sha256 === sha && r.id !== delId);
  assert.equal(P.shouldDeleteBlob(rest([{ id: 1, sha256: SHA_A }, { id: 2, sha256: SHA_A }], SHA_A, 1)), false);
  assert.equal(P.shouldDeleteBlob(rest([{ id: 2, sha256: SHA_A }], SHA_A, 2)), true);
  // file_kv 唯一键 upsert
  const kv = db.prepare('SELECT v FROM file_kv WHERE k = ?');
  kv.bind(['files_salt']); kv.step();
  assert.equal(kv.getAsObject().v, 'BBBB');
  kv.free();
});

/* ---------- 轻量 Markdown 渲染 ---------- */

test('mdToHtml：标题/列表/代码块/粗斜体/链接/表格基本集 + 转义', () => {
  const html = P.mdToHtml([
    '# 标题',
    '',
    '**粗体** 与 *斜体* 和 `code`',
    '- 甲',
    '- 乙',
    '',
    '1. 一',
    '2. 二',
    '',
    '```',
    '<script>alert(1)</script>',
    '```',
    '',
    '[链接](https://example.com)',
    '',
    '| A | B |',
    '|---|---|',
    '| 1 | 2 |',
  ].join('\n'));
  assert.ok(html.includes('<h1>标题</h1>'));
  assert.ok(html.includes('<strong>粗体</strong>'));
  assert.ok(html.includes('<em>斜体</em>'));
  assert.ok(html.includes('<code>code</code>'));
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('<li>甲</li>'));
  assert.ok(html.includes('<ol>'));
  assert.ok(html.includes('<pre><code>&lt;script&gt;')); // 代码块内转义，杜绝注入
  assert.ok(html.includes('<a href="https://example.com"'));
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('<th>A</th>'));
  assert.ok(html.includes('<td>2</td>'));
  // 正文里的尖括号同样转义
  assert.ok(P.mdToHtml('a < b & c').includes('a &lt; b &amp; c'));
});

/* ---------- mimeFromName / formatSize ---------- */

test('mimeFromName / formatSize：扩展名推导与人类可读大小', () => {
  assert.equal(P.mimeFromName('a.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(P.mimeFromName('b.md'), 'text/markdown');
  assert.equal(P.mimeFromName('c.unknownext'), '');
  assert.equal(P.mimeFromName('noext'), '');
  assert.equal(P.formatSize(512), '512 B');
  assert.equal(P.formatSize(2048), '2.0 KB');
  assert.equal(P.formatSize(5 * 1024 * 1024), '5.0 MB');
});
