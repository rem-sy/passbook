import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* import-text.js 依赖 qr.js 的 PassQR：同 qr.test.mjs 的装载方式 */
globalThis.window = globalThis;
globalThis.TextEncoder = globalThis.TextEncoder || (await import('node:util')).TextEncoder;
globalThis.TextDecoder = globalThis.TextDecoder || (await import('node:util')).TextDecoder;
(0, eval)(readFileSync(new URL('../public/qr.js', import.meta.url), 'utf8'));
(0, eval)(readFileSync(new URL('../public/import-text.js', import.meta.url), 'utf8'));
const Q = globalThis.window.PassQR;
const T = globalThis.window.PassImportText;

const entry = {
  id: 7, owner: 'GitHub', account: 'me@x.com', password: 'p@ssw0rd!',
  url: 'https://github.com', category: '工作', note: '主力号', totp_secret: 'JBSWY3DPEHPK3PXP', fav: 1,
};

test('PASSBOOK 迁移密文：每行一条，全字段保留（含 totp/category/url）', () => {
  const cipher = Q.packMigrate(entry);
  const rows = T.parseImportText(cipher + '\n' + Q.packMigrate({ ...entry, owner: '微信', account: '138', password: 'Wx#1' }));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].owner, 'GitHub');
  assert.equal(rows[0].password, 'p@ssw0rd!');
  assert.equal(rows[0].totp_secret, 'JBSWY3DPEHPK3PXP');
  assert.equal(rows[0].category, '工作');
  assert.equal(rows[0].url, 'https://github.com');
  assert.equal(rows[1].owner, '微信');
});

test('分享卡片文本：单张与多张连粘（v4.12.5 复制文本导出入口）', () => {
  const card1 = Q.buildShareCard({ owner: '网银', account: '张三', password: 'B#1', note: '工资卡' });
  const card2 = Q.buildShareCard({ owner: 'Steam', account: 'gg', password: 'S#2' });
  const rows = T.parseImportText(card1 + '\n' + card2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].owner, '网银');
  assert.equal(rows[0].note, '工资卡');
  assert.equal(rows[1].password, 'S#2');
});

test('混合内容：密文 + 卡片 + CSV 行一起粘', () => {
  const text = Q.packMigrate(entry) + '\n微信,13800000000,Wx#2024,https://wx.qq.com,家人号';
  const rows = T.parseImportText(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].owner, 'GitHub');
  assert.equal(rows[1].owner, '微信');
  assert.equal(rows[1].url, 'https://wx.qq.com');
  assert.equal(rows[1].note, '家人号');
});

test('经典 CSV 行为不回归：五种分隔符 + 表头/注释跳过', () => {
  const rows = T.parseImportText('所属,账户,密码\n# 注释\nGitHub/a@b.c/Pw1\n微信\t138\tPw2\n网银 张三 Pw3');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].owner, 'GitHub');
  assert.equal(rows[1].owner, '微信');
  assert.equal(rows[2].password, 'Pw3');
});

test('坏密文行跳过、不炸；空输入返回空数组', () => {
  assert.deepEqual(T.parseImportText(''), []);
  assert.deepEqual(T.parseImportText('PASSBOOK:!!!not-base64!!!'), []);
  assert.deepEqual(T.parseImportText('密码本条目\n只有这一行头'), []); // 卡片字段不足 → 无效
});
