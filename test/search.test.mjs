import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/search.js');
const S = globalThis.PassSearch;

test('parseQuery：普通词', () => {
  const r = S.parseQuery('github 工作');
  assert.deepEqual(r.terms, ['github', '工作']);
  assert.deepEqual(r.filters, {});
});

test('parseQuery：分类操作符（中文冒号词 + 引号）', () => {
  const r = S.parseQuery('分类:工作 github');
  assert.equal(r.filters.category, '工作');
  assert.deepEqual(r.terms, ['github']);
  const r2 = S.parseQuery('"分类:生活 备用" 邮箱');
  assert.equal(r2.filters.category, '生活 备用');
  assert.deepEqual(r2.terms, ['邮箱']);
});

test('parseQuery：category 英文别名与大小写', () => {
  const r = S.parseQuery('CATEGORY:Work x');
  assert.equal(r.filters.category, 'work');
});

test('parseQuery：有/无验证码', () => {
  assert.equal(S.parseQuery('有验证码').filters.hasTotp, true);
  assert.equal(S.parseQuery('无验证码').filters.hasTotp, false);
  assert.equal(S.parseQuery('totp').filters.hasTotp, true);
});

test('parseQuery：未识别操作符进 unknown 且不当词', () => {
  const r = S.parseQuery('foo:bar baz');
  assert.deepEqual(r.unknown, ['foo:bar']);
  assert.deepEqual(r.terms, ['baz']);
});

test('parseQuery：空查询', () => {
  const r = S.parseQuery('  ');
  assert.deepEqual(r.terms, []);
  assert.deepEqual(Object.keys(r.filters), []);
});

test('fuzzyMatch：子串命中给高分与单一区间', () => {
  const m = S.fuzzyMatch('git', 'github.com');
  assert.ok(m.score >= 100);
  assert.deepEqual(m.ranges, [[0, 3]]);
});

test('fuzzyMatch：前缀奖励高于中段', () => {
  const a = S.fuzzyMatch('git', 'github');
  const b = S.fuzzyMatch('hub', 'github');
  assert.ok(a.score > b.score);
});

test('fuzzyMatch：子序列命中（跳跃）', () => {
  // 'a2m' 在 'AES-256-GCM' 中为跳跃子序列（非连续子串）
  const m = S.fuzzyMatch('a2m', 'AES-256-GCM');
  assert.ok(m);
  assert.ok(m.score < 100);
  assert.ok(m.ranges.length >= 2);
});

test('fuzzyMatch：不命中返回 null', () => {
  assert.equal(S.fuzzyMatch('xyz', 'github'), null);
  assert.equal(S.fuzzyMatch('a', ''), null);
});

test('fuzzyMatch：大小写不敏感', () => {
  const m = S.fuzzyMatch('GIT', 'github');
  assert.deepEqual(m.ranges, [[0, 3]]);
});

const E = (o) => Object.assign({ owner: '', account: '', password: 'x', url: '', category: '', note: '', totp_secret: '' }, o);

test('scoreEntry：单词命中多字段取最高权重', () => {
  const r = S.scoreEntry(E({ owner: 'GitHub', account: 'github@mail.com' }), ['git'], {});
  assert.ok(r.score > 0);
  assert.ok(Array.isArray(r.fields.owner) || Array.isArray(r.fields.account));
});

test('scoreEntry：多词 AND 语义（一词未命中即 null）', () => {
  const e = E({ owner: 'GitHub 工作', note: 'hello' });
  assert.ok(S.scoreEntry(e, ['git', '工作'], {}));
  assert.equal(S.scoreEntry(e, ['git', '世界'], {}), null);
});

test('scoreEntry：分类过滤（不区分大小写）', () => {
  const e = E({ owner: 'a', category: 'Work' });
  assert.ok(S.scoreEntry(e, ['a'], { category: 'work' }));
  assert.equal(S.scoreEntry(e, ['a'], { category: 'life' }), null);
});

test('scoreEntry：hasTotp 过滤', () => {
  const withT = E({ owner: 'a', totp_secret: 'JBSWY3DPEHPK3PXP' });
  const noT = E({ owner: 'a' });
  assert.ok(S.scoreEntry(withT, ['a'], { hasTotp: true }));
  assert.equal(S.scoreEntry(noT, ['a'], { hasTotp: true }), null);
  assert.ok(S.scoreEntry(noT, ['a'], { hasTotp: false }));
});

