import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/passphrase.js');
const P = globalThis.PassPhrase;

// 确定性随机源：seq 依次返回
function seqRnd(seq) {
  let i = 0;
  return (max) => {
    const v = seq[i++ % seq.length] % max;
    return v;
  };
}

test('词表规模：中英各 ≥ 400 词', () => {
  assert.ok(P.wordlistSize('zh') >= 400, `zh=${P.wordlistSize('zh')}`);
  assert.ok(P.wordlistSize('en') >= 400, `en=${P.wordlistSize('en')}`);
});

test('词表无重复词', () => {
  for (const k of ['zh', 'en']) {
    const arr = P.WORDLISTS[k];
    assert.equal(new Set(arr).size, arr.length, `list=${k} 有重复`);
  }
});

test('生成：默认中文 6 词，连字符分隔', () => {
  const s = P.generatePassphrase({ rndInt: seqRnd([0, 1, 2, 3, 4, 5]) });
  const parts = s.split('-');
  assert.equal(parts.length, 6);
  for (const w of parts) assert.ok(P.WORDLISTS.zh.includes(w));
});

test('生成：英文词表 + 首字母大写', () => {
  const s = P.generatePassphrase({ list: 'en', words: 4, capitalize: true, rndInt: seqRnd([10, 20, 30, 40]) });
  for (const w of s.split('-')) {
    assert.ok(/^[A-Z][a-z]+$/.test(w), `词 ${w} 未首字母大写`);
  }
});

test('生成：分隔符选项生效', () => {
  for (const sep of ['.', '_', ' ', '']) {
    const s = P.generatePassphrase({ words: 3, separator: sep, rndInt: seqRnd([1, 2, 3]) });
    if (sep === '') assert.ok(!s.includes('-') && !s.includes('.'));
    else assert.equal(s.split(sep).length, 3, `sep="${sep}" => ${s}`);
  }
});

test('生成：非法分隔符回退为 -', () => {
  const s = P.generatePassphrase({ words: 3, separator: '???', rndInt: seqRnd([1, 2, 3]) });
  assert.equal(s.split('-').length, 3);
});

test('生成：附加数字为两位', () => {
  const s = P.generatePassphrase({ words: 3, includeNumber: true, rndInt: seqRnd([1, 2, 3, 45]) });
  const tail = s.split('-').pop();
  assert.match(tail, /^\d{2}$/);
});

test('生成：词数边界校验', () => {
  assert.throws(() => P.generatePassphrase({ words: 2 }));
  assert.throws(() => P.generatePassphrase({ words: 13 }));
  assert.throws(() => P.generatePassphrase({ words: 'x' }));
  // 边界值合法
  assert.equal(P.generatePassphrase({ words: 3, rndInt: seqRnd([0, 0, 0]) }).split('-').length, 3);
  assert.equal(P.generatePassphrase({ words: 12, rndInt: seqRnd([0]) }).split('-').length, 12);
});

test('生成：真实随机源可重复生成不同短语', () => {
  const set = new Set();
  for (let i = 0; i < 8; i++) set.add(P.generatePassphrase({ words: 5 }));
  assert.ok(set.size > 1);
});

test('熵：每词 log2(词表)，附加数字加 log2(90)', () => {
  const zhN = P.wordlistSize('zh');
  const e6 = P.entropyPassphrase({ words: 6 });
  assert.equal(e6, Math.round(6 * Math.log2(zhN)));
  const e6n = P.entropyPassphrase({ words: 6, includeNumber: true });
  assert.equal(e6n, Math.round(6 * Math.log2(zhN) + Math.log2(90)));
  const enE = P.entropyPassphrase({ words: 6, list: 'en' });
  assert.equal(enE, Math.round(6 * Math.log2(P.wordlistSize('en'))));
});

test('熵：默认参数 ≈ 9 bit × 6 词', () => {
  const e = P.entropyPassphrase({});
  assert.ok(e >= 50 && e <= 58, `e=${e}`);
});

test('强度标签阈值', () => {
  assert.equal(P.strengthLabel(95).cls, 's5');
  assert.equal(P.strengthLabel(75).cls, 's4');
  assert.equal(P.strengthLabel(55).cls, 's3');
  assert.equal(P.strengthLabel(40).cls, 's2');
  assert.equal(P.strengthLabel(20).cls, 's1');
});
