#!/usr/bin/env node
/**
 * 密码本 (passbook) —— 本地密码管理服务器
 * 零第三方依赖：Node 内置 http + node:sqlite
 *
 * 用法：
 *   node server.mjs              # 本机访问 http://127.0.0.1:3947
 *   node server.mjs --lan        # 同时监听局域网，手机可访问 http://<电脑IP>:3947
 *   node server.mjs --port 8080  # 自定义端口
 *   DATA_DIR=... node server.mjs # 自定义数据目录（可指向网盘同步文件夹）
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { join, extname, resolve, dirname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- 配置 ----------
const portArgIdx = process.argv.indexOf('--port');
const PORT = Number(portArgIdx >= 0 ? process.argv[portArgIdx + 1] : process.env.PORT || 3947);
const LAN = process.argv.includes('--lan');
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(__dirname, 'data');
const DB_PATH = join(DATA_DIR, 'passwords.db');
const PUBLIC_DIR = join(__dirname, 'public');
const OPEN_BROWSER = !process.argv.includes('--no-open');

// ---------- 数据库 ----------
await mkdir(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL DEFAULT '',
    account TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entries_owner   ON entries(owner);
  CREATE INDEX IF NOT EXISTS idx_entries_account ON entries(account);
  CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);
`);

// ---------- 工具 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.db': 'application/octet-stream',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function nowIso() { return new Date().toISOString(); }

function escLike(s) { return s.replace(/[\\%_]/g, (m) => '\\' + m); }

// ---------- 业务逻辑 ----------
const FIELDS = ['owner', 'account', 'password', 'url', 'category', 'note'];
function normalizeEntry(body = {}) {
  const e = {};
  for (const f of FIELDS) e[f] = typeof body[f] === 'string' ? body[f] : '';
  return e;
}

function listEntries({ q = '', category = '', sort = 'updated' }) {
  const where = [];
  const params = [];
  if (q) {
    const like = `%${escLike(q.trim())}%`;
    where.push(`(owner LIKE ? ESCAPE '\\' OR account LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like, like);
  }
  if (category) { where.push('category = ?'); params.push(category); }
  let order = 'updated_at DESC, id DESC';
  if (sort === 'created') order = 'created_at DESC, id DESC';
  if (sort === 'owner') order = 'owner COLLATE NOCASE ASC, account COLLATE NOCASE ASC';
  const sql = `SELECT * FROM entries ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`;
  const rows = db.prepare(sql).all(...params);
  return { items: rows, total: rows.length };
}

// ---------- HTTP 处理 ----------
async function handleApi(req, res, pathname, search) {
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, mode: 'server', dbPath: DB_PATH, version: '0.1.0' });
  }

  // AI 助理代理：转发到用户配置的 OpenAI 兼容渠道（绕过浏览器 CORS）
  if (pathname === '/api/agent/proxy' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf-8') || '{}');
    const { url, method = 'GET', headers = {}, body: outBody } = body || {};
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return sendJson(res, 400, { error: '仅支持 http(s) 地址' });
    }
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 120000);
      const up = await fetch(url, {
        method,
        headers,
        body: outBody ?? undefined,
        signal: ctl.signal,
      });
      clearTimeout(timer);
      const text = await up.text();
      return sendJson(res, 200, { status: up.status, body: text });
    } catch (e) {
      return sendJson(res, 200, { status: 0, body: JSON.stringify({ error: String(e.message || e) }) });
    }
  }

  if (pathname === '/api/agent/proxy-stream' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf-8') || '{}');
    const { url, method = 'GET', headers = {}, body: outBody } = body || {};
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return sendJson(res, 400, { error: '仅支持 http(s) 地址' });
    }
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 180000);
      const up = await fetch(url, {
        method,
        headers,
        body: outBody ?? undefined,
        signal: ctl.signal,
      });
      clearTimeout(timer);
      res.writeHead(up.status, { 'Content-Type': 'text/plain; charset=utf-8' });
      const reader = up.body?.getReader?.();
      if (!reader) {
        const text = await up.text();
        res.end(text);
        return;
      }
      const dec = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(dec.decode(value, { stream: true }));
        }
        res.end(dec.decode());
      } catch (e) {
        res.end();
      }
    } catch (e) {
      return sendJson(res, 200, { status: 0, body: JSON.stringify({ error: String(e.message || e) }) });
    }
  }

  if (pathname === '/api/entries' && req.method === 'GET') {
    const q = search.get('q') || '';
    const category = search.get('category') || '';
    const sort = search.get('sort') || 'updated';
    return sendJson(res, 200, listEntries({ q, category, sort }));
  }

  if (pathname === '/api/entries' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf-8') || '{}');
    const e = normalizeEntry(body);
    if (!e.owner.trim() || !e.account.trim() || !e.password) {
      return sendJson(res, 400, { error: '所属、账户、密码不能为空' });
    }
    const now = nowIso();
    const stmt = db.prepare(
      `INSERT INTO entries (owner, account, password, url, category, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const r = stmt.run(e.owner, e.account, e.password, e.url, e.category, e.note, now, now);
    const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(Number(r.lastInsertRowid));
    return sendJson(res, 201, row);
  }

  const entryMatch = pathname.match(/^\/api\/entries\/(\d+)$/);
  if (entryMatch) {
    const id = Number(entryMatch[1]);
    if (req.method === 'PUT') {
      const body = JSON.parse((await readBody(req)).toString('utf-8') || '{}');
      const patch = normalizeEntry(body);
      const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: '记录不存在' });
      const merged = { ...existing, ...patch };
      const stmt = db.prepare(
        `UPDATE entries SET owner=?, account=?, password=?, url=?, category=?, note=?, updated_at=? WHERE id=?`
      );
      stmt.run(merged.owner, merged.account, merged.password, merged.url, merged.category, merged.note, nowIso(), id);
      const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
      return sendJson(res, 200, row);
    }
    if (req.method === 'DELETE') {
      const r = db.prepare('DELETE FROM entries WHERE id = ?').run(id);
      if (r.changes === 0) return sendJson(res, 404, { error: '记录不存在' });
      return sendJson(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/categories' && req.method === 'GET') {
    const rows = db.prepare(
      `SELECT category, COUNT(*) AS count FROM entries WHERE category <> '' GROUP BY category ORDER BY count DESC, category COLLATE NOCASE`
    ).all();
    return sendJson(res, 200, { items: rows });
  }

  if (pathname === '/api/import' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf-8') || '{}');
    const items = Array.isArray(body.items) ? body.items : [];
    const mode = body.mode === 'replace' ? 'replace' : 'merge';
    if (!items.length) return sendJson(res, 400, { error: '没有可导入的数据' });

    // 合并时跳过与现有完全重复的记录（按所属+账户+密码判重）
    const existingKeys = new Set();
    if (mode === 'merge') {
      for (const row of db.prepare('SELECT owner, account, password FROM entries').all()) {
        existingKeys.add(`${row.owner}\u0000${row.account}\u0000${row.password}`);
      }
    }

    const insert = db.prepare(
      `INSERT INTO entries (owner, account, password, url, category, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = nowIso();
    let imported = 0, skipped = 0;

    db.exec('BEGIN');
    try {
      if (mode === 'replace') db.exec('DELETE FROM entries');
      for (const raw of items) {
        const e = normalizeEntry(raw);
        const key = `${e.owner}\u0000${e.account}\u0000${e.password}`;
        if (mode === 'merge' && existingKeys.has(key)) { skipped++; continue; }
        insert.run(e.owner, e.account, e.password, e.url, e.category, e.note, now, now);
        existingKeys.add(key);
        imported++;
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return sendJson(res, 200, { imported, skipped, mode });
  }

  if (pathname === '/api/export' && req.method === 'GET') {
    const items = db.prepare('SELECT * FROM entries ORDER BY updated_at DESC').all();
    const body = JSON.stringify({ exportedAt: nowIso(), count: items.length, items }, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="passbook-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    });
    res.end(body);
    return;
  }

  if (pathname === '/api/export-db' && req.method === 'GET') {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const buf = await readFile(DB_PATH);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="passwords.db"`,
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    res.end(buf);
    return;
  }

  return sendJson(res, 404, { error: '接口不存在' });
}

// ---------- 静态文件 ----------
async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(normalize(PUBLIC_DIR) + sep) && filePath !== normalize(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('禁止访问');
    return;
  }
  try {
    const st = await stat(filePath);
    if (!st.isFile()) throw new Error('not file');
    const ext = extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

// ---------- 启动 ----------
const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname.startsWith('/api/')) {
      await handleApi(req, res, u.pathname, u.searchParams);
    } else {
      await serveStatic(req, res, u.pathname);
    }
  } catch (err) {
    console.error('[server] 处理请求出错:', err.message);
    if (!res.headersSent) sendJson(res, 500, { error: err.message || '服务器内部错误' });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  const lanAddrs = lanIPs();
  console.log('==============================================');
  console.log('  密码本 (passbook) 已启动');
  console.log('  本机访问:  http://127.0.0.1:' + PORT);
  if (LAN) console.log('  局域网访问: http://' + lanAddrs[0] + ':' + PORT + '   (手机浏览器打开，可安装为 PWA)');
  console.log('  数据文件:  ' + DB_PATH);
  if (!LAN) console.log('  提示: 手机需要访问时，请用 --lan 参数启动 (node server.mjs --lan)');
  if (!process.env.DATA_DIR) console.log('  提示: 设置 DATA_DIR 可把数据库指向网盘同步文件夹，实现多端同步');
  console.log('==============================================');
  if (OPEN_BROWSER && process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', `http://127.0.0.1:${PORT}`], { detached: true, stdio: 'ignore' }).unref();
  } else if (OPEN_BROWSER && process.platform === 'darwin') {
    spawn('open', [`http://127.0.0.1:${PORT}`], { detached: true, stdio: 'ignore' }).unref();
  }
});

function lanIPs() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out.length ? out : ['<局域网IP>'];
}

process.on('SIGINT', () => { console.log('\n已停止'); db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });
