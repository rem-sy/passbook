/**
 * 密码本 · 主题模块单元测试
 * 用法: node --disable-warning=ExperimentalWarning test/theme.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require(join(__dirname, '..', 'public', 'theme.js'));
const PassTheme = globalThis.PassTheme;

test('normalizeTheme：合法值保留，非法回退 auto', () => {
  assert.equal(PassTheme.normalizeTheme('dark'), 'dark');
  assert.equal(PassTheme.normalizeTheme('light'), 'light');
  assert.equal(PassTheme.normalizeTheme('auto'), 'auto');
  assert.equal(PassTheme.normalizeTheme('blue'), 'auto');
  assert.equal(PassTheme.normalizeTheme(undefined), 'auto');
  assert.equal(PassTheme.normalizeTheme(null), 'auto');
});

test('resolveTheme：auto 跟随系统', () => {
  assert.equal(PassTheme.resolveTheme('auto', true), 'dark');
  assert.equal(PassTheme.resolveTheme('auto', false), 'light');
});

test('resolveTheme：手动指定优先于系统', () => {
  assert.equal(PassTheme.resolveTheme('dark', false), 'dark');
  assert.equal(PassTheme.resolveTheme('light', true), 'light');
  assert.equal(PassTheme.resolveTheme('垃圾', true), 'dark'); // 归一为 auto 后随系统
});

test('applyTheme：切换 html.dark 类并返回生效值', () => {
  const cls = new Set();
  const doc = { documentElement: { classList: {
    toggle: (name, on) => { if (on) cls.add(name); else cls.delete(name); },
  } } };
  assert.equal(PassTheme.applyTheme(doc, 'dark', false), 'dark');
  assert.ok(cls.has('dark'));
  assert.equal(PassTheme.applyTheme(doc, 'light', true), 'light');
  assert.ok(!cls.has('dark'));
  assert.equal(PassTheme.applyTheme(doc, 'auto', true), 'dark');
  assert.ok(cls.has('dark'));
});
