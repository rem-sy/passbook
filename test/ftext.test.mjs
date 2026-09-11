import test from 'node:test';
import assert from 'node:assert/strict';

/* v4.5.0 内容检索纯函数补测：装载同 filehub.test.mjs 惯例 */
globalThis.window = globalThis;
const fs = (await import('node:fs'));
(0, eval)(fs.readFileSync(new URL('../public/filehub.js', import.meta.url), 'utf8'));
(0, eval)(fs.readFileSync(new URL('../public/search.js', import.meta.url), 'utf8'));
const P = globalThis.window.PassFiles;
const PassSearch = globalThis.window.PassSearch;

const mk = (id, name, tags, ftext) => ({
  id, name, mime: '', size: 10, sha256: (String(id) + '0'.repeat(64)).slice(0, 64),
  source: 'saf', tags: tags || '', note: '', created_at: '2025-01-01T00:00:00Z', ftext: ftext || '',
});

/* ---------- xmlToText（OOXML 正文抽取核心） ---------- */

test('xmlToText：docx 段落 XML → 换行文本 + 实体还原', () => {
  const xml = '<w:document><w:body>'
    + '<w:p><w:r><w:t>第一段</w:t></w:r><w:r><w:t>同行拼接</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>第二段 &amp; 引用 &lt;tag&gt; A&quot;B</w:t></w:r></w:p>'
    + '</w:body></w:document>';
  const t = P.xmlToText(xml);
  assert.ok(t.includes('第一段同行拼接'));
  assert.ok(t.includes('第二段 & 引用 <tag> A"B'));
  assert.equal(t.split('\n').length, 2);
});

test('xmlToText：pptx（a:p）与数字实体、压平空白', () => {
  const xml = '<a:p><a:t>幻灯  </a:t><a:t>片一</a:t></a:p><a:p><a:t>第二&#10;行&#65;</a:t></a:p>';
  const t = P.xmlToText(xml);
  assert.ok(t.startsWith('幻灯 片一'));
  assert.ok(t.includes('第二\n行A'));
});

test('xmlToText：空/无文本 XML 返回空串', () => {
  assert.equal(P.xmlToText('<w:p/>'), '');
  assert.equal(P.xmlToText(''), '');
  assert.equal(P.xmlToText(null), '');
});

/* ---------- capText ---------- */

test('capText：超长截断、默认上限、空安全', () => {
  assert.equal(P.capText('abc'), 'abc');
  assert.equal(P.capText('abcdefghij', 4), 'abcd');
  assert.equal(P.capText(null), '');
  const big = 'x'.repeat(P.FTEXT_CAP + 100);
  assert.equal(P.capText(big).length, P.FTEXT_CAP);
  assert.equal(P.FTEXT_CAP, 256 * 1024);
});

/* ---------- slideKeyOrder ---------- */

