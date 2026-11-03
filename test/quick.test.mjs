import test from 'node:test';
import assert from 'node:assert/strict';

/* quick-core.js / shortcut-input.js / importer.parseLines 纯函数在 Node 的装载（同 importer.test 惯例） */
globalThis.window = globalThis;
const fs = await import('node:fs');
(0, eval)(fs.readFileSync(new URL('../public/quick-core.js', import.meta.url), 'utf8'));
(0, eval)(fs.readFileSync(new URL('../public/shortcut-input.js', import.meta.url), 'utf8'));
(0, eval)(fs.readFileSync(new URL('../public/importer.js', import.meta.url), 'utf8'));
const Q = globalThis.window.PassQuick;
const S = globalThis.window.PassShortcut;
const I = globalThis.window.PassImporter;

/* ---------------- PassQuick.gateView：面板视图状态机 ---------------- */
test('gateView：主窗未就绪 → loading', () => {
  assert.equal(Q.gateView({ ready: false }), 'loading');
  assert.equal(Q.gateView({}), 'ready'); // ready 未给（undefined !== false）视作就绪，兼容旧主窗
});

test('gateView：可用性显式为 false → unavailable', () => {
  assert.equal(Q.gateView({ ready: true, available: false }), 'unavailable');
});

test('gateView：启用 PIN 且锁定 → pin；已解锁或未启用 → ready', () => {
  assert.equal(Q.gateView({ ready: true, needsPin: true, unlocked: false }), 'pin');
  assert.equal(Q.gateView({ ready: true, needsPin: true, unlocked: true }), 'ready');
  assert.equal(Q.gateView({ ready: true, needsPin: false, unlocked: false }), 'ready');
});

/* ---------------- PassQuick.trimResults：结果裁剪与字段收敛 ---------------- */
test('trimResults：最多 limit 条 + 字段收敛 + fav 布尔化', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    id: i, owner: 'o' + i, account: 'a' + i, password: 'p' + i,
    url: 'u' + i, note: 'n' + i, category: 'c', totp_secret: i % 2 ? 'SECRET' : '',
    fav: i === 0 ? 1 : 0, extra: '不应透传',
  }));
  const out = Q.trimResults(rows, 30);
  assert.equal(out.length, 30);
  assert.deepEqual(Object.keys(out[0]).sort(),
    ['account', 'category', 'fav', 'id', 'note', 'owner', 'password', 'totp_secret', 'url'].sort());
  assert.equal(out[0].fav, true);
  assert.equal(out[1].fav, false);
  assert.equal(out[0].totp_secret, '');
  assert.equal(out[1].totp_secret, 'SECRET');
});

test('trimResults：空输入与缺字段容错', () => {
  assert.deepEqual(Q.trimResults([]), []);
  assert.deepEqual(Q.trimResults(null), []);
  const [a] = Q.trimResults([{ id: 1 }]);
  assert.equal(a.owner, '');
  assert.equal(a.password, '');
});

/* ---------------- PassQuick.importPreview：导入预览脱敏 ---------------- */
test('importPreview：空 → 提示；正常 → 条数 + 脱敏行；超限 → 省略号', () => {
  assert.equal(Q.importPreview([]), '未解析出任何记录');
  const rows = [
    { owner: '微信', account: '138', password: 'x'.repeat(20) },
    { owner: 'GitHub', account: 'me', password: 'abc' },
  ];
  const txt = Q.importPreview(rows);
  assert.ok(txt.includes('解析出 2 条'));
  assert.ok(txt.includes('微信 | 138 | ************')); // 密码脱敏且截断到 12
  assert.ok(!txt.includes('x'.repeat(13)));
  const many = Array.from({ length: 15 }, (_, i) => ({ owner: 'o' + i, account: 'a', password: 'p' }));
  assert.ok(Q.importPreview(many).includes('… 共 15 条'));
});

