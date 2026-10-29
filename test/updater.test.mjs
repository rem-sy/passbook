import test from 'node:test';
import assert from 'node:assert/strict';

/* v4.9.0 自动更新纯函数：版本比较 / Release 资产挑选 / latest.json / 启动检查节流 */
globalThis.window = globalThis;
const fs = await import('node:fs');
(0, eval)(fs.readFileSync(new URL('../public/updater.js', import.meta.url), 'utf8'));
const U = globalThis.window.PassUpdater;

/* ---------- parseVer / cmpVer / isNewer ---------- */

test('parseVer：v 前缀 / 缺段 / 非法输入', () => {
  assert.deepEqual(U.parseVer('v4.9.0'), [4, 9, 0]);
  assert.deepEqual(U.parseVer('4.9.0'), [4, 9, 0]);
  assert.deepEqual(U.parseVer('v4.9'), [4, 9, 0]);    // 缺 patch 按 0
  assert.deepEqual(U.parseVer('10'), [10, 0, 0]);
  assert.equal(U.parseVer('abc'), null);
  assert.equal(U.parseVer(''), null);
  assert.equal(U.parseVer(null), null);
});

test('cmpVer：三段逐位比较', () => {
  assert.equal(U.cmpVer('4.10.0', '4.9.9'), 1);       // 10 > 9（非字典序）
  assert.equal(U.cmpVer('v4.9.0', '4.9.0'), 0);
  assert.equal(U.cmpVer('4.9.1', '4.9.0'), 1);
  assert.equal(U.cmpVer('4.8.9', '4.9.0'), -1);
  assert.equal(U.cmpVer('5.0.0', '4.99.99'), 1);
  assert.equal(U.cmpVer('v4.9.9-rc1', '4.9.9'), 0);   // 后缀按前缀比较（同版本不判更新）
  assert.equal(U.cmpVer('junk', '4.9.0'), 0);         // 非法不判更新（宁可漏报不误报）
});

test('isNewer：只有远端严格大于才提示更新', () => {
  assert.equal(U.isNewer('v4.9.9-test', '4.9.0'), true);
  assert.equal(U.isNewer('4.9.0', '4.9.0'), false);
  assert.equal(U.isNewer('4.8.1', '4.9.0'), false);
  assert.equal(U.isNewer('', '4.9.0'), false);
});

/* ---------- pickApkAsset ---------- */

test('pickApkAsset：挑正式 arm64 APK，排除预置版', () => {
  const assets = [
    { name: 'Passbook-Android-4.9.0-arm64-preset.apk', browser_download_url: 'u-preset', size: 1 },
    { name: 'Passbook_4.9.0_x64-setup.exe', browser_download_url: 'u-setup', size: 2 },
    { name: 'Passbook-Android-4.9.0-arm64.apk', browser_download_url: 'u-ok', size: 17500000 },
  ];
  const r = U.pickApkAsset(assets);
  assert.equal(r.url, 'u-ok');
  assert.equal(r.size, 17500000);
  // 全是预置/无 APK
  assert.equal(U.pickApkAsset([{ name: 'Passbook-Android-4.9.0-arm64-preset.apk', browser_download_url: 'x' }]), null);
  assert.equal(U.pickApkAsset([]), null);
  assert.equal(U.pickApkAsset(null), null);
});

/* ---------- buildLatestJson ---------- */

test('buildLatestJson：updater 插件静态清单结构', () => {
  const j = U.buildLatestJson('v4.9.0', 'https://github.com/rem-sy/passbook/releases/download/v4.9.0/Passbook_4.9.0_x64-setup.exe', '  sig-content\n');
  assert.equal(j.version, '4.9.0'); // v 前缀剥掉
  assert.equal(j.platforms['windows-x86_64'].url.includes('v4.9.0'), true);
  assert.equal(j.platforms['windows-x86_64'].signature, 'sig-content'); // 去首尾空白
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(j.pub_date));
});

/* ---------- shouldAutoCheck ---------- */

test('shouldAutoCheck：桌面每次启动；手机 24h 节流；开关关闭全禁', () => {
  assert.equal(U.shouldAutoCheck({ enabled: true, mobile: false }), true);          // 桌面无节流
  assert.equal(U.shouldAutoCheck({ enabled: false, mobile: false }), false);        // 关闭即禁
  const now = Date.now();
  assert.equal(U.shouldAutoCheck({ enabled: true, mobile: true, lastCheckTs: now - 1000 }), false); // 1 秒前查过
  assert.equal(U.shouldAutoCheck({ enabled: true, mobile: true, lastCheckTs: now - U.THROTTLE_MS - 1 }), true); // 超 24h
  assert.equal(U.shouldAutoCheck({ enabled: true, mobile: true, lastCheckTs: 0 }), true);           // 从未查过
  assert.equal(U.shouldAutoCheck({ enabled: false, mobile: true, lastCheckTs: 0 }), false);
});
