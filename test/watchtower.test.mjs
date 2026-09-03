/**
 * 密码本 · 安全体检单元测试
 * 用法: node --disable-warning=ExperimentalWarning test/watchtower.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require(join(__dirname, '..', 'public', 'watchtower.js'));
const PassWatch = globalThis.PassWatch;

const NOW = Date.parse('2026-09-03T12:00:00Z');
function entry(over = {}) {
  return {
    id: over.id ?? 1,
    owner: over.owner ?? 'GitHub',
    account: over.account ?? 'user@example.com',
    password: over.password ?? 'Xy#k9$Lm2@pQ',
    url: over.url ?? 'https://github.com',
    category: over.category ?? '',
    note: over.note ?? '',
    created_at: over.created_at ?? '2026-08-01T00:00:00Z',
    updated_at: over.updated_at ?? '2026-09-01T00:00:00Z',
  };
}

test('analyze：健康条目零发现', () => {
  const r = PassWatch.analyze([entry()], { now: NOW });
  assert.equal(r.summary.high, 0);
  assert.equal(r.summary.medium, 0);
  assert.equal(r.summary.low, 0);
  assert.equal(r.findings.length, 0);
});

test('analyze：重复密码分组发现（2 条 = 中危，3 条 = 高危）', () => {
  const same = 'SamePw#2024';
  const r2 = PassWatch.analyze([entry({ id: 1, owner: 'A', password: same }), entry({ id: 2, owner: 'B', password: same })], { now: NOW });
  const f = r2.findings.filter((x) => x.type === 'reused');
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'medium');
  assert.deepEqual(f[0].entryIds.sort(), [1, 2]);

  const r3 = PassWatch.analyze([1, 2, 3].map((id) => entry({ id, password: same })), { now: NOW });
  assert.equal(r3.findings.find((x) => x.type === 'reused').level, 'high');
});

test('analyze：常见弱密码（词典命中 = 高危）', () => {
  for (const pw of ['123456', 'Password', 'P@SSW0RD', 'admin123']) {
    const r = PassWatch.analyze([entry({ password: pw })], { now: NOW });
    const f = r.findings.find((x) => x.type === 'weak');
    assert.ok(f, `应检出 ${pw}`);
    assert.equal(f.level, 'high');
    assert.equal(r.summary.high, 1);
  }
});

test('analyze：短密码（<8 位 = 高危）', () => {
  const r = PassWatch.analyze([entry({ password: 'Ab#9xz' })], { now: NOW });
  const f = r.findings.find((x) => x.type === 'weak');
  assert.ok(f);
  assert.equal(f.level, 'high');
});

test('analyze：复杂度不足（单一类别 / 短且类别少 = 低危）', () => {
  const r = PassWatch.analyze([entry({ password: 'onlylowercaselong' })], { now: NOW });
  const f = r.findings.find((x) => x.type === 'weak');
  assert.ok(f);
  assert.equal(f.level, 'low');
});

test('analyze：强密码不误报', () => {
  for (const pw of ['Tr0ub4dor&3xZ!', 'correct-horse-battery-9', 'Zx!9kLm2@pQw7#dR']) {
    const r = PassWatch.analyze([entry({ password: pw })], { now: NOW });
    assert.equal(r.findings.filter((x) => x.type === 'weak').length, 0, `${pw} 不应报弱`); 
  }
});

test('analyze：信息不完整（缺密码 = 中危；仅缺账户 = 低危）', () => {
  const r = PassWatch.analyze([entry({ password: '' }), entry({ id: 2, account: '' })], { now: NOW });
  const list = r.findings.filter((x) => x.type === 'incomplete');
  assert.equal(list.length, 2);
  const noPw = list.find((f) => f.entryIds.includes(1));
  const noAcc = list.find((f) => f.entryIds.includes(2));
  assert.equal(noPw.level, 'medium');
  assert.equal(noAcc.level, 'low');
});

test('analyze：陈旧密码（超阈值 = 提示；可关闭）', () => {
  const old = entry({ updated_at: '2024-01-01T00:00:00Z' });
  const r = PassWatch.analyze([old], { now: NOW, staleMonths: 12 });
  const f = r.findings.find((x) => x.type === 'stale');
  assert.ok(f);
  assert.equal(f.level, 'info');

  const rOff = PassWatch.analyze([old], { now: NOW, staleMonths: 0 });
  assert.equal(rOff.findings.filter((x) => x.type === 'stale').length, 0);

  const recent = entry({ updated_at: '2026-08-15T00:00:00Z' });
  const rOk = PassWatch.analyze([recent], { now: NOW, staleMonths: 12 });
  assert.equal(rOk.findings.filter((x) => x.type === 'stale').length, 0);
});

test('analyze：发现按风险排序（高 → 中 → 低 → 提示）', () => {
  const items = [
    entry({ id: 1, password: '123456' }),                                        // high
    entry({ id: 2, password: 'Dup#Pass1', account: '' }),                        // low(缺账户)
    entry({ id: 3, password: 'Dup#Pass1', updated_at: '2023-01-01T00:00:00Z' }), // reused(中) + stale(提示)
  ];
  const r = PassWatch.analyze(items, { now: NOW });
  const levels = r.findings.map((f) => f.level);
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  for (let i = 1; i < levels.length; i++) assert.ok(order[levels[i - 1]] <= order[levels[i]], `排序异常: ${levels.join(',')}`);
});

test('sha1Hex：与已知向量一致', async () => {
  assert.equal(await PassWatch.sha1Hex('password', webcrypto), '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  assert.equal(await PassWatch.sha1Hex('P@ssw0rd', webcrypto), '21BD12DC183F740EE76F27B78EB39C8AD972A757');
});

test('buildRangeBuckets：按前缀分桶', () => {
  const buckets = PassWatch.buildRangeBuckets(['ABCDE12345', 'ABCDEF67890', 'FFFFF00000']);
  assert.equal(buckets.size, 2);
  assert.deepEqual([...buckets.get('ABCDE')].sort(), ['12345', 'F67890']);
  assert.ok(buckets.get('FFFFF').has('00000'));
});

test('parsePwnedRange：解析 HIBP 响应（含脏行）', () => {
  const text = '0123AB:5\n00FEDC: 128\nBADLINE\n:9\nC0FFEE:0\n\n';
  const m = PassWatch.parsePwnedRange(text);
  assert.equal(m.get('0123AB'), 5);
  assert.equal(m.get('00FEDC'), 128);
  assert.equal(m.get('C0FFEE'), 0);
  assert.equal(m.size, 3);
});

test('checkPwned：k-匿名查询命中与未命中', async () => {
  // 模拟 fetchFn：对包含 5BAA6（password 的前缀）的桶返回命中
  const fetchFn = async (url) => {
    if (url.endsWith('/range/5BAA6')) return '1E4C9B93F3F0682250B6CF8331B7EE68FD8:3730477\n';
    return '0000000000000000000000000000000000000:1\n';
  };
  const calls = [];
  const wrapped = async (u) => { calls.push(u); return fetchFn(u); };
  const result = await PassWatch.checkPwned(['password', 'Zx!9kLm2@pQw7#dR'], wrapped, webcrypto);
  assert.equal(result.get('password'), 3730477);
  assert.ok(!result.has('Zx!9kLm2@pQw7#dR'));
  // 网络只应见到前缀，绝无完整哈希或明文
  for (const u of calls) assert.match(u, /\/range\/[0-9A-F]{5}$/);
});