/* ---------------- PassQuick.clearDelayMs：剪贴板清除延时 ---------------- */
test('clearDelayMs：与主窗 lock.clipboard 同规则（0/15/30 秒）', () => {
  assert.equal(Q.clearDelayMs({ clipboard: 15 }), 15000);
  assert.equal(Q.clearDelayMs({ clipboard: 30 }), 30000);
  assert.equal(Q.clearDelayMs({ clipboard: 0 }), 0);
  assert.equal(Q.clearDelayMs({}), 0);
  assert.equal(Q.clearDelayMs(null), 0);
  assert.equal(Q.clearDelayMs({ clipboard: 7 }), 0); // 非法值回退不清除
});

/* ---------------- PassShortcut.accelFromKeyboardEvent：快捷键录入 ---------------- */
const ev = (key, mods = {}) => ({
  key,
  ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: !!mods.meta,
});

test('录入：合法组合 → 规范加速器（修饰键顺序固定 Ctrl+Alt+Shift+Super）', () => {
  assert.deepEqual(S.accelFromKeyboardEvent(ev('p', { alt: true })), { ok: true, accel: 'Alt+P' });
  assert.deepEqual(S.accelFromKeyboardEvent(ev('N', { ctrl: true, alt: true })), { ok: true, accel: 'Ctrl+Alt+N' });
  assert.deepEqual(S.accelFromKeyboardEvent(ev('5', { ctrl: true })), { ok: true, accel: 'Ctrl+5' });
  assert.deepEqual(S.accelFromKeyboardEvent(ev('F12', { ctrl: true, shift: true })), { ok: true, accel: 'Ctrl+Shift+F12' });
  assert.deepEqual(S.accelFromKeyboardEvent(ev('k', { meta: true })), { ok: true, accel: 'Super+K' });
  // 修饰键顺序与按键内大小写无关，输出统一
  assert.deepEqual(S.accelFromKeyboardEvent(ev('n', { alt: true, ctrl: true })), { ok: true, accel: 'Ctrl+Alt+N' });
});

test('录入：裸键 / 仅 Shift / 不支持的主键 / 空事件 → 拒绝并给原因', () => {
  assert.equal(S.accelFromKeyboardEvent(ev('p')).ok, false);
  assert.ok(S.accelFromKeyboardEvent(ev('p')).error.includes('修饰键'));
  assert.equal(S.accelFromKeyboardEvent(ev('p', { shift: true })).ok, false);
  assert.equal(S.accelFromKeyboardEvent(ev('ArrowUp', { ctrl: true })).ok, false);
  assert.equal(S.accelFromKeyboardEvent(ev('Enter', { ctrl: true })).ok, false);
  assert.equal(S.accelFromKeyboardEvent(ev('F13', { ctrl: true })).ok, false); // F13 超白名单
  assert.equal(S.accelFromKeyboardEvent(null).ok, false);
});

test('录入：修饰键单独按下（key 为 Control/Alt 本身）不产出加速器', () => {
  assert.equal(S.accelFromKeyboardEvent(ev('Control', { ctrl: true })).ok, false);
  assert.equal(S.accelFromKeyboardEvent(ev('Alt', { alt: true })).ok, false);
});

/* ---------------- PassImporter.parseLines：面板粘贴导入（与主窗同规则） ---------------- */
test('parseLines：五种分隔符 + 表头/注释/空行跳过 + 第四五段进网址备注', () => {
  const rows = I.parseLines(
    '所属,账户,密码\n' +
    '微信,13800138000,P@ssw0rd1,https://wx.qq.com,备注词\n' +
    '网银/张三/XyZ!6789\n' +
    '支付宝\t李四\tPay#2024\n' +
    'GitHub me@example.com Abc12345 主账号\n' +
    '支付宝，小王，中文逗号密码\n' +
    '# 注释行\n' +
    '\n' +
    '太短,一行\n'
  );
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], { owner: '微信', account: '13800138000', password: 'P@ssw0rd1', url: 'https://wx.qq.com', category: '', note: '备注词' });
  assert.equal(rows[1].password, 'XyZ!6789');
  assert.equal(rows[2].owner, '支付宝');
  assert.equal(rows[3].owner, 'GitHub');
  assert.equal(rows[3].url, '主账号'); // 第 4 段进网址、第 5 段才进备注（与主窗同规则）
  assert.equal(rows[4].password, '中文逗号密码');
});
