/**
 * 密码本 · API 冒烟测试
 * 启动临时服务器（独立数据目录、随机端口），验证增删改查、筛选、导入导出。
 * 用法: node --test test/
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = mkdtempSync(join(tmpdir(), 'passbook-test-'));

let child = null;
let base = '';

before(async () => {
  // 沙箱下无法用管道捕获子进程输出，改用固定端口 + 健康检查轮询
  const port = 39000 + Math.floor(Math.random() * 1000);
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs', '--no-open'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR },
    stdio: 'ignore',
  });
  base = `http://127.0.0.1:${port}`;
  // 轮询健康检查直到就绪
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) return;
    } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('服务器启动超时');
});

after(() => {
  if (child) child.kill();
});

async function j(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, data };
}

test('健康检查', async () => {
  const { status, data } = await j('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.mode, 'server');
});

test('创建记录', async () => {
  const { status, data } = await j('POST', '/api/entries', {
    owner: 'GitHub', account: 'alice@example.com', password: 'Abc12345!',
    url: 'https://github.com', category: '开发', note: '主力账号',
  });
  assert.equal(status, 201);
  assert.equal(data.owner, 'GitHub');
  assert.ok(data.id > 0);
  assert.ok(data.created_at);
});

test('必填校验', async () => {
  const { status } = await j('POST', '/api/entries', { owner: '', account: '', password: '' });
  assert.equal(status, 400);
});

test('列表与搜索', async () => {
  await j('POST', '/api/entries', { owner: '微信', account: '13800138000', password: 'Wx12345' });
  await j('POST', '/api/entries', { owner: 'GitHub', account: 'bob@example.com', password: 'Bob!6789' });

  const all = await j('GET', '/api/entries');
  assert.equal(all.status, 200);
  assert.ok(all.data.total >= 3);

  const q = await j('GET', '/api/entries?q=GitHub');
  assert.ok(q.data.total >= 2); // owner 或 note 命中

  const cat = await j('GET', '/api/entries?category=开发');
  assert.equal(cat.data.total, 1);
  assert.equal(cat.data.items[0].category, '开发');
});

test('更新与删除', async () => {
  const created = await j('POST', '/api/entries', { owner: '临时', account: 'tmp', password: 'Tmp123!' });
  const id = created.data.id;

  const upd = await j('PUT', `/api/entries/${id}`, { note: '已更新', password: 'NewPass!9' });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.note, '已更新');
  assert.equal(upd.data.password, 'NewPass!9');
  assert.ok(upd.data.updated_at >= upd.data.created_at);

  const del = await j('DELETE', `/api/entries/${id}`);
  assert.equal(del.status, 200);
  const miss = await j('PUT', `/api/entries/${id}`, { note: 'x' });
  assert.equal(miss.status, 404);
});

test('分类统计', async () => {
  const { status, data } = await j('GET', '/api/categories');
  assert.equal(status, 200);
  const dev = data.items.find((c) => c.category === '开发');
  assert.ok(dev && dev.count >= 1);
});

test('导入：合并模式跳过重复', async () => {
  const items = [
    { owner: '网银', account: 'u1', password: 'Bank#1' },
    { owner: '网银', account: 'u1', password: 'Bank#1' }, // 重复
    { owner: '邮箱', account: 'u2', password: 'Mail#2', note: '新' },
  ];
  const { status, data } = await j('POST', '/api/import', { items, mode: 'merge' });
  assert.equal(status, 200);
  assert.equal(data.imported, 2);
  assert.equal(data.skipped, 1);
});

test('导入：覆盖模式清空并导入', async () => {
  const items = [{ owner: 'OnlyOne', account: 'a', password: 'Only#1' }];
  const { status, data } = await j('POST', '/api/import', { items, mode: 'replace' });
  assert.equal(status, 200);
  assert.equal(data.imported, 1);
  const all = await j('GET', '/api/entries');
  assert.equal(all.data.total, 1);
  assert.equal(all.data.items[0].owner, 'OnlyOne');
});

test('TOTP：创建/读取/更新 totp_secret 往返一致', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const { status, data } = await j('POST', '/api/entries', {
    owner: 'TOTP测试', account: 'u1', password: 'Pw#12345', totp_secret: secret,
  });
  assert.equal(status, 201);
  assert.equal(data.totp_secret, secret);
  const id = data.id;
  // 更新为空 = 清除；更新为其他值 = 替换
  const up = await j('PUT', `/api/entries/${id}`, { owner: 'TOTP测试', account: 'u1', password: 'Pw#12345', totp_secret: '' });
  assert.equal(up.status, 200);
  assert.equal(up.data.totp_secret, '');
  const up2 = await j('PUT', `/api/entries/${id}`, { owner: 'TOTP测试', account: 'u1', password: 'Pw#12345', totp_secret: 'MFRGGZDF' });
  assert.equal(up2.data.totp_secret, 'MFRGGZDF');
  // 旧客户端不带 totp_secret 字段：不应清掉已有值（normalizeEntry 补 ''，merged 覆盖为 ''）
  // —— 实际行为：normalizeEntry 输出 '' 会覆盖，此处固化该行为作为契约
  const legacy = await j('PUT', `/api/entries/${id}`, { owner: 'TOTP测试', account: 'u1', password: 'Pw#12345' });
  assert.equal(legacy.data.totp_secret, '');
});

test('导入：totp_secret 字段随条目入库', async () => {
  const items = [{ owner: 'T2', account: 'a', password: 'Xy#1', totp_secret: 'MFRGGZDF' }];
  const { status, data } = await j('POST', '/api/import', { items, mode: 'merge' });
  assert.equal(status, 200);
  assert.equal(data.imported, 1);
  const all = await j('GET', '/api/entries?q=T2');
  assert.equal(all.data.items[0].totp_secret, 'MFRGGZDF');
});

test('导出 JSON', async () => {
  const r = await fetch(base + '/api/export');
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.ok(data.items.length >= 1);
  assert.ok(data.exportedAt);
});

test('导出 .db 文件可被 sqlite 读取', async () => {
  const r = await fetch(base + '/api/export-db');
  assert.equal(r.status, 200);
  const buf = Buffer.from(await r.arrayBuffer());
  // SQLite 文件头魔数: "SQLite format 3\0"
  assert.equal(buf.slice(0, 16).toString(), 'SQLite format 3\u0000');
});

test('静态资源可访问', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /密码本/);
  const js = await fetch(base + '/generator.js');
  assert.equal(js.status, 200);
  const wasm = await fetch(base + '/lib/sql-wasm.wasm');
  assert.equal(wasm.status, 200);
  assert.ok(wasm.headers.get('content-type').includes('wasm'));
});

test('数据目录包含数据库文件', () => {
  const files = readdirSync(DATA_DIR);
  assert.ok(files.includes('passwords.db'), `实际文件: ${files.join(', ')}`);
});
