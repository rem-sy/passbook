/**
 * 密码本 · 生成器单元测试
 * 用法: node --test test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// generator.js 是 UMD 包：require 后 factory 挂到 globalThis.PassGen
require(join(__dirname, '..', 'public', 'generator.js'));
const PassGen = globalThis.PassGen;

test('默认生成：长度与字符集', () => {
  for (let i = 0; i < 20; i++) {
    const pw = PassGen.generate({ length: 16 });
    assert.equal(pw.length, 16);
    assert.match(pw, /[A-Z]/);
    assert.match(pw, /[a-z]/);
    assert.match(pw, /[0-9]/);
    assert.match(pw, /[^A-Za-z0-9]/);
  }
});

test('指定长度与字符子集', () => {
  for (let i = 0; i < 10; i++) {
    const pw = PassGen.generate({ length: 24, lower: false, symbol: false });
    assert.equal(pw.length, 24);
    assert.match(pw, /^[A-Z0-9]+$/);
  }
});

test('排除易混淆字符', () => {
  for (let i = 0; i < 50; i++) {
    const pw = PassGen.generate({ length: 40, excludeAmbiguous: true });
    assert.ok(!/[0O1lI|`'".,;:()\[\]{}<>]/.test(pw), `包含易混淆字符: ${pw}`);
  }
});

test('键盘布局不连续', () => {
  for (let i = 0; i < 60; i++) {
    const pw = PassGen.generate({ length: 30, noKeyboardAdjacent: true });
    for (let k = 1; k < pw.length; k++) {
      assert.ok(!kbAdj(pw[k - 1], pw[k]), `存在键盘相邻对: ${pw[k - 1]}${pw[k]} (${pw})`);
    }
  }
});

// 与生成器内部一致的相邻判断（测试用独立坐标表）
const ROWS = [
  { y: 0, x0: 0, chars: '1234567890' },
  { y: 1, x0: 0.5, chars: 'qwertyuiop' },
  { y: 2, x0: 1, chars: 'asdfghjkl' },
  { y: 3, x0: 1.5, chars: 'zxcvbnm' },
];
const MAP = {};
for (const r of ROWS) {
  for (let i = 0; i < r.chars.length; i++) MAP[r.chars[i]] = { x: r.x0 + i, y: r.y };
}
function kbAdj(a, b) {
  const pa = MAP[a], pb = MAP[b];
  if (!pa || !pb) return false;
  return Math.abs(pa.x - pb.x) <= 1.15 && Math.abs(pa.y - pb.y) <= 1;
}

test('禁止连续相同字符', () => {
  for (let i = 0; i < 40; i++) {
    const pw = PassGen.generate({ length: 24, noRepeat: true });
    for (let k = 1; k < pw.length; k++) {
      assert.notEqual(pw[k], pw[k - 1], `存在连续相同: ${pw}`);
    }
  }
});

test('禁止顺序/倒序字符对', () => {
  for (let i = 0; i < 40; i++) {
    const pw = PassGen.generate({ length: 24, noSequence: true });
    for (let k = 1; k < pw.length; k++) {
      const a = pw[k - 1].charCodeAt(0);
      const b = pw[k].charCodeAt(0);
      const bothLetter = /[a-zA-Z]/.test(pw[k - 1]) && /[a-zA-Z]/.test(pw[k]);
      const bothDigit = /[0-9]/.test(pw[k - 1]) && /[0-9]/.test(pw[k]);
      if ((bothLetter || bothDigit) && Math.abs(a - b) === 1) {
        assert.fail(`存在顺序字符对: ${pw[k - 1]}${pw[k]} (${pw})`);
      }
    }
  }
});

test('额外排除字符', () => {
  for (let i = 0; i < 20; i++) {
    const pw = PassGen.generate({ length: 20, excludeChars: 'aB1!' });
    assert.ok(!/[aB1!]/.test(pw), `包含被排除字符: ${pw}`);
  }
});

test('长度过短报错', () => {
  assert.throws(() => PassGen.generate({ length: 3 }), /至少|长度/);
});

test('无字符类型报错', () => {
  assert.throws(
    () => PassGen.generate({ length: 16, upper: false, lower: false, digit: false, symbol: false }),
    /至少需要选择一种字符类型/
  );
});

test('熵值估算', () => {
  const bits = PassGen.entropy({ length: 16, upper: true, lower: true, digit: true, symbol: true });
  assert.ok(bits >= 90 && bits <= 110, `熵值异常: ${bits}`);
  assert.equal(typeof PassGen.strengthLabel(bits).label, 'string');
});
