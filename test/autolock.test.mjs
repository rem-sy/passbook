/**
 * 密码本 · 自动锁定/剪贴板清除 单元测试
 * 用法: node --disable-warning=ExperimentalWarning test/autolock.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require(join(__dirname, '..', 'public', 'autolock.js'));
const PassLock = globalThis.PassLock;

test('normalizeLockConfig：合法值保留', () => {
  assert.deepEqual(PassLock.normalizeLockConfig({ autoLock: '60', clipboard: 15 }), { autoLock: '60', clipboard: 15 });
  assert.deepEqual(PassLock.normalizeLockConfig({ autoLock: 'hidden', clipboard: 30 }), { autoLock: 'hidden', clipboard: 30 });
});

test('normalizeLockConfig：非法/缺省值回退默认', () => {
  assert.deepEqual(PassLock.normalizeLockConfig(null), { autoLock: 'never', clipboard: 0 });
  assert.deepEqual(PassLock.normalizeLockConfig({ autoLock: '999', clipboard: 7 }), { autoLock: 'never', clipboard: 0 });
  assert.deepEqual(PassLock.normalizeLockConfig({ autoLock: '300' }), { autoLock: '300', clipboard: 0 });
});

test('shouldLock：never 模式永不锁', () => {
  assert.equal(PassLock.shouldLock({ lastActivity: 0, now: 1e12, cfg: { autoLock: 'never' } }), false);
});

test('shouldLock：秒数阈值边界（60s）', () => {
  const t0 = 1000000;
  assert.equal(PassLock.shouldLock({ lastActivity: t0, now: t0 + 59 * 1000, cfg: { autoLock: '60' } }), false);
  assert.equal(PassLock.shouldLock({ lastActivity: t0, now: t0 + 60 * 1000, cfg: { autoLock: '60' } }), true);
  assert.equal(PassLock.shouldLock({ lastActivity: t0, now: t0 + 61 * 1000, cfg: { autoLock: '60' } }), true);
});

test('shouldLock：hidden 模式只看后台状态', () => {
  assert.equal(PassLock.shouldLock({ hidden: true, now: 1e12, cfg: { autoLock: 'hidden' } }), true);
  assert.equal(PassLock.shouldLock({ hidden: false, lastActivity: 0, now: 1e12, cfg: { autoLock: 'hidden' } }), false);
});

test('shouldLock：无活动时间视为从 0 起算（保守：锁）', () => {
  assert.equal(PassLock.shouldLock({ now: 61 * 1000, cfg: { autoLock: '60' } }), true);
});

test('msUntilClear：延时换算', () => {
  assert.equal(PassLock.msUntilClear({ clipboard: 0 }), 0);
  assert.equal(PassLock.msUntilClear({ clipboard: 15 }), 15000);
  assert.equal(PassLock.msUntilClear({ clipboard: 30 }), 30000);
  assert.equal(PassLock.msUntilClear({}), 0);
});