test('slideKeyOrder：数值序（slide10 排在 slide2 后）', () => {
  const names = ['ppt/slides/slide10.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide1.xml'];
  assert.deepEqual([...names].sort(P.slideKeyOrder),
    ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide10.xml']);
});

/* ---------- snippetOf ---------- */

test('snippetOf：首个命中词上下文片段 + 未命中 null', () => {
  const text = '前情提要省略。这里提到预算追加百分之八，需要王工确认。后续内容省略。';
  const sn = P.snippetOf(text, ['不存在', '预算追加']);
  assert.ok(sn.includes('预算追加'));
  assert.ok(sn.startsWith('…') || sn.includes('前情')); // 命中在开头附近 → 无前省略号
  assert.ok(sn.includes('王工'));
  assert.ok(sn.length <= text.length);
  // 长文本：片段有界（radius=10 时远小于全文）
  const long = '零'.repeat(300) + '预算追加' + '一'.repeat(300);
  const sn2 = P.snippetOf(long, ['预算追加'], 10);
  assert.ok(sn2.length < 40 && sn2.startsWith('…') && sn2.endsWith('…') && sn2.includes('预算追加'));
  assert.equal(P.snippetOf(text, ['zzz']), null);
  assert.equal(P.snippetOf('', ['a']), null);
  assert.equal(P.snippetOf(text, []), null);
});

/* ---------- searchFiles：内容命中合并 ---------- */

test('searchFiles：正文 ftext 命中全部词 → 合并返回并标记 contentHit', () => {
  const files = [
    mk(1, '报告.pdf', '健康', '体检结论血脂略高建议复查'),
    mk(2, '预算.xlsx', '财务', '预算追加百分之八待确认'),
    mk(3, '合同.docx', '工作', '租赁合同租金五千六'),
  ];
  // 名称命中（正常管线）
  let r = P.searchFiles(files, '合同', PassSearch);
  assert.equal(r.length, 1);
  assert.equal(r[0].file.id, 3);
  assert.equal(r[0].contentHit, false);
  // 内容命中：名称不含「血脂」但正文含
  r = P.searchFiles(files, '血脂', PassSearch);
  assert.equal(r.length, 1);
  assert.equal(r[0].file.id, 1);
  assert.equal(r[0].contentHit, true);
  // 多词 AND：两个词都在正文
  r = P.searchFiles(files, '预算 追加', PassSearch);
  assert.equal(r.length, 1);
  assert.equal(r[0].file.id, 2);
  // 多词 AND：一个在名称一个在正文 → 两边都不算命中（保持语义简单可测）
  r = P.searchFiles(files, '合同 租金', PassSearch);
  assert.equal(r.length, 1); // 「合同 租金」都在 ftext（租金五千六）→ 内容命中
  // opts.content=false 关闭内容检索
  r = P.searchFiles(files, '血脂', PassSearch, { content: false });
  assert.equal(r.length, 0);
  // 无 ftext 字段（v4.4 老行未迁移语义）不炸
  const old = files.map((f) => { const { ftext, ...rest } = f; return rest; });
  r = P.searchFiles(old, '血脂', PassSearch);
  assert.equal(r.length, 0);
});


/* ---------- v4.6.0 跨类型分类体系：标签串处理与三源聚合 ---------- */

test('tagsSplit/tagsJoin：容错分隔（逗号/中文逗号/顿号/空白）、去重保序、规范串', () => {
  assert.deepEqual(P.tagsSplit('工作, 个人，工作、灵感  生活'), ['工作', '个人', '灵感', '生活']);
  assert.deepEqual(P.tagsSplit('工作 灵感'), ['工作', '灵感']); // 空格分隔的存量数据
  assert.deepEqual(P.tagsSplit(''), []);
  assert.deepEqual(P.tagsSplit(null), []);
  assert.equal(P.tagsJoin(['工作', '工作', '灵感']), '工作,灵感');
  assert.equal(P.tagsJoin('工作、灵感'), '工作,灵感'); // 规范化
});

test('renameTagInTags / removeTagInTags：命中改写、未命中 null', () => {
  assert.equal(P.renameTagInTags('工作, 灵感', '工作', '职场'), '职场,灵感');
  assert.equal(P.renameTagInTags('工作、灵感', '工作', '职场'), '职场,灵感'); // 顿号分隔也命中
  assert.equal(P.renameTagInTags('灵感', '工作', '职场'), null);
  assert.equal(P.removeTagInTags('工作, 灵感', '工作'), '灵感');
  assert.equal(P.removeTagInTags('工作', '工作'), '');
  assert.equal(P.removeTagInTags('灵感', '工作'), null);
});

test('unionTagCounts：三源并集聚合（总数与分源计数）', () => {
  const pass = [{ category: '工作,个人' }, { category: '工作' }, { category: '财务' }];
  const notes = [{ tags: '工作 灵感' }, { tags: '灵感' }];
  const files = [{ tags: '工作,财务' }];
  const u = P.unionTagCounts([
    { items: pass, field: 'category', splitter: PassSearch.catSplit },
    { items: notes, field: 'tags' },
    { items: files, field: 'tags' },
  ]);
  assert.equal(u['工作'].total, 4);
  assert.deepEqual(u['工作'].by, [2, 1, 1]);
  assert.equal(u['灵感'].total, 2);
  assert.equal(u['灵感'].by[0], undefined); // 稀疏数组：未出现的源为空位
  assert.equal(u['灵感'].by[1], 2);
  assert.equal(u['灵感'].by[2], undefined);
  assert.equal(u['财务'].total, 2);
  assert.equal(u['个人'].total, 1);
  assert.deepEqual(P.unionTagCounts([]), {});
  // 默认 splitter = tagsSplit（容错空格）
  const u2 = P.unionTagCounts([{ items: [{ tags: 'a b' }] }]);
  assert.equal(u2['a'].total, 1);
});

/* ---------- v4.6.1 zip 解析（文件仓导入） ---------- */

test('parseZip：buildZip 产物往返还原（manifest + blobs 中文与二进制）', () => {
  const enc = new TextEncoder();
  const blob = new Uint8Array([0, 1, 2, 250, 251, 253, 0, 99]);
  const zip = P.buildZip([
    { name: 'manifest.json', bytes: enc.encode('{"files_salt":"QUJD","files":[{"name":"报告.pdf"}]}') },
    { name: 'blobs/' + 'ab'.padEnd(64, '0'), bytes: blob },
  ]);
  const r = P.parseZip(zip);
  assert.equal(r.ok, true);
  assert.equal(r.files.length, 2);
  assert.equal(r.files[0].name, 'manifest.json');
  assert.equal(new TextDecoder().decode(r.files[0].bytes).includes('报告.pdf'), true);
  assert.equal(r.files[1].name, 'blobs/' + 'ab'.padEnd(64, '0'));
  assert.deepEqual(Array.from(r.files[1].bytes), Array.from(blob));
});

test('parseZip：坏输入与截断报错', () => {
  assert.equal(P.parseZip(new Uint8Array(4)).ok, false);
  assert.equal(P.parseZip(new TextEncoder().encode('not a zip at all........')).ok, false);
  const zip = P.buildZip([{ name: 'a', bytes: new Uint8Array([1]) }]);
  assert.equal(P.parseZip(zip.subarray(0, zip.length - 5)).ok, false); // 截掉 EOCD
});