test('searchEntries：按分数降序', () => {
  const list = [
    E({ id: 1, owner: 'note 里的 github 说明', note: 'x' }),
    E({ id: 2, owner: 'GitHub' }),
    E({ id: 3, owner: '别的' }),
  ];
  const r = S.searchEntries(list, 'github');
  assert.equal(r.length, 2);
  assert.equal(r[0].entry.id, 2);
  assert.ok(r[0].score >= r[1].score);
});

test('searchEntries：操作符组合（分类 + 词）', () => {
  const list = [
    E({ id: 1, owner: 'GitHub', category: 'Work' }),
    E({ id: 2, owner: 'GitHub', category: 'Life' }),
  ];
  const r = S.searchEntries(list, 'github 分类:work');
  assert.equal(r.length, 1);
  assert.equal(r[0].entry.id, 1);
});

test('searchEntries：空查询返回 null（不过滤语义）', () => {
  assert.equal(S.searchEntries([E({ owner: 'a' })], ''), null);
  assert.equal(S.searchEntries([E({ owner: 'a' })], '分类:x 有验证码').length >= 0, true);
});

test('highlightSegments：分段正确', () => {
  const segs = S.highlightSegments('github.com', [[0, 3]]);
  assert.deepEqual(segs, [
    { text: 'git', hit: true },
    { text: 'hub.com', hit: false },
  ]);
});

test('highlightSegments：多区间合并重叠', () => {
  const segs = S.highlightSegments('abcdefgh', [[1, 3], [2, 5], [6, 8]]);
  assert.deepEqual(segs, [
    { text: 'a', hit: false },
    { text: 'bcde', hit: true },
    { text: 'f', hit: false },
    { text: 'gh', hit: true },
  ]);
});

test('highlightSegments：无区间整段不命中', () => {
  assert.deepEqual(S.highlightSegments('abc', []), [{ text: 'abc', hit: false }]);
  assert.deepEqual(S.highlightHtml('abc', []), 'abc');
});

test('highlightHtml：转义 + mark 包裹', () => {
  const html = S.highlightHtml('a<b>c', [[2, 3]]);
  assert.equal(html, 'a&lt;<mark class="hl">b</mark>&gt;c');
});

test('parseQuery：收藏操作符（v2.7.0）', () => {
  const r = S.parseQuery('有收藏');
  assert.equal(r.filters.hasFav, true);
  assert.deepEqual(r.terms, []);
  const r2 = S.parseQuery('无收藏');
  assert.equal(r2.filters.hasFav, false);
  const r3 = S.parseQuery('github 收藏');
  assert.equal(r3.filters.hasFav, true);
  assert.deepEqual(r3.terms, ['github']);
});

test('scoreEntry：hasFav 过滤（v2.7.0）', () => {
  const fav = { owner: 'GitHub', account: 'a', password: 'p', fav: 1 };
  const nofav = { owner: 'WeChat', account: 'b', password: 'p', fav: 0 };
  assert.ok(S.scoreEntry(fav, [], { hasFav: true }));
  assert.equal(S.scoreEntry(nofav, [], { hasFav: true }), null);
  assert.ok(S.scoreEntry(nofav, [], { hasFav: false }));
  assert.equal(S.scoreEntry(fav, [], { hasFav: false }), null);
  // fav 缺省（旧数据）视为未收藏
  assert.equal(S.scoreEntry({ owner: 'x', fav: undefined }, [], { hasFav: true }), null);
});

test('searchEntries：有收藏 + 关键词组合（v2.7.0）', () => {
  const list = [
    { id: 1, owner: 'GitHub', account: 'a', password: 'p', fav: 1 },
    { id: 2, owner: 'GitLab', account: 'b', password: 'p', fav: 0 },
    { id: 3, owner: 'Gitee', account: 'c', password: 'p', fav: 1 },
  ];
  const out = S.searchEntries(list, 'git 有收藏');
  assert.deepEqual(out.map((r) => r.entry.id), [1, 3]);
});

test('extractDomain：域名提取（v2.7.0）', () => {
  assert.equal(S.extractDomain('https://github.com/login'), 'github.com');
  assert.equal(S.extractDomain('http://a.b.com'), 'a.b.com');
  assert.equal(S.extractDomain('github.com'), 'github.com'); // 无协议自动补
  assert.equal(S.extractDomain(''), '');
  assert.equal(S.extractDomain(null), '');
  assert.equal(S.extractDomain('not a url ..'), '');
});