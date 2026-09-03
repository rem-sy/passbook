import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

require('../public/db-crypto.js');
const DbCrypto = globalThis.DbCrypto;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('环境具备 WebCrypto（Node ≥ 18）', () => {
  assert.ok(DbCrypto.hasWebCrypto(), 'Node 需提供 crypto.subtle');
});

test('加密往返：明文 → 密文 → 明文 一致', async () => {
  const plain = new TextEncoder().encode('SQLite format 3 你好密码本-abcd-1234');
  const salt = DbCrypto.newSalt();
  const key = await DbCrypto.deriveKey('correct-horse-9', salt);
  const enc = await DbCrypto.encryptBytes(plain, key, salt);
  assert.ok(DbCrypto.isEncrypted(enc), '密文应带 PBENC1 头');
  assert.ok(!DbCrypto.isEncrypted(plain), '明文不被误判');
  const dec = await DbCrypto.decryptBytes(enc, key);
  assert.deepEqual(Buffer.from(dec), Buffer.from(plain));
});

test('错误密码派生的密钥解密失败并抛出可读错误', async () => {
  const plain = new TextEncoder().encode('secret data');
  const salt = DbCrypto.newSalt();
  const key = await DbCrypto.deriveKey('right-password', salt);
  const enc = await DbCrypto.encryptBytes(plain, key, salt);
  const wrongKey = await DbCrypto.deriveKey('wrong-password', salt);
  await assert.rejects(DbCrypto.decryptBytes(enc, wrongKey), /解密失败/);
});

test('文件头格式：magic + salt(16) + iv(12) + 密文', async () => {
  const plain = new TextEncoder().encode('x');
  const salt = DbCrypto.newSalt();
  const key = await DbCrypto.deriveKey('pass-12345', salt);
  const enc = await DbCrypto.encryptBytes(plain, key, salt);
  assert.equal(enc.length, DbCrypto.HEADER_LEN + 1 + 16, '密文 = 头 + 明文 + GCM tag(16)');
  assert.equal(String.fromCharCode(...enc.slice(0, 6)), 'PBENC1');
  assert.deepEqual(enc.slice(6, 22), salt, 'salt 保留在文件头（下次解锁可再派生）');
  // saltOf 取出的 salt 与写入一致
  assert.deepEqual(DbCrypto.saltOf(enc), salt);
});

test('每次加密使用随机 IV（同明文两次密文不同）', async () => {
  const plain = new TextEncoder().encode('same input');
  const salt = DbCrypto.newSalt();
  const key = await DbCrypto.deriveKey('iv-test-999', salt);
  const a = await DbCrypto.encryptBytes(plain, key, salt);
  const b = await DbCrypto.encryptBytes(plain, key, salt);
  assert.notDeepEqual(Buffer.from(a), Buffer.from(b));
  assert.deepEqual(Buffer.from(await DbCrypto.decryptBytes(a, key)), Buffer.from(await DbCrypto.decryptBytes(b, key)));
});

test('过短/空输入不会被误判为加密文件', () => {
  assert.equal(DbCrypto.isEncrypted(null), false);
  assert.equal(DbCrypto.isEncrypted(new Uint8Array(0)), false);
  assert.equal(DbCrypto.isEncrypted(new TextEncoder().encode('PBENC1')), false);
});

let failed = 0;
for (const { name, fn } of tests) {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { failed++; console.error(`✘ ${name}\n  ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} 通过`);
process.exit(failed ? 1 : 0);
