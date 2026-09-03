/**
 * 密码本 · TOTP 单元测试（RFC 6238 附录 B 向量）
 * 用法: node --disable-warning=ExperimentalWarning test/totp.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require(join(__dirname, '..', 'public', 'totp.js'));
const PassTotp = globalThis.PassTotp;

// RFC 6238 附录 B：seed = "12345678901234567890"（ASCII）
// base32 = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ，SHA-1，8 位码
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const RFC_VECTORS = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

test('base32Decode：RFC 向量往返', () => {
  const bytes = PassTotp.base32Decode(RFC_SECRET);
  const ascii = String.fromCharCode(...bytes);
  assert.equal(ascii, '12345678901234567890');
});

test('base32Decode：容错（空格/小写/填充符）', () => {
  const a = PassTotp.base32Decode(RFC_SECRET);
  const b = PassTotp.base32Decode(' gezd gnbv gy3t qojq gezd gnbv gy3t qojq== ');
  assert.deepEqual([...b], [...a]);
});

test('base32Decode：非法字符抛错', () => {
  assert.throws(() => PassTotp.base32Decode('ABC1'), /无效的 base32/); // 1 不在字母表
  assert.throws(() => PassTotp.base32Decode(''), /为空/);
});

test('generateTotp：RFC 6238 SHA-1 8 位向量全对', async () => {
  for (const [sec, expect] of RFC_VECTORS) {
    const r = await PassTotp.generateTotp(RFC_SECRET, { time: sec * 1000, digits: 8, cryptoObj: webcrypto });
    assert.equal(r.code, expect, `T=${sec} 应为 ${expect}，得到 ${r.code}`);
  }
});

test('generateTotp：6 位码 = 8 位码去前导零的后 6 位', async () => {
  const r = await PassTotp.generateTotp(RFC_SECRET, { time: 59 * 1000, digits: 6, cryptoObj: webcrypto });
  assert.equal(r.code, '287082');
});

test('generateTotp：remaining 秒数正确', async () => {
  const t = 59 * 1000; // 第 59 秒 → 周期 2 内第 29 秒，剩 1 秒
  const r = await PassTotp.generateTotp(RFC_SECRET, { time: t, cryptoObj: webcrypto });
  assert.equal(r.remaining, 1);
  const r2 = await PassTotp.generateTotp(RFC_SECRET, { time: 60 * 1000, cryptoObj: webcrypto });
  assert.equal(r2.remaining, 30);
  // 周期切换后码变化
  assert.notEqual(r.code, r2.code);
});

test('parseOtpauthUri：标准链接', () => {
  const u = PassTotp.parseOtpauthUri('otpauth://totp/GitHub:user@example.com?secret=gezd%20gnbv&issuer=GitHub&digits=8&period=60');
  assert.equal(u.secret, 'GEZDGNBV');
  assert.equal(u.issuer, 'GitHub');
  assert.equal(u.account, 'user@example.com');
  assert.equal(u.digits, 8);
  assert.equal(u.period, 60);
});

test('parseOtpauthUri：label 内嵌 issuer 与非法输入', () => {
  const u = PassTotp.parseOtpauthUri('otpauth://totp/Amazon:alice?secret=MFRGGZDF');
  assert.equal(u.issuer, 'Amazon');
  assert.equal(u.account, 'alice');
  assert.throws(() => PassTotp.parseOtpauthUri('otpauth://totp/x'), /secret/);
  assert.throws(() => PassTotp.parseOtpauthUri('https://example.com'), /otpauth/);
  assert.throws(() => PassTotp.parseOtpauthUri('otpauth://totp/x?secret=A&algorithm=MD5'), /算法/);
});

test('extractSecret：混合输入归一化', () => {
  assert.equal(PassTotp.extractSecret('gezd gnbv'), 'GEZDGNBV');
  assert.equal(PassTotp.extractSecret('otpauth://totp/X?secret=gezdgnbv'), 'GEZDGNBV');
  assert.equal(PassTotp.extractSecret('  '), '');
});

test('isValidSecret：长度与合法性', () => {
  assert.ok(PassTotp.isValidSecret('GEZDGNBV'));
  assert.ok(!PassTotp.isValidSecret('ABC1'));
  assert.ok(!PassTotp.isValidSecret('ABC')); // 解码后不足 5 字节
});
