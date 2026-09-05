import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* qr.js 纯函数在 Node 的装载：globalThis.window = globalThis + 间接 eval */
globalThis.window = globalThis;
globalThis.TextEncoder = globalThis.TextEncoder || (await import('node:util')).TextEncoder;
globalThis.TextDecoder = globalThis.TextDecoder || (await import('node:util')).TextDecoder;
const src = readFileSync(new URL('../public/qr.js', import.meta.url), 'utf8');
// btoa/atob polyfill（Node 22 已有 globalThis.atob/btoa，无需自实现）
(0, eval)(src);
const Q = globalThis.window.PassQR;

const entry = {
  id: 42, owner: 'GitHub', account: 'me@x.com', password: 'p@ssw0rd!',
  url: 'https://github.com', category: '工作,个人', note: '备注一', totp_secret: 'JBSWY3DPEHPK3PXP',
  fav: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-02T00:00:00Z',
  history: '[]', attachments: '[]',
};

test('PASSBOOK 迁移编解码往返（含 id 剔除）', () => {
  const packed = Q.packMigrate(entry);
  assert.ok(packed.startsWith('PASSBOOK:'));
  const back = Q.unpackMigrate(packed);
  assert.equal(back.owner, 'GitHub');
  assert.equal(back.password, 'p@ssw0rd!');
  assert.equal(back.totp_secret, 'JBSWY3DPEHPK3PXP');
  assert.equal(back.category, '工作,个人'); // 中文/多分类字段往返无损
  assert.equal(back.id, undefined); // id 不迁移
});

test('PASSBOOK 非法载荷返回 null', () => {
  assert.equal(Q.unpackMigrate('PASSBOOK:!!!not-base64!!!'), null);
  assert.equal(Q.unpackMigrate('PASSBOOK:' + Buffer.from('{"foo":1}').toString('base64')), null); // 无条目字段
});

test('分享卡片生成与解析往返（全字段）', () => {
  const card = Q.buildShareCard(entry);
  assert.ok(card.startsWith('密码本条目\n'));
  const back = Q.parseShareCard(card);
  assert.equal(back.owner, 'GitHub');
  assert.equal(back.account, 'me@x.com');
  assert.equal(back.password, 'p@ssw0rd!');
  assert.equal(back.totp_secret, 'JBSWY3DPEHPK3PXP');
  assert.equal(back.note, '备注一');
});

test('分享卡片无 TOTP/备注时省略行', () => {
  const card = Q.buildShareCard({ owner: 'A', account: 'B', password: 'C' });
  assert.ok(!card.includes('TOTP:'));
  assert.ok(!card.includes('备注:'));
  const back = Q.parseShareCard(card);
  assert.equal(back.owner, 'A');
  assert.equal(back.password, 'C');
  assert.equal(back.totp_secret, undefined);
});

test('分享卡片解析：缺所属或密码判无效', () => {
  assert.equal(Q.parseShareCard('密码本条目\n账户: x\n备注: y'), null); // 无所属/密码
  assert.equal(Q.parseShareCard('密码本条目\n所属: x\n账户: y'), null); // 无密码
  assert.equal(Q.parseShareCard('随便文本\n所属: x\n密码: y'), null); // 无头行
});

test('otpauth 解析：完整参数', () => {
  const r = Q.parseOtpauth('otpauth://totp/GitHub:me%40x.com?secret=jbswy3dpehpk3pxp&issuer=GitHub&period=60&digits=8');
  assert.equal(r.secret, 'JBSWY3DPEHPK3PXP'); // 自动去空格大写
  assert.equal(r.issuer, 'GitHub');
  assert.equal(r.period, 60);
  assert.equal(r.digits, 8);
});

test('otpauth 解析：默认 period/digits、label 提 issuer', () => {
  const r = Q.parseOtpauth('otpauth://totp/Cloudflare%3Ame?secret=ABC234');
  assert.equal(r.period, 30);
  assert.equal(r.digits, 6);
  assert.equal(r.issuer, 'Cloudflare');
});

test('otpauth 无 secret 返回 null', () => {
  assert.equal(Q.parseOtpauth('otpauth://totp/X?issuer=Y'), null);
  assert.equal(Q.parseOtpauth('https://x.com'), null);
});

test('五级识别：各级优先级与内容', () => {
  // 1 PASSBOOK
  let r = Q.parseQrPayload(Q.packMigrate(entry));
  assert.equal(r.level, 'migrate');
  assert.equal(r.entry.owner, 'GitHub');
  // 2 分享卡片
  r = Q.parseQrPayload(Q.buildShareCard({ owner: 'O', account: 'A', password: 'P' }));
  assert.equal(r.level, 'share');
  // 3 otpauth
  r = Q.parseQrPayload('otpauth://totp/X?secret=ABC234DEF');
  assert.equal(r.level, 'otpauth');
  assert.equal(r.totp.secret, 'ABC234DEF');
  // 4 URL
  r = Q.parseQrPayload('https://frp-way.com:44806/login');
  assert.equal(r.level, 'url');
  assert.equal(r.url, 'https://frp-way.com:44806/login');
  // 5 纯文本
  r = Q.parseQrPayload('就是一段普通文字');
  assert.equal(r.level, 'text');
  // 空
  assert.equal(Q.parseQrPayload('  ').level, 'empty');
  // 非法 PASSBOOK 降级为 text
  assert.equal(Q.parseQrPayload('PASSBOOK:zzz').level, 'text');
});

test('中文与特殊字符全链路（PASSBOOK + 卡片）', () => {
  const e2 = { owner: '联通&电信"引号"', account: 'user<script>', password: '密码🔒123', note: '换行\n内容' };
  const back = Q.unpackMigrate(Q.packMigrate(e2));
  assert.deepEqual({ owner: back.owner, account: back.account, password: back.password, note: back.note }, e2);
});

console.log('16/16 通过 qr');
