/**
 * 密码本 · 前端主逻辑
 * 双存储模式：
 *  - server: 连接本机服务端 API（node:sqlite），桌面端默认
 *  - local:  浏览器内 sql.js + IndexedDB 持久化，手机/PWA 端
 * 模式可在设置中切换，auto 为自动检测（能连上服务端就用服务端）。
 */
'use strict';

/* ---------------- 小工具 ---------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* 线条图标（Lucide 风格，stroke=currentColor） */
const ICONS = {
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  wand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
};

const LS_KEY = 'passbook-settings';

const DEFAULT_SETTINGS = {
  storageMode: 'auto', // auto | server | local
  pinHash: '',         // SHA-256(pin)，空 = 未启用
  gen: {},             // 生成器偏好
  wt: { hibp: true, staleMonths: 12 }, // 安全体检：联网泄露检查 + 陈旧阈值（月，0=不检查）
  lock: { autoLock: 'never', clipboard: 0 }, // 自动锁定（never/60/300/hidden 秒）+ 复制后清剪贴板（0/15/30 秒）
  theme: 'auto', // 外观：auto 跟随系统 | light | dark
  backup: { enabled: true, keep: 5, intervalMin: 60 }, // 自动备份快照（v2.2.0）
};

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------------- Tauri 桥接（桌面 / Android） ---------------- */
const IS_TAURI = typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
/** Android 端检测：用户代理里带 Android（Tauri 手机版） */
const IS_ANDROID = IS_TAURI && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

async function tauriInvoke(cmd, args) {
  return window.__TAURI__.core.invoke(cmd, args);
}

/** 桌面版数据库文件路径：优先用用户选择的位置，否则默认 app data 目录 */
async function getTauriDbPath() {
  let p = localStorage.getItem('passbook-db-path');
  if (!p) {
    p = await tauriInvoke('get_default_db_path');
    localStorage.setItem('passbook-db-path', p);
  }
  return p;
}

function fmtTime(iso) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------------- Toast ---------------- */
function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ---------------- 弹窗 ---------------- */
let pbSuppressPop = false; // 按钮主动关闭时置位，让随后的 popstate 不再重复处理
function openModal(html, wide = false) {
  history.pushState({ pb: 1 }, ''); // 压一层，系统返回键/浏览器后退优先关弹窗
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-mask"><div class="modal${wide ? ' wide' : ''}">${html}</div></div>`;
  root.querySelector('.modal-mask').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  root.querySelector('.modal-close')?.addEventListener('click', closeModal);
}
function closeModal() {
  $('#modal-root').innerHTML = '';
  if (history.state && history.state.pb) { pbSuppressPop = true; history.back(); } // 同步历史栈
}

/* ---------------- 数据库 schema（server 与 local 共用） ---------------- */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL DEFAULT '',
    account TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    totp_secret TEXT NOT NULL DEFAULT '',
    history TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entries_owner ON entries(owner);
  CREATE INDEX IF NOT EXISTS idx_entries_account ON entries(account);
  CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL DEFAULT 0,
    data BLOB,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_entry ON attachments(entry_id);
`;

/** 附件大小上限（字节）：单文件 2MB */
const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

const FIELDS = ['owner', 'account', 'password', 'url', 'category', 'note', 'totp_secret', 'history'];

function escLike(s) { return s.replace(/[\\%_]/g, (m) => '\\' + m); }

/* ---------------- 密码历史（v1.5.0） ---------------- */
/** 追加旧密码到历史（时间正序，最多保留 cap 条） */
function appendHistory(histJson, oldPassword, changedAtIso, cap = 20) {
  if (!oldPassword) return histJson || '';
  let list = [];
  try { const a = JSON.parse(histJson || '[]'); if (Array.isArray(a)) list = a; } catch { /* 损坏则重建 */ }
  list.push({ password: oldPassword, changedAt: changedAtIso });
  if (list.length > cap) list = list.slice(list.length - cap);
  return JSON.stringify(list);
}
function parseHistory(histJson) {
  try { const a = JSON.parse(histJson || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

/* ---------------- 存储层：服务端 ---------------- */
const ServerStore = {
  async health() {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok) throw new Error('服务端不可用');
    return r.json();
  },
  async list({ q = '', category = '', sort = 'updated' } = {}) {
    const p = new URLSearchParams({ q, category, sort });
    const r = await fetch('/api/entries?' + p, { cache: 'no-store' });
    if (!r.ok) throw new Error('获取列表失败');
    return r.json();
  },
  async create(entry) {
    const r = await fetch('/api/entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '保存失败');
    return j;
  },
  async update(id, patch) {
    const r = await fetch('/api/entries/' + id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '更新失败');
    return j;
  },
  async remove(id) {
    const r = await fetch('/api/entries/' + id, { method: 'DELETE' });
    if (!r.ok) throw new Error('删除失败');
  },
  async categories() {
    const r = await fetch('/api/categories', { cache: 'no-store' });
    return r.json();
  },
  async importItems(items, mode) {
    const r = await fetch('/api/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, mode }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '导入失败');
    return j;
  },
  async exportJson() {
    const r = await fetch('/api/export', { cache: 'no-store' });
    if (!r.ok) throw new Error('导出失败');
    return r.json();
  },
  async exportDb() {
    const r = await fetch('/api/export-db', { cache: 'no-store' });
    if (!r.ok) throw new Error('导出数据库失败');
    return r.blob();
  },
  async dbPath() {
    const h = await this.health();
    return h.dbPath;
  },

  /* ---------------- 附件（v2.4.0）：服务端存储，BLOB 存库 ---------------- */
  attachments: {
    async list(entryId) {
      const r = await fetch('/api/attachments?entry_id=' + encodeURIComponent(entryId), { cache: 'no-store' });
      if (!r.ok) throw new Error('获取附件失败');
      return r.json();
    },
    async add(entryId, { name, mime, dataB64 }) {
      const bytes = base64ToBytes(dataB64);
      if (bytes.byteLength > ATTACHMENT_MAX_BYTES) throw new Error('附件超过 2MB 上限');
      const r = await fetch('/api/attachments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, name, mime, dataB64 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '上传失败');
      return j.id;
    },
    async get(id) {
      const r = await fetch('/api/attachments/' + encodeURIComponent(id), { cache: 'no-store' });
      if (!r.ok) throw new Error('读取附件失败');
      return r.json();
    },
    async remove(id) {
      const r = await fetch('/api/attachments/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!r.ok) throw new Error('删除附件失败');
    },
    async countByEntry() {
      const r = await fetch('/api/attachments-count', { cache: 'no-store' });
      if (!r.ok) throw new Error('获取附件计数失败');
      return r.json();
    },
  },
};

/* ---------------- 存储层：浏览器本地 (sql.js + IndexedDB) ---------------- */
const IDB_NAME = 'passbook-db';
const IDB_STORE = 'kv';

function idbOpen() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(IDB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(IDB_STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const rq = tx.objectStore(IDB_STORE).get(key);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbKeys() {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const rq = tx.objectStore(IDB_STORE).getAllKeys();
    rq.onsuccess = () => res(rq.result || []);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

let SQL_MODULE = null;
async function getSqlModule() {
  if (SQL_MODULE) return SQL_MODULE;
  // sql-wasm.js 已在 index.html 加载，暴露全局 initSqlJs
  if (typeof initSqlJs !== 'function') throw new Error('sql.js 未加载');
  SQL_MODULE = await initSqlJs({ locateFile: (f) => 'lib/' + f });
  return SQL_MODULE;
}

const LocalStore = {
  db: null,
  /* 会话内加密状态（仅存内存）：密钥材料 / 当前文件 salt / 是否加密 */
  _key: null,
  _encSalt: null,
  _encrypted: false,

  /** 本机密钥材料存储键（base64 随机 32 字节，仅本机保存，不随 .db 文件走） */
  KEY_STORE: 'passbook-enc-key',
  /** 读取本机保存的密钥材料（没有则返回 null） */
  getStoredKey() {
    try { return localStorage.getItem(this.KEY_STORE) || null; } catch { return null; }
  },
  saveKey(k) { try { localStorage.setItem(this.KEY_STORE, k); } catch {} },
  clearKey() { try { localStorage.removeItem(this.KEY_STORE); } catch {} },

  /** 生成新密钥材料并保存到本机（32 字节随机 → base64） */
  async generateKey() {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return btoa(String.fromCharCode(...b));
  },

  /** 从本机密钥材料派生当前会话 AES 密钥（惰性，首次读取时按文件 salt 派生） */
  get _encKey() {
    return this.__encKey;
  },
  set _encKey(k) { this.__encKey = k; },

  /** 原始文件字节（未解密，供加密检测/验证） */
  async readRawBytes() { return await this._readRaw(); },
  /** 当前数据库文件是否已加密 */
  async isEncryptedFile() { return DbCrypto.isEncrypted(await this._readRaw()); },

  async init() {
    const SQL = await getSqlModule();
    const bytes = await LocalStore._readBytes();
    if (bytes && bytes.byteLength > 0) {
      this.db = new SQL.Database(new Uint8Array(bytes));
    } else {
      this.db = new SQL.Database();
      this.db.run(SCHEMA_SQL);
      await this.persist();
    }
    // v1.3.0/v1.5.0 迁移：为旧库补 totp_secret / history 列（幂等）
    const cols = this.query('PRAGMA table_info(entries)').map((c) => c.name);
    let migrated = false;
    if (!cols.includes('totp_secret')) { this.db.run("ALTER TABLE entries ADD COLUMN totp_secret TEXT NOT NULL DEFAULT ''"); migrated = true; }
    if (!cols.includes('history')) { this.db.run("ALTER TABLE entries ADD COLUMN history TEXT NOT NULL DEFAULT ''"); migrated = true; }
    if (migrated) await this.persist();
  },
  /** 读取底层原始字节：Tauri 下从数据库文件读，否则从 IndexedDB 读 */
  async _readRaw() {
    if (IS_TAURI) {
      const path = await getTauriDbPath();
      const bytes = await tauriInvoke('read_db_file', { path });
      return bytes && bytes.length ? new Uint8Array(bytes) : null;
    }
    return await idbGet('db');
  },
  /** 读取持久化字节（密文自动解密为明文，供 sql.js 载入内存） */
  async _readBytes() {
    const bytes = await this._readRaw();
    if (bytes && bytes.byteLength > 0) {
      if (DbCrypto.isEncrypted(bytes)) {
        this._encrypted = true;
        if (!this._encKey) {
          if (!this._key) throw new Error('DB_ENCRYPTED_NEED_KEY');
          this._encSalt = DbCrypto.saltOf(bytes);
          this._encKey = await DbCrypto.deriveKey(this._key, this._encSalt);
        }
        return await DbCrypto.decryptBytes(bytes, this._encKey);
      }
      this._encrypted = false;
      return bytes;
    }
    return null;
  },
  async persist() {
    const bytes = this.db.export();
    let out = bytes;
    if (this._encrypted) {
      if (!this._encKey) throw new Error('加密状态异常：会话密钥缺失');
      out = await DbCrypto.encryptBytes(bytes, this._encKey, this._encSalt);
    }
    if (IS_TAURI) {
      const path = await getTauriDbPath();
      await tauriInvoke('write_db_file', { path, bytes: Array.from(out) });
    } else {
      await idbSet('db', out);
    }
  },
  /** 启用加密：生成随机密钥（自动保存本机），把整库重写为密文 */
  async enableEncryption() {
    if (!DbCrypto.hasWebCrypto()) throw new Error('当前环境不支持加密（需应用内或 HTTPS 打开）');
    if (this._encrypted) throw new Error('数据库已加密');
    const key = await this.generateKey();
    this._encSalt = DbCrypto.newSalt();
    this._encKey = await DbCrypto.deriveKey(key, this._encSalt);
    this._key = key;
    this._encrypted = true;
    this.saveKey(key);
    await this.persist();
    return key; // 返回密钥材料，供设置页展示备份
  },
  /** 关闭加密：把整库重写为明文，并删除本机保存的密钥 */
  async disableEncryption() {
    if (!this._encrypted) throw new Error('当前文件未加密');
    this._encKey = null; this._encSalt = null; this._key = null; this._encrypted = false;
    this.clearKey();
    await this.persist();
  },
  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally { stmt.free(); }
  },
  lastInsertId() {
    const rows = this.query('SELECT last_insert_rowid() AS id');
    return rows[0].id;
  },
  async list({ q = '', category = '', sort = 'updated' } = {}) {
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
    const items = this.query(sql, params);
    return { items, total: items.length };
  },
  async create(entry) {
    const now = new Date().toISOString();
    this.db.run(
      'INSERT INTO entries (owner, account, password, url, category, note, totp_secret, history, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [entry.owner, entry.account, entry.password, entry.url, entry.category, entry.note, entry.totp_secret ?? '', entry.history ?? '', now, now]
    );
    const id = this.lastInsertId();
    await this.persist();
    return this.query('SELECT * FROM entries WHERE id = ?', [id])[0];
  },
  async update(id, patch) {
    const cur = this.query('SELECT * FROM entries WHERE id = ?', [id])[0];
    if (!cur) throw new Error('记录不存在');
    const merged = { ...cur, ...patch };
    // 密码变更时自动归档旧密码（忽略客户端传入的 history，始终服务端计算）
    const hist = merged.password !== cur.password
      ? appendHistory(cur.history, cur.password, new Date().toISOString())
      : (cur.history || '');
    this.db.run(
      'UPDATE entries SET owner=?, account=?, password=?, url=?, category=?, note=?, totp_secret=?, history=?, updated_at=? WHERE id=?',
      [merged.owner, merged.account, merged.password, merged.url, merged.category, merged.note, merged.totp_secret ?? '', hist, new Date().toISOString(), id]
    );
    await this.persist();
    return this.query('SELECT * FROM entries WHERE id = ?', [id])[0];
  },
  async remove(id) {
    this.db.run('DELETE FROM entries WHERE id = ?', [id]);
    this.db.run('DELETE FROM attachments WHERE entry_id = ?', [id]); // 级联清理附件（v2.4.0）
    await this.persist();
  },
  async categories() {
    const rows = this.query(
      `SELECT category, COUNT(*) AS count FROM entries WHERE category <> '' GROUP BY category ORDER BY count DESC, category COLLATE NOCASE`
    );
    return { items: rows };
  },
  async importItems(items, mode) {
    const existingKeys = new Set();
    if (mode === 'merge') {
      for (const r of this.query('SELECT owner, account, password FROM entries')) {
        existingKeys.add(`${r.owner}\u0000${r.account}\u0000${r.password}`);
      }
    }
    const now = new Date().toISOString();
    let imported = 0, skipped = 0;
    // 事务：中途失败整体回滚（避免覆盖模式清空一半后中断丢数据）
    this.db.exec('BEGIN');
    try {
      if (mode === 'replace') this.db.run('DELETE FROM entries');
      for (const raw of items) {
        const e = {};
        for (const f of FIELDS) e[f] = typeof raw[f] === 'string' ? raw[f] : '';
        const key = `${e.owner}\u0000${e.account}\u0000${e.password}`;
        if (mode === 'merge' && existingKeys.has(key)) { skipped++; continue; }
        this.db.run(
          'INSERT INTO entries (owner, account, password, url, category, note, totp_secret, history, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [e.owner, e.account, e.password, e.url, e.category, e.note, e.totp_secret ?? '', typeof e.history === 'string' ? e.history : '', now, now]
        );
        existingKeys.add(key);
        imported++;
      }
      this.db.exec('COMMIT');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* 连回滚都失败则保持原状 */ }
      throw err;
    }
    await this.persist();
    return { imported, skipped, mode };
  },
  async exportJson() {
    const items = this.query('SELECT * FROM entries ORDER BY updated_at DESC');
    return { exportedAt: new Date().toISOString(), count: items.length, items };
  },
  async exportDb() {
    if (IS_TAURI) {
      // 桌面版：弹系统保存对话框，复制数据库文件
      const srcPath = await getTauriDbPath();
      const dest = await tauriInvoke('export_db', { srcPath });
      return { tauriPath: dest };
    }
    const bytes = this.db.export();
    return new Blob([bytes], { type: 'application/octet-stream' });
  },
  async exportJsonToFile() {
    if (IS_TAURI) {
      const data = await this.exportJson();
      const contents = JSON.stringify(data, null, 2);
      const dest = await tauriInvoke('export_json', { contents });
      return { tauriPath: dest };
    }
    return null;
  },
  async dbPath() { return '浏览器本地 (IndexedDB)'; },

  /* ---------------- 附件（v2.4.0）：BLOB 存库，随库文件整体加密 ---------------- */
  attachments: {
    async list(entryId) {
      return LocalStore.query(
        'SELECT id, entry_id, name, mime, size, created_at FROM attachments WHERE entry_id = ? ORDER BY id',
        [entryId],
      );
    },
    async add(entryId, { name, mime, dataB64 }) {
      const bytes = base64ToBytes(dataB64);
      if (bytes.byteLength > ATTACHMENT_MAX_BYTES) throw new Error('附件超过 2MB 上限');
      LocalStore.db.run(
        'INSERT INTO attachments (entry_id, name, mime, size, data, created_at) VALUES (?,?,?,?,?,?)',
        [entryId, name, mime || 'application/octet-stream', bytes.byteLength, bytes, new Date().toISOString()],
      );
      await LocalStore.persist();
      return LocalStore.lastInsertId();
    },
    async get(id) {
      return LocalStore.query('SELECT * FROM attachments WHERE id = ?', [id])[0] || null;
    },
    async remove(id) {
      LocalStore.db.run('DELETE FROM attachments WHERE id = ?', [id]);
      await LocalStore.persist();
    },
    async countByEntry() {
      const rows = LocalStore.query('SELECT entry_id, COUNT(*) AS n FROM attachments GROUP BY entry_id');
      const map = {};
      for (const r of rows) map[r.entry_id] = r.n;
      return map;
    },
  },
};

/** base64 → Uint8Array */
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** Uint8Array → base64（分块避免参数栈溢出） */
function bytesToBase64(bytes) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

/* ---------------- 存储层选择 ---------------- */
let store = null;
let currentMode = 'server';

async function detectMode() {
  // 桌面版（Tauri）：固定使用本地文件存储（sql.js + 数据库文件）
  if (IS_TAURI) return 'local';
  const s = loadSettings();
  if (s.storageMode === 'server') return 'server';
  if (s.storageMode === 'local') return 'local';
  // auto：触屏设备（手机/PWA）默认本机存储；桌面尝试连接服务端
  const isTouch = navigator.maxTouchPoints > 0 && 'ontouchstart' in window;
  if (isTouch) return 'local';
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch('/api/health', { cache: 'no-store', signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) return 'server';
  } catch { /* fallthrough */ }
  return 'local';
}

/** 解锁成功后，把当前数据库从旧密钥迁移到本机自动生成的密钥并保存 */
async function migrateToAutoKey() {
  const newKey = await LocalStore.generateKey();
  LocalStore._key = newKey;
  LocalStore._encSalt = DbCrypto.newSalt();
  LocalStore._encKey = await DbCrypto.deriveKey(newKey, LocalStore._encSalt);
  LocalStore._encrypted = true;
  LocalStore.saveKey(newKey);
  await LocalStore.persist();
}

async function initStore() {
  currentMode = await detectMode();
  store = currentMode === 'server' ? ServerStore : LocalStore;
  if (currentMode === 'local') {
    // 加密库解锁：优先用本机保存的密钥自动解密（无感）；没有/解不开时提示输入密钥文本或旧版主密码，
    // 解锁成功后自动迁移到「本机自动生成的新密钥」并保存（老版本主密码 → 新版本自动密钥兼容）
    const raw = await LocalStore.readRawBytes();
    if (DbCrypto.isEncrypted(raw)) {
      if (!DbCrypto.hasWebCrypto()) throw new Error('数据库已加密，当前环境缺少 WebCrypto（请通过应用或 HTTPS 打开）');
      let err = '';
      let usedUserInput = false;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let material = LocalStore.getStoredKey();
        if (!material) {
          material = await promptKeyInput(err, '数据库已加密。请输入密钥文本（新版备份）或旧版设置的主密码解锁，解锁后本应用会自动换用新密钥。');
          if (!material) throw new Error('需要密钥才能解锁加密数据库');
          usedUserInput = true;
        }
        LocalStore._key = material;
        try {
          await store.init();
          break;
        } catch (e) {
          LocalStore._key = null; LocalStore._encKey = null; LocalStore._encSalt = null; LocalStore._encrypted = false;
          if (/解密失败/.test(e.message)) { err = '密钥或密码错误，请重试'; continue; }
          throw e;
        }
      }
      // 迁移：仅当本次用「用户输入」解锁（旧版主密码 / 外部密钥文本）时，才重新生成本机密钥并保存，
      // 之后启动全自动；本机密钥直接解锁成功时保持不变（已备份的密钥文本继续有效）。
      if (usedUserInput) await migrateToAutoKey();
    } else {
      await store.init();
      // 老版本明文库升级：自动启用加密（自动密钥，用户无感）
      if (DbCrypto.hasWebCrypto() && !LocalStore.getStoredKey()) {
        await LocalStore.enableEncryption();
        toast('已自动启用数据库加密，密钥已保存在本机（设置 → 数据库加密 → 备份密钥）');
      }
    }
  }
  const badge = $('#mode-badge');
  badge.textContent = IS_TAURI ? (IS_ANDROID ? '手机版' : '桌面版') : (currentMode === 'server' ? '服务器存储' : '本机存储');
  badge.classList.toggle('local', currentMode !== 'server' || IS_TAURI);
}

/* ---------------- 密钥输入/展示弹窗 ---------------- */
/** 单输入框密钥弹窗：跨设备导入 / 旧版升级时输入密钥文本或旧主密码 */
function promptKeyInput(err = '', hint = '') {
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.style.zIndex = '320';
    mask.innerHTML = `
      <div class="modal" style="max-width:360px">
        <div class="modal-head"><h3>解锁加密数据库</h3><span></span></div>
        <div class="modal-body">
          <p class="hint" style="margin-bottom:8px">${escapeHtml(hint || '加密数据库需要解锁。请输入密钥文本（新版备份）或旧版设置的主密码。')}</p>
          <input type="password" placeholder="密钥文本或旧版主密码" style="border:1px solid var(--line);border-radius:10px;padding:12px;font-size:15px;width:100%;outline:none" autocomplete="off" />
          <p class="hint mpw-err" style="color:var(--danger);min-height:1em">${escapeHtml(err)}</p>
        </div>
        <div class="modal-foot" style="justify-content:center;gap:8px">
          <button class="btn" data-x="cancel" style="flex:1">取消</button>
          <button class="btn primary" data-x="ok" style="flex:2">确定</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const input = mask.querySelector('input');
    const done = (v) => { mask.remove(); resolve(v); };
    mask.querySelector('[data-x="ok"]').addEventListener('click', () => { if (input.value) done(input.value); });
    mask.querySelector('[data-x="cancel"]').addEventListener('click', () => done(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value) done(input.value);
      if (e.key === 'Escape') done(null);
    });
    input.focus();
  });
}

/** 显示密钥备份弹窗：展示密钥文本 + 复制按钮 */
function showKeyBackup(key) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.style.zIndex = '320';
  mask.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-head"><h3>数据库加密密钥</h3><span></span></div>
      <div class="modal-body">
        <p class="hint" style="margin-bottom:8px">请将下方密钥文本复制并保存在安全处（如密码管理器）。跨设备导入加密的 .db 文件时需要此密钥。</p>
        <textarea readonly style="width:100%;font-family:monospace;font-size:12px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);resize:none" rows="3">${escapeHtml(key)}</textarea>
        <p class="hint" style="color:var(--danger);margin-top:4px">⚠️ 丢失密钥将无法恢复加密数据库！</p>
      </div>
      <div class="modal-foot" style="justify-content:center;gap:8px">
        <button class="btn primary" id="btn-key-copy" style="flex:2">复制密钥</button>
        <button class="btn" id="btn-key-close" style="flex:1">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(mask);
  mask.querySelector('#btn-key-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(key).then(() => toast('密钥已复制')).catch(() => toast('复制失败，请手动选中文本复制', true));
  });
  mask.querySelector('#btn-key-close').addEventListener('click', () => mask.remove());
}

/* ---------------- 状态 ---------------- */
const state = {
  q: '',
  category: '',
  sort: 'updated',
  categories: [],
  total: 0,
  currentGenPw: '',
};

/* ---------------- 列表渲染 ---------------- */
async function refreshList() {
  try {
    // 强搜索管线（v2.1.0）：解析操作符与多词；
    // 单词无操作符 → 服务端 LIKE 粗筛后客户端打分高亮；
    // 多词/操作符 → 拉当前分类全量，客户端过滤排序
    const pq = (window.PassSearch || { parseQuery: (q) => ({ terms: q ? [q.toLowerCase()] : [], filters: {}, unknown: [] }) }).parseQuery(state.q);
    const advanced = pq.terms.length > 1 || Object.keys(pq.filters).length > 0 || (pq.unknown && pq.unknown.length);
    const serverQ = advanced ? '' : (pq.terms[0] || '');
    const { items, total } = await store.list({ q: serverQ, category: state.category, sort: state.sort });
    state.total = total;

    let shown = items, hitsMap = null;
    if (advanced || pq.terms.length === 1) {
      const res = window.PassSearch ? PassSearch.searchEntries(items, state.q) : null;
      if (res) {
        shown = res.map((r) => r.entry);
        hitsMap = {};
        for (const r of res) hitsMap[r.entry.id] = r.fields;
      }
    }
    renderEntries(shown, hitsMap);
    const filtered = state.q && shown.length !== total ? `${shown.length}/` : '';
    $('#count').textContent = `共 ${filtered}${total} 条`;
    $('#empty-state').classList.toggle('hidden', shown.length > 0);
    // 附件计数徽标（v2.4.0，失败静默——旧服务端无该接口）
    refreshAttachCounts().then(() => {
      if (!_attachCounts || !Object.keys(_attachCounts).length) return;
      renderEntries(shown, hitsMap);
    }).catch(() => {});
  } catch (e) {
    toast(e.message, true);
  }
}

let _attachCounts = {};
async function refreshAttachCounts() {
  try { _attachCounts = await store.attachments.countByEntry() || {}; }
  catch { _attachCounts = {}; }
}

function renderEntries(items, hitsMap) {
  const list = $('#entry-list');
  const hl = (field, id, text) => {
    const t = text == null ? '' : String(text);
    if (!hitsMap || !hitsMap[id] || !hitsMap[id][field] || !t) return escapeHtml(t);
    return PassSearch.highlightHtml(t, hitsMap[id][field], escapeHtml);
  };
  list.innerHTML = items.map((it) => {
    const cat = it.category ? `<span class="entry-cat">${hl('category', it.id, it.category)}</span>` : '';
    const attachBadge = _attachCounts[it.id]
      ? `<button class="entry-attach" data-act="attach" data-aname="${escapeHtml(it.owner)}" title="附件 ×${_attachCounts[it.id]}">${ICONS.paperclip}<span>${_attachCounts[it.id]}</span></button>`
      : '';
    const url = it.url ? `<a class="entry-url" href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">${hl('url', it.id, it.url)}</a>` : '';
    const note = it.note ? `<div class="entry-note">${hl('note', it.id, it.note)}</div>` : '';
    return `
      <div class="entry" data-id="${it.id}">
        <div class="entry-top">
          <div class="entry-main">
            <div class="entry-title">
              <span class="entry-owner">${hl('owner', it.id, it.owner)}</span>
              ${cat}
              ${attachBadge}
            </div>
            <div class="entry-account">${hl('account', it.id, it.account)}</div>
            ${url}
            ${note}
            <div class="entry-pw">
              <span class="pw-masked" data-pw="${escapeHtml(it.password)}">••••••••</span>
              <div class="pw-actions">
                <button data-act="toggle" title="显示/隐藏">${ICONS.eye}</button>
                <button data-act="copy" title="复制">${ICONS.copy}</button>
              </div>
            </div>
            ${it.totp_secret ? `
            <div class="entry-totp">
              <svg class="totp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <span class="totp-code" data-totp="${escapeHtml(it.totp_secret)}">······</span>
              <span class="totp-remain"></span>
              <button data-act="copy-totp" title="复制验证码">${ICONS.copy}</button>
            </div>` : ''}
          </div>
          <div class="entry-side">
            <span class="entry-time">${fmtTime(it.updated_at)}</span>
            <div class="entry-ops">
              ${parseHistory(it.history).length ? `<button data-act="history" title="密码历史">${ICONS.history}</button>` : ''}
              <button data-act="edit" title="编辑">${ICONS.edit}</button>
              <button data-act="del" class="del" title="删除">${ICONS.trash}</button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

/** 卡片附件入口弹窗（v2.4.0）：列出该条目附件，点击查看/下载 */
async function openAttachmentsModal(entryId, title) {
  let list;
  try { list = await store.attachments.list(entryId); }
  catch (e) { toast(e.message, true); return; }
  openModal(`
    <div class="modal-head">
      <h3>${ICONS.paperclip} ${escapeHtml(title || '附件')}</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="attach-list modal-attach-list">
        ${list.length ? list.map((a) => `
          <div class="attach-item" data-aid="${a.id}" data-aname="${escapeHtml(a.name)}">
            <span class="attach-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
            <span class="attach-size">${fmtSize(a.size)}</span>
            <button class="btn" data-aact="view">查看</button>
          </div>`).join('') : '<p class="hint">无附件。编辑条目时可添加。</p>'}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn primary" id="btn-attm-close">关闭</button>
    </div>
  `, false);
  $('#btn-attm-close').addEventListener('click', closeModal);
  $('.modal-attach-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-aact]');
    if (!btn) return;
    const row = btn.closest('.attach-item');
    try { await openAttachmentViewer(Number(row.dataset.aid), row.dataset.aname || 'attachment'); }
    catch (err) { toast('读取失败：' + err.message, true); }
  });
}

/* TOTP 码每秒刷新（只更新可见的动态码元素，无则空转） */
setInterval(async () => {
  for (const el of document.querySelectorAll('.totp-code[data-totp]')) {
    try {
      const { code, remaining } = await PassTotp.generateTotp(el.dataset.totp);
      el.textContent = code.replace(/(\d{3})(\d{3})/, '$1 $2');
      const box = el.closest('.entry-totp');
      if (box) {
        const r = box.querySelector('.totp-remain');
        if (r) r.textContent = remaining + 's';
        box.classList.toggle('expiring', remaining <= 5);
      }
    } catch { el.textContent = '密钥无效'; }
  }
}, 1000);

$('#entry-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('.entry');
  const id = Number(card.dataset.id);
  const act = btn.dataset.act;
  if (act === 'toggle') {
    const pw = card.querySelector('.pw-masked');
    if (pw.classList.contains('revealed')) {
      pw.classList.remove('revealed');
      pw.textContent = '••••••••';
      btn.innerHTML = ICONS.eye;
    } else {
      pw.classList.add('revealed');
      pw.textContent = pw.dataset.pw;
      btn.innerHTML = ICONS.eyeOff;
    }
  } else if (act === 'copy') {
    await copyText(card.querySelector('.pw-masked').dataset.pw);
  } else if (act === 'copy-totp') {
    const secret = card.querySelector('.totp-code')?.dataset.totp;
    if (!secret) return;
    try { const { code } = await PassTotp.generateTotp(secret); await copyText(code); } catch (e) { toast(e.message, true); }
  } else if (act === 'history') {
    const item = (await store.list({})).items.find((x) => x.id === id);
    if (item) openHistoryModal(item);
  } else if (act === 'attach') {
    openAttachmentsModal(id, btn.dataset.aname || '');
  } else if (act === 'edit') {
    const list = await store.list({});
    const item = list.items.find((x) => x.id === id);
    if (item) openEditModal(item);
  } else if (act === 'del') {
    const item = (await store.list({})).items.find((x) => x.id === id);
    if (!item) return;
    if (confirm(`确定删除「${item.owner} / ${item.account}」吗？`)) {
      try {
        await store.remove(id);
        toast('已删除');
        refreshChips();
        refreshList();
      } catch (err) { toast(err.message, true); }
    }
  }
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制到剪贴板');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('已复制到剪贴板');
  }
  scheduleClipboardClear();
}

/* ---------------- 自动锁定 + 剪贴板自动清除（v1.4.0） ---------------- */
let clipClearTimer = null;
let lastUserActivity = Date.now();
['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((ev) =>
  document.addEventListener(ev, () => { lastUserActivity = Date.now(); }, { passive: true, capture: true })
);

function scheduleClipboardClear() {
  const ms = PassLock.msUntilClear(loadSettings().lock);
  if (!ms) return;
  clearTimeout(clipClearTimer);
  clipClearTimer = setTimeout(async () => {
    try { await navigator.clipboard.writeText(' '); } catch { /* 尽力而为 */ }
    try { await navigator.clipboard.writeText(''); } catch { /* 部分平台不接受空串 */ }
    toast('剪贴板已自动清除');
  }, ms);
}

function doAutoLock() {
  if (!loadSettings().pinHash) return; // 未启用启动锁则无锁可上
  unlocked = false;
  closeModal();
  refreshList(); // 重新打码已显示的密码与验证码
  showLockIfNeeded();
}

setInterval(() => {
  if (PassLock.shouldLock({ lastActivity: lastUserActivity, now: Date.now(), hidden: document.hidden, cfg: loadSettings().lock })) doAutoLock();
}, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && PassLock.shouldLock({ hidden: true, cfg: loadSettings().lock })) doAutoLock();
});

/* ---------------- 主题（v1.6.0） ---------------- */
function applyThemeNow() {
  const eff = PassTheme.applyTheme(document, loadSettings().theme, window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', eff === 'dark' ? '#12151c' : '#ffffff');
  return eff;
}
applyThemeNow();
// 跟随系统模式下，系统切换深浅时实时换肤
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (PassTheme.normalizeTheme(loadSettings().theme) === 'auto') applyThemeNow();
});

// 自动备份调度（v2.2.0）：延迟启动避免与首屏竞争
scheduleAutoBackup();

/* ---------------- 分类 chips ---------------- */
async function refreshChips() {
  const { items } = await store.categories();
  state.categories = items;
  const box = $('#category-chips');
  const all = `<span class="chip ${state.category === '' ? 'active' : ''}" data-cat="">全部</span>`;
  const chips = items.map((c) =>
    `<span class="chip ${state.category === c.category ? 'active' : ''}" data-cat="${escapeHtml(c.category)}">${escapeHtml(c.category)} (${c.count})</span>`
  ).join('');
  box.innerHTML = all + chips;
}
$('#category-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.category = chip.dataset.cat;
  refreshChips();
  refreshList();
});

/* ---------------- 生成器 ---------------- */
const GEN_DEFAULTS = { length: 16, upper: true, lower: true, digit: true, symbol: true, symbols: '', ensure: true, ambiguous: true, noadj: false, norepeat: false, noseq: false, exclude: '' };

/** 短语模式选项（v2.3.0） */
function ppOptsFromUi() {
  return {
    list: $('#gen-pp-list').value,
    words: Number($('#gen-pp-words').value) || 6,
    separator: $('#gen-pp-sep').value,
    capitalize: $('#gen-pp-cap').checked,
    includeNumber: $('#gen-pp-num').checked,
  };
}

/** 当前生成模式：char | phrase（v2.3.0） */
function genMode() {
  const active = document.querySelector('.gen-tab.active');
  return active ? active.dataset.genmode : 'char';
}

function setGenMode(mode) {
  const m = mode === 'phrase' ? 'phrase' : 'char';
  document.querySelectorAll('.gen-tab').forEach((b) => b.classList.toggle('active', b.dataset.genmode === m));
  $('#gen-char-section').classList.toggle('hidden', m !== 'char');
  $('#gen-phrase-section').classList.toggle('hidden', m !== 'phrase');
}

function genOptsFromUi() {
  const s = loadSettings();
  const g = s.gen || {};
  const get = (key, dflt) => {
    const el = $('#gen-' + key);
    if (!el) return dflt;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  };
  return {
    length: Number($('#gen-length').value) || 16,
    upper: get('upper', true),
    lower: get('lower', true),
    digit: get('digit', true),
    symbol: get('symbol', true),
    symbols: $('#gen-symbols').value.trim() || undefined,
    ensureEach: $('#gen-ensure').checked,
    excludeAmbiguous: $('#gen-ambiguous').checked,
    noKeyboardAdjacent: $('#gen-noadj').checked,
    noRepeat: $('#gen-norepeat').checked,
    noSequence: $('#gen-noseq').checked,
    excludeChars: $('#gen-exclude').value,
  };
}

function genPrefsFromOpts(o) {
  return {
    length: o.length,
    upper: o.upper, lower: o.lower, digit: o.digit, symbol: o.symbol,
    symbols: o.symbols || '',
    ensure: o.ensureEach, ambiguous: o.excludeAmbiguous,
    noadj: o.noKeyboardAdjacent, norepeat: o.noRepeat, noseq: o.noSequence,
    exclude: o.excludeChars || '',
  };
}

function runGenerate() {
  try {
    if (genMode() === 'phrase') {
      const o = ppOptsFromUi();
      const pw = PassPhrase.generatePassphrase(o);
      state.currentGenPw = pw;
      $('#gen-pw').textContent = pw;
      const bits = PassPhrase.entropyPassphrase(o);
      const s = PassPhrase.strengthLabel(bits);
      $('#gen-entropy').textContent = `熵值约 ${bits} bits · 强度：${s.label}`;
      $('#gen-result').classList.remove('hidden');
      const settings = loadSettings();
      settings.gen = { ...(settings.gen || {}), pp: o };
      saveSettings(settings);
      return;
    }
    const o = genOptsFromUi();
    const pw = PassGen.generate(o);
    state.currentGenPw = pw;
    $('#gen-pw').textContent = pw;
    const bits = PassGen.entropy(o);
    const s = PassGen.strengthLabel(bits);
    $('#gen-entropy').textContent = `熵值约 ${bits} bits · 强度：${s.label}`;
    $('#gen-result').classList.remove('hidden');
    // 记住偏好
    const settings = loadSettings();
    settings.gen = genPrefsFromOpts(o);
    saveSettings(settings);
  } catch (e) {
    toast(e.message, true);
  }
}

function showGenPanel() {
  const settings = loadSettings();
  const g = { ...GEN_DEFAULTS, ...(settings.gen || {}) };
  $('#gen-length').value = g.length;
  for (const k of ['upper', 'lower', 'digit', 'symbol']) {
    const el = $('#gen-charsets input[value="' + k + '"]');
    if (el) el.checked = g[k];
  }
  $('#gen-symbols').value = g.symbols || '';
  $('#gen-ensure').checked = g.ensure;
  $('#gen-ambiguous').checked = g.ambiguous;
  $('#gen-noadj').checked = g.noadj;
  $('#gen-norepeat').checked = g.norepeat;
  $('#gen-noseq').checked = g.noseq;
  $('#gen-exclude').value = g.exclude || '';
  // 短语模式偏好（v2.3.0）
  if (g.pp) {
    $('#gen-pp-list').value = g.pp.list || 'zh';
    $('#gen-pp-words').value = g.pp.words || 6;
    $('#gen-pp-sep').value = g.pp.separator ?? '-';
    $('#gen-pp-cap').checked = !!g.pp.capitalize;
    $('#gen-pp-num').checked = g.pp.includeNumber !== false;
  }
  if ($('#gen-panel').classList.contains('hidden')) history.pushState({ pb: 1 }, ''); // 返回键可先收起生成器
  $('#gen-panel').classList.remove('hidden');
}

// 模式切换（v2.3.0）
document.querySelectorAll('.gen-tab').forEach((b) => {
  b.addEventListener('click', () => setGenMode(b.dataset.genmode));
});

$('#btn-generate').addEventListener('click', runGenerate);
$('#btn-regenerate').addEventListener('click', runGenerate);
$('#btn-copy-gen').addEventListener('click', () => state.currentGenPw && copyText(state.currentGenPw));
$('#btn-save-gen').addEventListener('click', () => {
  if (!state.currentGenPw) return;
  openEditModal(null, state.currentGenPw);
});
$('#btn-gen-open').addEventListener('click', () => {
  showGenPanel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#btn-manual-add').addEventListener('click', () => {
  openManualAddModal();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#btn-gen-close').addEventListener('click', () => {
  $('#gen-panel').classList.add('hidden');
  if (history.state && history.state.pb) history.back();
});

/* ---------------- 编辑 / 新建弹窗 ---------------- */
/* ---------------- 附件查看/下载（v2.4.0）：BLOB → 内存 URL，不落盘 ---------------- */
let _attachUrl = null;
function revokeAttachUrl() {
  if (_attachUrl) { URL.revokeObjectURL(_attachUrl); _attachUrl = null; }
}

/** File → base64 */
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error || new Error('读取文件失败'));
    r.readAsDataURL(file);
  });
}

function fmtSize(n) {
  const b = Number(n) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KiB';
  return (b / 1024 / 1024).toFixed(2) + ' MiB';
}

/** 附件查看弹窗：图片直接预览；任意类型可另存（Tauri 对话框 / 浏览器下载） */
async function openAttachmentViewer(aid, name) {
  const a = await store.attachments.get(aid);
  if (!a || !a.data) throw new Error('附件内容为空');
  const bytes = base64ToBytes(a.data);
  const blob = new Blob([bytes], { type: a.mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  revokeAttachUrl();
  _attachUrl = url;
  const isImage = /^image\//.test(a.mime || '');
  const preview = isImage
    ? `<img class="attach-preview" src="${url}" alt="${escapeHtml(name)}" />`
    : `<div class="attach-nopreview">${escapeHtml(name)}</div>`;
  openModal(`
    <div class="modal-head">
      <h3>${escapeHtml(name)}</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      ${preview}
      <p class="hint">${escapeHtml(a.mime || '未知类型')} · ${fmtSize(bytes.byteLength)}</p>
    </div>
    <div class="modal-foot">
      <button class="btn" id="btn-attach-save">另存为…</button>
      <button class="btn primary" id="btn-attach-close">关闭</button>
    </div>
  `, false);
  $('#btn-attach-close').addEventListener('click', () => { revokeAttachUrl(); closeModal(); });
  document.querySelector('.modal-close')?.addEventListener('click', revokeAttachUrl);
  $('#btn-attach-save').addEventListener('click', async () => {
    try {
      if (IS_TAURI) {
        const dest = await tauriInvoke('export_bytes', { bytes: Array.from(bytes), suggestedName: name });
        if (dest) toast('已保存：' + dest);
      } else {
        const el = document.createElement('a');
        el.href = url;
        el.download = name;
        el.click();
      }
    } catch (e) { toast('保存失败：' + e.message, true); }
  });
}

function openEditModal(item = null, prefillPw = '') {
  const isNew = !item;  const v = (x) => (item && item[x]) ?? '';
  openModal(`
    <div class="modal-head">
      <h3>${isNew ? '保存到密码本' : '编辑密码'}</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <label class="field"><span>所属（应用/网站）*</span>
          <input id="f-owner" placeholder="如：GitHub" value="${escapeHtml(v('owner'))}" />
          <datalist id="dl-owner"></datalist>
        </label>
        <label class="field"><span>账户 *</span>
          <input id="f-account" placeholder="如：user@example.com" value="${escapeHtml(v('account'))}" />
          <datalist id="dl-account"></datalist>
        </label>
      </div>
      <label class="field"><span>密码 *</span>
        <div class="pw-input-row">
          <input id="f-password" type="text" value="${escapeHtml(v('password') || prefillPw)}" autocomplete="off" />
          <button class="btn" id="btn-gen-again" title="用当前生成器设置重新生成">${ICONS.refresh}</button>
        </div>
      </label>
      <label class="field"><span>动态验证码 TOTP（可选）</span>
        <input id="f-totp" placeholder="base32 密钥或 otpauth:// 链接，粘贴自动提取" value="${escapeHtml(v('totp_secret'))}" autocomplete="off" spellcheck="false" />
      </label>
      <div class="form-row">
        <label class="field"><span>分类（可选）</span>
          <input id="f-category" placeholder="如：工作 / 个人 / 邮箱" value="${escapeHtml(v('category'))}" />
          <datalist id="dl-category"></datalist>
        </label>
        <label class="field"><span>网址（可选）</span>
          <input id="f-url" type="url" placeholder="https://…" value="${escapeHtml(v('url'))}" />
        </label>
      </div>
      <label class="field"><span>备注（可选）</span>
        <textarea id="f-note" placeholder="如：安全问题答案、注册邮箱…">${escapeHtml(v('note'))}</textarea>
      </label>
      ${isNew ? '' : `
      <div class="field"><span>附件（最多 2MB/个，随数据库加密存储）</span>
        <div class="attach-box">
          <input type="file" id="f-attach-file" class="hidden" />
          <button class="btn" id="btn-attach-add" type="button">＋ 添加附件</button>
          <div id="attach-list" class="attach-list"></div>
        </div>
      </div>`}
    </div>
    <div class="modal-foot">
      ${isNew ? '' : '<button class="btn danger" id="btn-del-from-modal">删除</button>'}
      <button class="btn" id="btn-cancel">取消</button>
      <button class="btn primary" id="btn-save">保存</button>
    </div>
  `, false);

  // 自动补全：仅输入时填充并绑定 datalist（避免移动端无输入时展开）
  (async () => {
    const all = await store.list({});
    const owners = new Set(), accounts = new Set(), cats = new Set();
    for (const x of all.items) { owners.add(x.owner); accounts.add(x.account); if (x.category) cats.add(x.category); }
    const pools = {
      'f-owner': [...owners],
      'f-account': [...accounts],
      'f-category': [...cats],
    };
    const bind = (inputId, dlId, pool) => {
      const input = $('#' + inputId);
      const dl = $('#' + dlId);
      const refresh = () => {
        const q = input.value.trim();
        if (!q) { dl.innerHTML = ''; input.removeAttribute('list'); return; }
        const low = q.toLowerCase();
        const hit = pool.filter((x) => x && x.toLowerCase().includes(low));
        dl.innerHTML = hit.map((x) => `<option value="${escapeHtml(x)}">`).join('');
        if (hit.length > 0) input.setAttribute('list', dlId); else input.removeAttribute('list');
      };
      input.addEventListener('input', refresh);
      // 不监听 focus：仅在用户实际输入时展开，选中/聚焦不弹列表
      input.addEventListener('change', () => { dl.innerHTML = ''; input.removeAttribute('list'); });
    };
    for (const [id, pool] of Object.entries(pools)) {
      if (pool.length) bind(id, 'dl-' + id, pool);
    }
  })();

  $('#btn-cancel')?.addEventListener('click', closeModal);

  // 附件区（v2.4.0，仅编辑已有条目）
  if (!isNew) {
    const renderAttachList = async () => {
      const box = $('#attach-list');
      if (!box) return;
      try {
        const list = await store.attachments.list(item.id);
        box.innerHTML = list.length ? list.map((a) => `
          <div class="attach-item" data-aid="${a.id}" data-aname="${escapeHtml(a.name)}">
            <span class="attach-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
            <span class="attach-size">${fmtSize(a.size)}</span>
            <button class="btn" data-aact="view" title="查看/下载">查看</button>
            <button class="btn" data-aact="del" title="删除">×</button>
          </div>`).join('') : '<p class="hint">无附件</p>';
      } catch (e) {
        box.innerHTML = `<p class="hint" style="color:var(--danger)">${escapeHtml(e.message)}</p>`;
      }
    };
    $('#btn-attach-add')?.addEventListener('click', () => $('#f-attach-file')?.click());
    $('#f-attach-file')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (f.size > ATTACHMENT_MAX_BYTES) { toast('附件超过 2MB 上限', true); e.target.value = ''; return; }
      try {
        const dataB64 = await fileToBase64(f);
        await store.attachments.add(item.id, { name: f.name, mime: f.type || 'application/octet-stream', dataB64 });
        toast('附件已添加');
        await renderAttachList();
      } catch (err) { toast('添加失败：' + err.message, true); }
      e.target.value = '';
    });
    $('#attach-list')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-aact]');
      if (!btn) return;
      const row = btn.closest('.attach-item');
      const aid = Number(row?.dataset.aid);
      const aname = row?.dataset.aname || 'attachment';
      if (btn.dataset.aact === 'del') {
        if (!confirm(`删除附件 ${aname}？`)) return;
        try { await store.attachments.remove(aid); await renderAttachList(); }
        catch (err) { toast('删除失败：' + err.message, true); }
      } else {
        try { await openAttachmentViewer(aid, aname); }
        catch (err) { toast('读取失败：' + err.message, true); }
      }
    });
    renderAttachList();
  }

  $('#btn-gen-again')?.addEventListener('click', () => {
    try {
      const o = genOptsFromUi();
      const pw = PassGen.generate(o);
      $('#f-password').value = pw;
      state.currentGenPw = pw;
      toast('已生成新密码');
    } catch (e) { toast(e.message, true); }
  });
  $('#btn-del-from-modal')?.addEventListener('click', async () => {
    if (!item) return;
    if (confirm(`确定删除「${item.owner} / ${item.account}」吗？`)) {
      try {
        await store.remove(item.id);
        closeModal();
        toast('已删除');
        refreshChips();
        refreshList();
      } catch (e) { toast(e.message, true); }
    }
  });
  $('#btn-save').addEventListener('click', async () => {
    const entry = {
      owner: $('#f-owner').value.trim(),
      account: $('#f-account').value.trim(),
      password: $('#f-password').value,
      url: $('#f-url').value.trim(),
      category: $('#f-category').value.trim(),
      note: $('#f-note').value.trim(),
    };
    const totpRaw = $('#f-totp').value.trim();
    entry.totp_secret = totpRaw ? PassTotp.extractSecret(totpRaw) : '';
    if (totpRaw && !PassTotp.isValidSecret(entry.totp_secret)) return toast('TOTP 密钥无效：需 base32 字符（A-Z、2-7）或 otpauth:// 链接', true);
    if (!entry.owner || !entry.account) return toast('所属和账户不能为空', true);
    if (!entry.password) return toast('密码不能为空', true);
    try {
      if (isNew) await store.create(entry);
      else await store.update(item.id, entry);
      closeModal();
      toast('已保存');
      refreshChips();
      refreshList();
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------------- 密码历史弹窗（v1.5.0） ---------------- */
function openHistoryModal(item) {
  const hist = parseHistory(item.history).slice().reverse(); // 新 → 旧
  openModal(`
    <div class="modal-head">
      <h3>${ICONS.history} 密码历史 · ${escapeHtml(item.owner)}${item.account ? '/' + escapeHtml(item.account) : ''}</h3>
      <button class="modal-close" aria-label="关闭">${ICONS.x}</button>
    </div>
    <div class="modal-body">
      <div id="hist-list">
        ${hist.length ? hist.map((h) => `
          <div class="hist-row">
            <span class="hist-pw" data-pw="${escapeHtml(h.password)}">••••••••</span>
            <span class="hist-time">${fmtTime(h.changedAt)}</span>
            <div class="hist-actions">
              <button class="hist-btn" data-hact="toggle" title="显示/隐藏">${ICONS.eye}</button>
              <button class="hist-btn" data-hact="copy" title="复制">${ICONS.copy}</button>
            </div>
          </div>`).join('') : '<p class="hint">暂无历史记录</p>'}
      </div>
      <p class="hint">修改密码时自动归档旧密码，最多保留 20 条。</p>
    </div>
    <div class="modal-foot"><button class="btn" id="hist-close">关闭</button></div>
  `, false);
  $('#hist-close').addEventListener('click', closeModal);
  $('#hist-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-hact]');
    if (!btn) return;
    const row = btn.closest('.hist-row');
    const pwEl = row.querySelector('.hist-pw');
    if (btn.dataset.hact === 'toggle') {
      if (pwEl.classList.contains('revealed')) {
        pwEl.classList.remove('revealed');
        pwEl.textContent = '••••••••';
        btn.innerHTML = ICONS.eye;
      } else {
        pwEl.classList.add('revealed');
        pwEl.textContent = pwEl.dataset.pw;
        btn.innerHTML = ICONS.eyeOff;
      }
    } else if (btn.dataset.hact === 'copy') {
      await copyText(pwEl.dataset.pw);
    }
  });
}

/* ---------------- 手动录入（专属宽弹窗） ---------------- */
function openManualAddModal() {
  openModal(`
    <div class="modal-head">
      <h3>手动录入</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body manual-form">
      <label class="field"><span>所属（应用 / 网站）*</span>
        <input id="mf-owner" placeholder="如：GitHub、微信、网银…" autocomplete="off" />
        <datalist id="dl-mf-owner"></datalist>
      </label>
      <label class="field"><span>账户（用户名 / 邮箱 / 手机号）*</span>
        <input id="mf-account" placeholder="如：user@example.com" autocomplete="off" />
        <datalist id="dl-mf-account"></datalist>
      </label>
      <label class="field"><span>密码 *</span>
        <div class="pw-input-row">
          <input id="mf-password" type="text" autocomplete="off" placeholder="手动输入，或点右侧按钮生成" />
          <button class="btn" id="mf-gen" title="用当前生成器设置生成">${ICONS.wand}</button>
        </div>
      </label>
      <label class="field"><span>动态验证码 TOTP（可选）</span>
        <input id="mf-totp" placeholder="base32 密钥或 otpauth:// 链接，粘贴自动提取" autocomplete="off" spellcheck="false" />
      </label>
      <div class="form-row">
        <label class="field"><span>分类（可选）</span>
          <input id="mf-category" placeholder="如：工作 / 个人 / 邮箱" />
          <datalist id="dl-mf-category"></datalist>
        </label>
        <label class="field"><span>网址（可选）</span>
          <input id="mf-url" type="url" placeholder="https://…" />
        </label>
      </div>
      <label class="field"><span>备注 · 记忆关键词（可选）</span>
        <textarea id="mf-note" placeholder="自由输入帮你回忆的关键词，如：老家宽带、妈妈手机号注册、2019年办的卡…"></textarea>
      </label>
      <div class="hint" id="mf-saved-info"></div>
      <div class="form-actions" id="form-actions">
        <button class="btn" id="mf-save-continue">保存并继续录入</button>
        <button class="btn primary" id="mf-save">保存</button>
      </div>
    </div>
  `, true);

  // 自动补全：不在获得焦点/空输入时展开，仅当用户输入非空字符后才填充并绑定 datalist
  //（Android WebView 对带 option 的 datalist 在聚焦时就会弹出，故用"输入才绑定"策略）
  (async () => {
    const all = await store.list({});
    const owners = new Set(), accounts = new Set(), cats = new Set();
    for (const x of all.items) { owners.add(x.owner); accounts.add(x.account); if (x.category) cats.add(x.category); }
    const pools = {
      'mf-owner': [...owners],
      'mf-account': [...accounts],
      'mf-category': [...cats],
    };
    const bind = (inputId, dlId, pool) => {
      const input = $('#' + inputId);
      const dl = $('#' + dlId);
      const refresh = () => {
        const q = input.value.trim();
        if (!q) { dl.innerHTML = ''; input.removeAttribute('list'); return; }
        const low = q.toLowerCase();
        const hit = pool.filter((x) => x && x.toLowerCase().includes(low));
        dl.innerHTML = hit.map((x) => `<option value="${escapeHtml(x)}">`).join('');
        if (hit.length > 0) input.setAttribute('list', dlId); else input.removeAttribute('list');
      };
      input.addEventListener('input', refresh);
      // 不监听 focus：仅在用户实际输入时展开，选中/聚焦不弹列表
      // 选中候选后（值已填满）松开绑定，避免再次点击又弹列表
      input.addEventListener('change', () => { dl.innerHTML = ''; input.removeAttribute('list'); });
    };
    for (const [id, pool] of Object.entries(pools)) {
      if (pool.length) bind(id, 'dl-' + id, pool);
    }
  })();

  let mfSavedCount = 0;
  $('#mf-gen').addEventListener('click', () => {
    try {
      const pw = PassGen.generate(genOptsFromUi());
      $('#mf-password').value = pw;
      toast('已生成，可继续编辑后保存');
    } catch (e) { toast(e.message, true); }
  });
  async function mfSave(keepOpen) {
    const entry = {
      owner: $('#mf-owner').value.trim(),
      account: $('#mf-account').value.trim(),
      password: $('#mf-password').value,
      url: $('#mf-url').value.trim(),
      category: $('#mf-category').value.trim(),
      note: $('#mf-note').value.trim(),
    };
    const totpRaw = $('#mf-totp').value.trim();
    entry.totp_secret = totpRaw ? PassTotp.extractSecret(totpRaw) : '';
    if (totpRaw && !PassTotp.isValidSecret(entry.totp_secret)) return toast('TOTP 密钥无效：需 base32 字符（A-Z、2-7）或 otpauth:// 链接', true);
    if (!entry.owner || !entry.account) return toast('所属和账户不能为空', true);
    if (!entry.password) return toast('密码不能为空', true);
    try {
      await store.create(entry);
      mfSavedCount++;
      $('#mf-saved-info').textContent = `✓ 本次已录入 ${mfSavedCount} 条${keepOpen ? '，可继续输入下一条' : ''}`;
      refreshChips();
      refreshList();
      if (keepOpen) {
        $('#mf-owner').value = ''; $('#mf-account').value = ''; $('#mf-password').value = '';
        $('#mf-url').value = ''; $('#mf-note').value = ''; $('#mf-totp').value = '';
        $('#mf-owner').focus();
      } else {
        closeModal();
        toast('已保存');
      }
    } catch (e) { toast(e.message, true); }
  }
  $('#mf-save-continue').addEventListener('click', () => mfSave(true));
  $('#mf-save').addEventListener('click', () => mfSave(false));
  setTimeout(() => $('#mf-owner').focus(), 50);
}

/* ---------------- 导入 ---------------- */
let importFileCache = null; // {name, text|bytes}

function openImportModal() {
  openModal(`
    <div class="modal-head">
      <h3>导入密码</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="import-tabs">
        <button class="btn active" data-tab="paste">粘贴文本</button>
        <button class="btn" data-tab="file">上传文件</button>
      </div>
      <div id="tab-paste">
        <label class="field"><span>每行一条：所属,账户,密码[,网址][,备注]（也支持 所属/账户/密码 或 所属 账户 密码）</span>
          <textarea id="import-paste" placeholder="微信,13800000000,P@ssw0rd1&#10;GitHub,user@example.com,Abc12345&#10;网银/张三/XyZ!6789"></textarea>
        </label>
      </div>
      <div id="tab-file" class="hidden">
        <label class="file-drop" id="file-drop">
          <div>点击选择或拖入文件</div>
          <div class="hint">支持 .csv / .json / .txt / .db（SQLite 数据库文件）</div>
        </label>
        <input type="file" id="file-input" class="hidden" accept=".csv,.json,.txt,.db" />
        <div id="file-info" class="hint"></div>
      </div>
      <label class="field" id="import-mode-wrap"><span>导入方式</span>
        <select id="import-mode">
          <option value="merge">合并（跳过重复）</option>
          <option value="replace">覆盖（清空现有再导入）</option>
        </select>
      </label>
      <div id="import-preview-wrap" class="hidden">
        <span class="hint">解析预览</span>
        <div class="import-preview" id="import-preview"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="btn-import-cancel">关闭</button>
      <button class="btn primary" id="btn-import-go">开始导入</button>
    </div>
  `, true);

  // tabs
  $$('.import-tabs .btn').forEach((b) => b.addEventListener('click', () => {
    $$('.import-tabs .btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    const tab = b.dataset.tab;
    $('#tab-paste').classList.toggle('hidden', tab !== 'paste');
    $('#tab-file').classList.toggle('hidden', tab !== 'file');
  }));

  // 文件选择 / 拖放
  const input = $('#file-input');
  const drop = $('#file-drop');
  if (IS_TAURI) {
    // 桌面版：用系统对话框选择文件
    const nativeBtn = document.createElement('button');
    nativeBtn.className = 'btn primary';
    nativeBtn.textContent = '选择文件…';
    nativeBtn.style.marginTop = '8px';
    nativeBtn.addEventListener('click', async () => {
      try {
        const picked = await tauriInvoke('pick_import_db');
        if (!picked || !picked.bytes || !picked.bytes.length) return;
        const name = picked.name || '';
        importFileCache = { name };
        const isDb = name.toLowerCase().endsWith('.db');
        if (isDb) {
          importFileCache.bytes = new Uint8Array(picked.bytes);
          await handleImportBytes(importFileCache.bytes, 'db');
        } else {
          importFileCache.text = new TextDecoder().decode(new Uint8Array(picked.bytes));
          $('#file-info').textContent = `${name} · ${importFileCache.text.length} 字符`;
          parseAndPreview(importFileCache.text);
        }
      } catch (e) { toast(e.message, true); }
    });
    drop.parentElement.insertBefore(nativeBtn, drop.nextSibling);
  } else {
    drop.addEventListener('click', () => input.click());
  }
  input.addEventListener('change', () => handleFile(input.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  async function handleFile(file) {
    importFileCache = { name: file.name };
    if (file.name.toLowerCase().endsWith('.db')) {
      const buf = new Uint8Array(await file.arrayBuffer());
      importFileCache.bytes = buf;
      $('#file-info').textContent = `${file.name} · ${buf.length} 字节`;
      await handleImportBytes(buf, 'db');
    } else {
      importFileCache.text = await file.text();
      $('#file-info').textContent = `${file.name} · ${importFileCache.text.length} 字符`;
      parseAndPreview(importFileCache.text);
    }
  }

  async function handleImportBytes(bytes, ext) {
    if (ext === 'db') {
      // 加密备份：先尝试本机密钥解密，失败则提示输入密钥文本
      if (DbCrypto.isEncrypted(bytes)) {
        if (!DbCrypto.hasWebCrypto()) { $('#file-info').textContent = '该文件已加密，当前环境无法解密导入'; return; }
        // 优先用本机密钥尝试（同一设备导出）
        const localKey = LocalStore.getStoredKey();
        if (localKey) {
          try {
            const k = await DbCrypto.deriveKey(localKey, DbCrypto.saltOf(bytes));
            bytes = await DbCrypto.decryptBytes(bytes, k);
          } catch { /* 密钥不匹配，继续提示用户输入 */ }
        }
        if (DbCrypto.isEncrypted(bytes)) {
          try {
            const keyText = await promptKeyInput();
            if (!keyText) return;
            const k = await DbCrypto.deriveKey(keyText, DbCrypto.saltOf(bytes));
            bytes = await DbCrypto.decryptBytes(bytes, k);
          } catch (e) { $('#file-info').textContent = e.message; return; }
        }
      }
      $('#file-info').textContent = `已选择数据库文件 · ${bytes.length} 字节`;
      try {
        const SQL = await getSqlModule();
        const tdb = new SQL.Database(bytes);
        const rows = [];
        const stmt = tdb.prepare('SELECT owner, account, password, url, category, note FROM entries');
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        tdb.close();
        importFileCache.parsed = rows;
        showImportPreview(rows);
      } catch (e) {
        $('#file-info').textContent = '无法解析该 .db 文件: ' + e.message;
      }
    } else {
      const text = new TextDecoder().decode(bytes);
      importFileCache.text = text;
      parseAndPreview(text);
    }
  }

  function showImportPreview(rows) {
    const wrap = $('#import-preview-wrap');
    wrap.classList.remove('hidden');
    $('#import-preview').textContent = rows.length
      ? `解析出 ${rows.length} 条：\n` + rows.slice(0, 12).map((r) => `${r.owner} | ${r.account} | ${'*'.repeat((r.password || '').length)}`).join('\n') + (rows.length > 12 ? `\n… 共 ${rows.length} 条` : '')
      : '未解析出任何记录';
  }

  function parseAndPreview(text) {
    const rows = parseImportText(text);
    importFileCache.parsed = rows;
    showImportPreview(rows);
  }

  $('#import-paste').addEventListener('input', debounce(() => parseAndPreview($('#import-paste').value), 300));
  $('#btn-import-cancel').addEventListener('click', closeModal);
  $('#btn-import-go').addEventListener('click', async () => {
    let rows = null;
    if (!$('#tab-file').classList.contains('hidden')) {
      rows = importFileCache?.parsed || null;
      if (!rows && importFileCache?.text) rows = parseImportText(importFileCache.text);
    } else {
      rows = parseImportText($('#import-paste').value);
    }
    if (!rows || !rows.length) return toast('没有可导入的数据', true);
    const mode = $('#import-mode').value;
    if (mode === 'replace' && !confirm('覆盖模式会清空现有全部密码记录，确定继续？')) return;
    try {
      const r = await store.importItems(rows, mode);
      closeModal();
      toast(`导入完成：新增 ${r.imported} 条${r.skipped ? `，跳过重复 ${r.skipped} 条` : ''}`);
      refreshChips();
      refreshList();
    } catch (e) { toast(e.message, true); }
  });
}

function parseImportText(text) {
  const rows = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    // 跳过可能的表头
    if (/^(所属|账户|账号|用户名|owner|account)[,，/\t ]/.test(line)) continue;
    let parts = line.split(',').map((s) => s.trim());
    if (parts.length < 3) parts = line.split('，').map((s) => s.trim());
    if (parts.length < 3) parts = line.split('/').map((s) => s.trim());
    if (parts.length < 3) parts = line.split(/\t+/).map((s) => s.trim());
    if (parts.length < 3) parts = line.split(/\s+/).map((s) => s.trim());
    if (parts.length < 3) continue;
    const [owner, account, password, url = '', note = ''] = parts;
    rows.push({ owner, account, password, url, category: '', note });
  }
  return rows;
}

$('#btn-import').addEventListener('click', openImportModal);

/* ---------------- 导出 ---------------- */
function openExportModal() {
  openModal(`
    <div class="modal-head">
      <h3>导出 / 备份</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="export-grid">
        <div class="export-item">
          <div><div class="t">下载 .db 数据库文件${currentMode === 'local' && LocalStore._encrypted ? '<span style="color:var(--ok)">（已加密）</span>' : ''}</div><div class="d">用于多端同步：放到网盘/Syncthing 文件夹，另一端用「导入 → .db 文件」合并${currentMode === 'local' && LocalStore._encrypted ? '；该副本为密文，导入/恢复时需密钥文本（设置 → 数据库加密 → 备份密钥）' : ''}</div></div>
          <button class="btn primary" id="btn-export-db">下载</button>
        </div>
        <div class="export-item">
          <div><div class="t">下载 JSON 备份</div><div class="d">完整备份，便于迁移与查看</div></div>
          <button class="btn" id="btn-export-json">下载</button>
        </div>
      </div>
      <p class="hint">当前存储：${IS_TAURI ? (IS_ANDROID ? '手机版 · 应用内存储' : '桌面版数据库文件') : (currentMode === 'server' ? '服务端 SQLite 文件' : '浏览器本地 (IndexedDB)')}${IS_TAURI ? (IS_ANDROID ? '' : ' — 数据库位置可在「设置」中更改') : (currentMode === 'server' ? '' : ' — 建议定期导出 .db 备份')}</p>
    </div>
    <div class="modal-foot"><button class="btn" id="btn-export-close">关闭</button></div>
  `);
  $('#btn-export-close').addEventListener('click', closeModal);
  $('#btn-export-db').addEventListener('click', async () => {
    try {
      const blob = await store.exportDb();
      if (blob && blob.tauriPath) {
        toast('数据库文件已导出：' + blob.tauriPath);
      } else if (blob) {
        downloadBlob(blob, 'passwords.db');
        toast('数据库文件已下载');
      }
    } catch (e) { toast(e.message, true); }
  });
  $('#btn-export-json').addEventListener('click', async () => {
    try {
      const saved = await store.exportJsonToFile && await store.exportJsonToFile();
      if (saved && saved.tauriPath) {
        toast('JSON 备份已导出：' + saved.tauriPath);
        return;
      }
      const data = await store.exportJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `passbook-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast('JSON 备份已下载');
    } catch (e) { toast(e.message, true); }
  });
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

$('#btn-export').addEventListener('click', openExportModal);

/* ---------------- 安全体检（Watchtower） ---------------- */
const WT_LAST_KEY = 'passbook-wt-last';
const WT_LEVEL_META = {
  high: { text: '高危', cls: 'high' },
  medium: { text: '中危', cls: 'medium' },
  low: { text: '低危', cls: 'low' },
  info: { text: '提示', cls: 'info' },
};
const WT_TYPE_ICON = {
  reused: '🔁', weak: '🔓', incomplete: '📋', stale: '⏳', pwned: '💥',
};

function loadWtSettings() {
  const s = loadSettings();
  return { hibp: s.wt?.hibp !== false, staleMonths: s.wt?.staleMonths ?? 12 };
}

async function openEditById(id) {
  const { items } = await store.list({});
  const item = items.find((x) => x.id === id);
  if (item) openEditModal(item);
  else toast('条目不存在（可能已被删除）', true);
}

async function runWatchtower() {
  const panel = $('#watchtower-panel');
  panel.classList.remove('hidden');
  const summaryEl = $('#wt-summary'), findingsEl = $('#wt-findings');
  summaryEl.innerHTML = '<span class="wt-running">正在体检…</span>';
  findingsEl.innerHTML = '';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const { items } = await store.list({});
    const cfg = loadWtSettings();
    const { findings, summary } = PassWatch.analyze(items, { staleMonths: cfg.staleMonths });

    // 可选联网泄露检查（HIBP k-匿名：仅上传 SHA-1 前 5 位）
    if (cfg.hibp && items.some((e) => e.password)) {
      try {
        const pwned = await PassWatch.checkPwned(
          items.map((e) => e.password),
          async (url) => (await agentFetch(url)).text()
        );
        for (const e of items) {
          const n = pwned.get(e.password);
          if (n) findings.push({ type: 'pwned', level: 'high', entryIds: [e.id], title: '密码已泄露', detail: `「${e.owner}${e.account ? '/' + e.account : ''}」的密码在公开泄露库中出现 ${n} 次` });
        }
        findings.sort((a, b) => ({ high: 0, medium: 1, low: 2, info: 3 })[a.level] - ({ high: 0, medium: 1, low: 2, info: 3 })[b.level]);
        for (const f of findings.filter((x) => x.type === 'pwned')) summary.high++;
      } catch (err) {
        toast('联网泄露检查失败（已跳过）：' + err.message, true);
      }
    }

    localStorage.setItem(WT_LAST_KEY, JSON.stringify({ at: Date.now(), summary }));
    renderWatchtower(findings, summary);
  } catch (e) {
    summaryEl.innerHTML = '';
    findingsEl.innerHTML = `<div class="wt-empty">体检失败：${escapeHtml(e.message)}</div>`;
  }
}

function renderWatchtower(findings, summary) {
  const total = findings.length;
  $('#wt-last').textContent = `上次体检：${fmtTime(new Date().toISOString())}`;
  $('#wt-summary').innerHTML = total === 0
    ? '<span class="wt-allclear">✅ 未发现问题，继续保持</span>'
    : Object.entries(WT_LEVEL_META).map(([k, m]) =>
        summary[k] ? `<span class="wt-chip ${m.cls}">${m.text} ${summary[k]}</span>` : ''
      ).join('');

  $('#wt-findings').innerHTML = total === 0 ? '' : findings.map((f, i) => {
    const m = WT_LEVEL_META[f.level];
    const entriesBtns = f.entryIds.map((id) => `<button class="wt-entry-btn" data-wt-entry="${id}">查看</button>`).join(' ');
    return `
      <div class="wt-finding ${m.cls}">
        <span class="wt-dot"></span>
        <div class="wt-body">
          <div class="wt-title">${WT_TYPE_ICON[f.type] || ''} ${escapeHtml(f.title)} <span class="wt-level">${m.text}</span></div>
          <div class="wt-detail">${escapeHtml(f.detail)}</div>
        </div>
        <div class="wt-actions">${entriesBtns}</div>
      </div>`;
  }).join('');
}

$('#btn-watchtower').addEventListener('click', runWatchtower);
$('#btn-wt-refresh').addEventListener('click', runWatchtower);
$('#btn-wt-close').addEventListener('click', () => $('#watchtower-panel').classList.add('hidden'));
$('#wt-findings').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-wt-entry]');
  if (btn) openEditById(Number(btn.dataset.wtEntry));
});
// 启动时若面板曾展示过，恢复上次体检时间
(function restoreWtLast() {
  try {
    const last = JSON.parse(localStorage.getItem(WT_LAST_KEY) || 'null');
    if (last?.at) $('#wt-last').textContent = `上次体检：${fmtTime(new Date(last.at).toISOString())}`;
  } catch { /* 忽略 */ }
})();

/* ---------------- 设置 ---------------- */
function openSettingsModal() {
  const s = loadSettings();
  const modeField = IS_TAURI ? `
      <label class="field"><span>存储模式</span>
        <select id="set-mode" disabled>
          <option value="local" selected>${IS_ANDROID ? '手机版 · 应用内存储' : '桌面版 · 本地数据库文件'}</option>
        </select>
      </label>` : `
      <label class="field"><span>存储模式（各端独立保存，通过 .db 文件同步）</span>
        <select id="set-mode">
          <option value="auto" ${s.storageMode === 'auto' ? 'selected' : ''}>自动检测</option>
          <option value="server" ${s.storageMode === 'server' ? 'selected' : ''}>服务器存储（桌面 SQLite）</option>
          <option value="local" ${s.storageMode === 'local' ? 'selected' : ''}>本机存储（浏览器/手机）</option>
        </select>
      </label>`;
  const dbPathField = IS_TAURI ? `
      <label class="field"><span>数据库文件位置（可指向网盘/Syncthing 文件夹实现多端同步）</span>
        <div class="pw-input-row">
          <input id="set-dbpath" type="text" readonly value="…" />
          <button class="btn" id="btn-pick-dbpath" title="选择数据库文件位置">选择…</button>
        </div>
        <p class="hint">提示：把数据库文件放到网盘同步文件夹，再在另一台设备「导入 → .db 文件」即可合并。</p>
      </label>` : '';
  const agent = loadAgentConfig();
  const agentField = `
      <div class="field"><span>AI 助理 · 接口地址（OpenAI 兼容）</span>
        <input id="set-agent-url" type="url" placeholder="如：https://api.deepseek.com/v1" value="${escapeHtml(agent.baseUrl)}" />
      </div>
      <div class="field"><span>AI 模型名</span>
        <input id="set-agent-model" type="text" placeholder="如：deepseek-chat" value="${escapeHtml(agent.model)}" />
      </div>
      <div class="field"><span>API Key（本地保存）</span>
        <input id="set-agent-key" type="password" placeholder="sk-…" value="${escapeHtml(agent.apiKey)}" autocomplete="off" />
      </div>
      <p class="hint">任何 OpenAI 兼容渠道均可（DeepSeek / OpenAI / 通义 / 本地 Ollama…）。配置后即可在右上角 AI 助理面板聊天存/查密码。</p>`;
  const encField = currentMode === 'local' ? `
      <div class="field"><span>数据库加密（防止 .db 文件被拷走后明文泄露）</span>
        <div class="lock-toggle">
          <span class="lock-state" id="enc-state">检测中…</span>
        </div>
        <div id="enc-actions" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"></div>
        <p class="hint">密钥由应用自动生成并仅保存在本机，启动时自动解密、使用无感。<b style="color:var(--danger)">请务必点击「备份密钥」保存密钥文本</b>，丢失或更换设备导入加密 .db 时都需要它。</p>
      </div>` : `
      <div class="field"><span>数据库加密</span>
        <p class="hint">服务器存储模式的数据库由服务端管理，暂不支持应用内加密；重要数据请用「导出」定期备份。</p>
      </div>`;
  const bk = { ...DEFAULT_SETTINGS.backup, ...(s.backup || {}) };
  const backupField = currentMode === 'local' ? `
      <div class="field"><span>自动备份快照（${IS_TAURI ? '存于应用数据目录 backups\\' : '存于本机浏览器存储'}，加密库快照保持密文）</span>
        <div class="chk-group" style="padding-top:2px">
          <label><input type="checkbox" id="set-backup-enabled" ${bk.enabled ? 'checked' : ''} /> 自动备份（每 ${bk.intervalMin} 分钟内至多一次）</label>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
          <label style="display:flex;gap:6px;align-items:center;font-size:13px">保留份数
            <select id="set-backup-keep" style="width:auto;padding:6px 8px">
              ${[3, 5, 10, 20].map((n) => `<option value="${n}" ${bk.keep === n ? 'selected' : ''}>${n} 份</option>`).join('')}
            </select>
          </label>
          <button class="btn" id="btn-backup-now" type="button">立即备份</button>
        </div>
        <div id="backup-list" class="backup-list" style="margin-top:10px"></div>
        <p class="hint">快照与主库同格式（含加密态）。恢复 = 用快照覆盖当前主库后重启应用，请谨慎操作。</p>
      </div>` : '';

  openModal(`
    <div class="modal-head">
      <h3>设置</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      ${modeField}
      ${dbPathField}
      ${encField}
      ${backupField}
      ${agentField}
      <div class="field"><span>安全体检</span>
        <div class="chk-group" style="padding-top:2px">
          <label><input type="checkbox" id="set-wt-hibp" ${loadWtSettings().hibp ? 'checked' : ''} /> 联网检查泄露密码（仅上传 SHA-1 前 5 位，密码不出本机）</label>
        </div>
      </div>
      <label class="field"><span>陈旧密码提醒阈值</span>
        <select id="set-wt-stale">
          <option value="6" ${loadWtSettings().staleMonths === 6 ? 'selected' : ''}>6 个月未修改即提醒</option>
          <option value="12" ${loadWtSettings().staleMonths === 12 ? 'selected' : ''}>12 个月未修改即提醒</option>
          <option value="24" ${loadWtSettings().staleMonths === 24 ? 'selected' : ''}>24 个月未修改即提醒</option>
          <option value="0" ${loadWtSettings().staleMonths === 0 ? 'selected' : ''}>不检查</option>
        </select>
      </label>
      <div class="field"><span>启动锁（可选，仅本地拦截，不加密数据）</span>
        <div class="lock-toggle">
          <button class="btn ${s.pinHash ? '' : 'primary'}" id="btn-lock-toggle" type="button">${s.pinHash ? '停用' : '启用'}</button>
          <span class="lock-state" id="lock-state">${s.pinHash ? '已启用' : '未启用'}</span>
        </div>
        <input id="set-pin" type="password" placeholder="${s.pinHash ? '留空保持不变，输入新 PIN 可更换' : '设置 4-12 位 PIN'}" autocomplete="new-password" ${s.pinHash ? '' : 'disabled'} />
      </div>
      <div class="field" id="bio-field"><span>生物识别解锁（指纹 / 面容，需已启用启动锁且设备支持）</span>
        <div class="lock-toggle">
          <button class="btn ${(s.bioUnlock !== false && s.pinHash) ? '' : 'primary'}" id="btn-bio-toggle" type="button">${(s.bioUnlock !== false && s.pinHash) ? '停用' : '启用'}</button>
          <span class="lock-state" id="bio-state">${(s.bioUnlock !== false && s.pinHash) ? '已启用' : '未启用'}</span>
        </div>
      </div>
      <label class="field"><span>自动锁定（需已启用启动锁）</span>
        <select id="set-autolock">
          <option value="never" ${(s.lock?.autoLock || 'never') === 'never' ? 'selected' : ''}>永不</option>
          <option value="60" ${s.lock?.autoLock === '60' ? 'selected' : ''}>无操作 1 分钟后</option>
          <option value="300" ${s.lock?.autoLock === '300' ? 'selected' : ''}>无操作 5 分钟后</option>
          <option value="hidden" ${s.lock?.autoLock === 'hidden' ? 'selected' : ''}>切到后台立即锁定</option>
        </select>
      </label>
      <label class="field"><span>复制后自动清空剪贴板</span>
        <select id="set-clipclear">
          <option value="0" ${(s.lock?.clipboard || 0) === 0 ? 'selected' : ''}>关闭</option>
          <option value="15" ${s.lock?.clipboard === 15 ? 'selected' : ''}>15 秒后（推荐）</option>
          <option value="30" ${s.lock?.clipboard === 30 ? 'selected' : ''}>30 秒后</option>
        </select>
      </label>
      <label class="field"><span>外观</span>
        <select id="set-theme">
          <option value="auto" ${(s.theme || 'auto') === 'auto' ? 'selected' : ''}>跟随系统</option>
          <option value="light" ${s.theme === 'light' ? 'selected' : ''}>浅色</option>
          <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>深色</option>
        </select>
      </label>
      <p class="hint">PIN 仅阻止他人直接打开界面。AI 查询结果已打码（真实密码只在应用卡片内展示/复制）；存、改密码时内容仍会发送给你配置的模型渠道，请只填自己信任的接口。</p>
    </div>
    <div class="modal-foot">
      <button class="btn" id="btn-settings-cancel">取消</button>
      <button class="btn primary" id="btn-settings-save">保存</button>
    </div>
  `);

  if (IS_TAURI) {
    getTauriDbPath().then((p) => { $('#set-dbpath').value = p; }).catch(() => {});
    $('#btn-pick-dbpath').addEventListener('click', async () => {
      try {
        const picked = await tauriInvoke('pick_db_path');
        if (!picked) return;
        localStorage.setItem('passbook-db-path', picked);
        // 切换路径后需要把当前内存数据写过去，最简单是重载
        toast('已选择新位置，正在迁移…');
        closeModal();
        location.reload();
      } catch (e) { toast(e.message, true); }
    });
  }

  // 数据库加密区块：状态检测 + 启用/关闭/备份密钥
  async function refreshEncSection() {
    const stateEl = $('#enc-state'), actions = $('#enc-actions');
    if (!stateEl || !actions) return;
    let enc = false;
    try { enc = await LocalStore.isEncryptedFile(); } catch { /* 读取失败按未加密展示 */ }
    stateEl.textContent = enc ? '已启用（文件已加密）' : '未启用（文件为明文）';
    actions.innerHTML = '';
    const mkBtn = (text, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      b.textContent = text;
      b.addEventListener('click', fn);
      return b;
    };
    if (!enc) {
      actions.appendChild(mkBtn('启用加密', 'primary', async () => {
        try {
          if (!DbCrypto.hasWebCrypto()) return toast('当前环境不支持加密（需应用内或 HTTPS 打开）', true);
          if (!confirm('启用后数据库文件将以 AES-256 加密保存，密钥由应用自动生成并仅保存在本机。确定启用？')) return;
          const key = await LocalStore.enableEncryption();
          toast('已启用加密，数据库文件已加密');
          showKeyBackup(key);
          refreshEncSection();
        } catch (e) { toast(e.message, true); }
      }));
    } else {
      actions.appendChild(mkBtn('备份密钥', '', async () => {
        const stored = LocalStore.getStoredKey();
        if (!stored) return toast('本机未保存密钥，请先在导出页确认密钥', true);
        showKeyBackup(stored);
      }));
      actions.appendChild(mkBtn('关闭加密', 'danger', async () => {
        try {
          if (!confirm('关闭后数据库文件将以明文保存，确定继续？')) return;
          await LocalStore.disableEncryption();
          toast('已关闭加密');
          refreshEncSection();
        } catch (e) { toast(e.message, true); }
      }));
    }
  }
  if (currentMode === 'local') refreshEncSection();

  $('#btn-settings-cancel').addEventListener('click', closeModal);
  // 启动锁开关：点击启用/停用，只影响本弹窗状态，保存时才落库
  let lockEnabled = !!s.pinHash;
  $('#btn-lock-toggle').addEventListener('click', () => {
    lockEnabled = !lockEnabled;
    const btn = $('#btn-lock-toggle');
    btn.textContent = lockEnabled ? '停用' : '启用';
    btn.classList.toggle('primary', !lockEnabled);
    $('#lock-state').textContent = lockEnabled ? '已启用' : '未启用';
    $('#set-pin').disabled = !lockEnabled;
    if (!lockEnabled) $('#set-pin').value = '';
    else $('#set-pin').focus();
  });
  // 生物识别开关（v2.6.0）：仅支持时可用；与启动锁联动
  let bioEnabled = s.bioUnlock !== false && !!s.pinHash;
  const syncBioUi = () => {
    const supported = Bio.supported();
    const base = $('#bio-field');
    if (!supported) { base.style.opacity = '0.5'; base.title = '当前设备/平台不支持'; }
    const btn = $('#btn-bio-toggle');
    btn.textContent = bioEnabled ? '停用' : '启用';
    btn.classList.toggle('primary', !bioEnabled);
    $('#bio-state').textContent = bioEnabled ? '已启用' : '未启用';
  };
  $('#btn-bio-toggle').addEventListener('click', async () => {
    if (!(await Bio.available())) return toast('此设备未启用系统锁屏（指纹/面容/PIN），无法使用生物识别', true);
    bioEnabled = !bioEnabled;
    syncBioUi();
  });
  syncBioUi();
  $('#btn-settings-save').addEventListener('click', async () => {
    const ns = { ...loadSettings() };
    if (!IS_TAURI) ns.storageMode = $('#set-mode').value;
    const pin = $('#set-pin').value;
    if (lockEnabled) {
      // 启用状态下：有输入则设置/更换 PIN；留空则保持现状不变
      if (pin) {
        if (pin.length < 4 || pin.length > 12) return toast('PIN 需为 4-12 位', true);
        ns.pinHash = await sha256(pin);
      }
    } else {
      // 停用状态下：确认后移除 PIN
      if (ns.pinHash && !confirm('确定停用启动锁吗？停用后下次启动不再需要 PIN。')) return;
      ns.pinHash = '';
    }
    ns.bioUnlock = !!bioEnabled && !!ns.pinHash; // 生物识别依赖启动锁（v2.6.0）
    saveSettings(ns);
    saveAgentConfig({
      baseUrl: $('#set-agent-url').value.trim(),
      apiKey: $('#set-agent-key').value.trim(),
      model: $('#set-agent-model').value.trim(),
    });
    const wtEl = $('#set-wt-hibp');
    if (wtEl) {
      ns.wt = { hibp: wtEl.checked, staleMonths: Number($('#set-wt-stale').value) || 0 };
      saveSettings(ns);
    }
    const alEl = $('#set-autolock');
    if (alEl) {
      ns.lock = { autoLock: $('#set-autolock').value, clipboard: Number($('#set-clipclear').value) || 0 };
      saveSettings(ns);
    }
    const themeEl = $('#set-theme');
    if (themeEl) {
      ns.theme = PassTheme.normalizeTheme(themeEl.value);
      saveSettings(ns);
      applyThemeNow();
    }
    const bkKeep = $('#set-backup-keep');
    if (bkKeep) {
      ns.backup = {
        ...(ns.backup || DEFAULT_SETTINGS.backup),
        enabled: !!$('#set-backup-enabled').checked,
        keep: Number(bkKeep.value) || 5,
      };
      saveSettings(ns);
    }
    closeModal();
    toast('设置已保存');
    if (!IS_TAURI) location.reload();
  });

  // 备份区交互：列表渲染 / 立即备份 / 恢复 / 删除
  async function renderBackupList() {
    const box = $('#backup-list');
    if (!box) return;
    box.innerHTML = '<p class="hint">快照读取中…</p>';
    try {
      const list = await BackupAdapter.list();
      if (!list.length) { box.innerHTML = '<p class="hint">暂无快照。点击「立即备份」创建第一个。</p>'; return; }
      box.innerHTML = list.map((f) => `
        <div class="backup-item" data-name="${escapeHtml(f.name)}">
          <span class="backup-time">${PassBackup.formatBackupLabel(f.name)}</span>
          <span class="backup-size">${PassBackup.formatSize(f.size)}</span>
          <span class="backup-ops">
            <button class="btn" data-bact="restore">恢复</button>
            <button class="btn" data-bact="del">删除</button>
          </span>
        </div>`).join('');
    } catch (e) {
      box.innerHTML = `<p class="hint" style="color:var(--danger)">快照读取失败：${escapeHtml(e.message)}</p>`;
    }
  }
  const bkNowBtn = $('#btn-backup-now');
  if (bkNowBtn) {
    bkNowBtn.addEventListener('click', async () => {
      bkNowBtn.disabled = true;
      try { await runBackup(true); await renderBackupList(); }
      catch (e) { toast('备份失败：' + e.message, true); }
      finally { bkNowBtn.disabled = false; }
    });
    renderBackupList();
    $('#backup-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-bact]');
      if (!btn) return;
      const item = btn.closest('.backup-item');
      const name = item?.dataset.name;
      if (!name) return;
      if (btn.dataset.bact === 'del') {
        if (!confirm(`删除快照 ${PassBackup.formatBackupLabel(name)}？`)) return;
        try { await BackupAdapter.remove(name); await renderBackupList(); }
        catch (err) { toast('删除失败：' + err.message, true); }
      } else if (btn.dataset.bact === 'restore') {
        if (!confirm(`用快照 ${PassBackup.formatBackupLabel(name)} 覆盖当前数据库并重启应用？\n当前未保存的修改将丢失。`)) return;
        try {
          const bytes = await BackupAdapter.read(name);
          if (!bytes || !bytes.byteLength) throw new Error('快照为空');
          // 写回主库位置，走启动加载链（自动处理加密/迁移）
          if (IS_TAURI) {
            const path = await getTauriDbPath();
            await tauriInvoke('write_db_file', { path, bytes: Array.from(bytes) });
          } else {
            await idbSet('db', bytes);
          }
          toast('已恢复，正在重载…');
          setTimeout(() => location.reload(), 600);
        } catch (err) { toast('恢复失败：' + err.message, true); }
      }
    });
  }
}
$('#btn-settings').addEventListener('click', openSettingsModal);

/* ---------------- 启动锁 ---------------- */
let unlocked = false;

async function showLockIfNeeded() {
  const s = loadSettings();
  if (!s.pinHash || unlocked) return;
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.style.zIndex = '300';
  mask.innerHTML = `
    <div class="modal" style="max-width:340px;text-align:center">
      <div class="modal-head"><h3>${ICONS.lock} 密码本已锁定</h3><span></span></div>
      <div class="modal-body">
        <input id="lock-pin" type="password" placeholder="输入 PIN" style="border:1px solid var(--line);border-radius:10px;padding:13px;font-size:17px;letter-spacing:4px;width:100%;text-align:center;outline:none" autocomplete="current-password" />
        <p class="hint" id="lock-err" style="color:var(--danger)"></p>
      </div>
      <div class="modal-foot" style="justify-content:center">
        ${s.bioUnlock !== false && (await Bio.available()) ? `<button class="btn" id="lock-bio" style="width:100%;margin-bottom:8px">${ICONS.lock} 指纹 / 面容解锁</button>` : ''}
        <button class="btn primary" id="lock-go" style="width:100%">解锁</button>
      </div>
    </div>`;
  document.body.appendChild(mask);
  const tryUnlock = async () => {
    const hash = await sha256($('#lock-pin').value);
    if (hash === s.pinHash) {
      unlocked = true;
      mask.remove();
    } else {
      $('#lock-err').textContent = 'PIN 错误';
    }
  };
  $('#lock-bio')?.addEventListener('click', async () => {
    const ok = await Bio.prompt('解锁密码本');
    if (ok) { unlocked = true; mask.remove(); }
    else $('#lock-err').textContent = '生物识别未通过，请输入 PIN';
  });
  $('#lock-go').addEventListener('click', tryUnlock);
  $('#lock-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  $('#lock-pin').focus();
}

/* ---------------- 搜索 / 排序 ---------------- */
$('#search').addEventListener('input', debounce((e) => {
  state.q = e.target.value.trim();
  refreshList();
}, 200));
$('#sort').addEventListener('change', (e) => {
  state.sort = e.target.value;
  refreshList();
});

/* ---------------- 自动备份快照（v2.2.0） ---------------- */
const BackupAdapter = {
  /** 快照目录（Tauri 文件模式）；浏览器模式返回 null */
  async dir() {
    if (!IS_TAURI) return null;
    return await tauriInvoke('get_backups_dir');
  },
  /** 列出全部快照 [{name, size, mtime}] 按时间降序 */
  async list() {
    if (IS_TAURI) {
      const dir = await this.dir();
      const files = await tauriInvoke('list_dir_files', { dir, ext: 'db' });
      return (files || [])
        .filter((f) => PassBackup.parseBackupName(f.name))
        .map((f) => ({ name: f.name, size: f.size, at: new Date(PassBackup.parseBackupName(f.name)).getTime() }))
        .sort((a, b) => b.at - a.at);
    }
    const keys = await idbKeys();
    const names = keys.map(PassBackup.nameFromIdbKey).filter(Boolean).filter((n) => PassBackup.parseBackupName(n));
    const out = [];
    for (const n of PassBackup.sortDesc(names)) {
      const v = await idbGet(PassBackup.idbKey(n));
      out.push({ name: n, size: v && v.byteLength ? v.byteLength : (v ? v.length : 0), at: PassBackup.parseBackupName(n).getTime() });
    }
    return out;
  },
  /** 写入快照（bytes 为当前库原始持久化字节） */
  async write(name, bytes) {
    if (IS_TAURI) {
      const dir = await this.dir();
      await tauriInvoke('write_db_file', { path: dir + '\\' + name, bytes: Array.from(bytes) });
      return;
    }
    await idbSet(PassBackup.idbKey(name), bytes);
  },
  /** 读取快照字节 */
  async read(name) {
    if (IS_TAURI) {
      const dir = await this.dir();
      const b = await tauriInvoke('read_db_file', { path: dir + '\\' + name });
      return b && b.length ? new Uint8Array(b) : null;
    }
    return await idbGet(PassBackup.idbKey(name));
  },
  async remove(name) {
    if (IS_TAURI) {
      const dir = await this.dir();
      await tauriInvoke('delete_file', { path: dir + '\\' + name });
      return;
    }
    await idbDel(PassBackup.idbKey(name));
  },
  /** 最近一次快照时间（ms）或 null */
  async lastBackupAt() {
    const list = await this.list();
    return list.length ? list[0].at : null;
  },
};

/** 执行一次备份（快照 + 滚动清理）。manual=true 跳过节流。仅本地存储模式。 */
async function runBackup(manual = false) {
  if (currentMode !== 'local') {
    if (manual) toast('服务器存储模式由服务端管理数据，请用「导出」备份', true);
    return null;
  }
  const s = loadSettings();
  const bk = s.backup || DEFAULT_SETTINGS.backup;
  if (!manual) {
    const last = await BackupAdapter.lastBackupAt();
    if (!PassBackup.shouldAutoBackup({ enabled: bk.enabled, lastBackupAt: last, intervalMin: bk.intervalMin })) return null;
  }
  const bytes = await LocalStore._readRaw();
  if (!bytes || !bytes.byteLength) { if (manual) toast('当前无数据可备份', true); return null; }
  const name = PassBackup.backupFileName(new Date());
  await BackupAdapter.write(name, bytes);
  // 滚动清理
  const list = await BackupAdapter.list();
  for (const f of PassBackup.toDelete(list.map((x) => x.name), bk.keep)) {
    try { await BackupAdapter.remove(f); } catch { /* 忽略单个清理失败 */ }
  }
  if (manual) toast(`已备份：${PassBackup.formatBackupLabel(name)}（${PassBackup.formatSize(bytes.byteLength)}）`);
  return name;
}

/** 应用空闲备件：启动 30 秒后首次检查，之后每 15 分钟检查（内部节流 intervalMin） */
function scheduleAutoBackup() {
  const tick = async () => {
    try { await runBackup(false); } catch (e) { console.warn('[backup]', e?.message || e); }
  };
  setTimeout(tick, 30 * 1000);
  setInterval(tick, 15 * 60 * 1000);
}

/* ---------------- Markdown 轻量渲染 ---------------- */
/** 先把 HTML 转义，再安全地将 Markdown 语法转为 HTML 标签（零依赖） */
function mdToHtml(text) {
  let s = escapeHtml(text);
  const blocks = [];
  // 代码块：提取 → 占位符（避免后续 \n→<br> 破坏代码块内换行）
  s = s.replace(/```([\s\S]*?)```/g, (m, code) => {
    blocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  // 行内代码
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 加粗
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体（避免匹配到加粗内部的 **）
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // 链接
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // 换行
  s = s.replace(/\n/g, '<br>');
  // 恢复代码块
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[Number(i)]);
  return s;
}

/* ---------------- AI 助理（Agent） ----------------
 * 渠道可插拔：OpenAI 兼容 /chat/completions + 工具调用。
 * 网络路由：桌面版走 Rust 代理命令（无 CORS），服务器模式走 /api/agent/proxy，其余直连。
 */
const AGENT_SETTINGS_KEY = 'passbook-agent';

/** 预置渠道默认值：来自 agent-config.js（纯净版构建时为空，需用户手动配置）。
 *  用户在设置里保存过的值优先生效，可随时修改。 */
const AGENT_DEFAULTS = globalThis.AGENT_DEFAULTS || { baseUrl: '', apiKey: '', model: '' };

function loadAgentConfig() {
  try {
    return { ...AGENT_DEFAULTS, ...JSON.parse(localStorage.getItem(AGENT_SETTINGS_KEY) || '{}') };
  } catch { return { ...AGENT_DEFAULTS }; }
}
function saveAgentConfig(c) { localStorage.setItem(AGENT_SETTINGS_KEY, JSON.stringify(c)); }

/** 统一网络出口：返回 { ok, status, text(), json() } */
async function agentFetch(url, opts = {}) {
  const method = opts.method || 'GET';
  const headers = opts.headers || {};
  const body = opts.body ?? null;
  if (IS_TAURI) {
    const r = await tauriInvoke('agent_http', { url, method, headers, body });
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => r.body,
      json: async () => JSON.parse(r.body),
    };
  }
  if (currentMode === 'server') {
    const r = await fetch('/api/agent/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method, headers, body }),
    });
    const data = await r.json();
    return {
      ok: data.status >= 200 && data.status < 300,
      status: data.status,
      text: async () => data.body,
      json: async () => JSON.parse(data.body),
    };
  }
  return fetch(url, opts);
}

/** 流式网络出口：返回 { ok, status, text() }，并按块回调原始 SSE 文本 */
async function agentFetchStream(url, opts = {}, onChunk) {
  const method = opts.method || 'POST';
  const headers = opts.headers || {};
  const body = opts.body ?? null;
  const signal = opts.signal || null;
  if (signal?.aborted) throw new Error('已停止');
  if (IS_TAURI) {
    const evt = window.__TAURI__ && window.__TAURI__.event;
    if (!evt || !evt.listen) {
      // 兜底：无事件 API 时退回普通请求
      return agentFetch(url, opts);
    }
    // 桌面/安卓：走 Rust 事件流（agent_http_stream → agent-stream-* 事件）
    const { listen } = evt;
    let status = 0;
    let full = '';
    let err = null;
    let resolve, reject;
    const done = new Promise((res, rej) => { resolve = res; reject = rej; });
    const unlisteners = [];
    // 停止生成：通知 Rust 中止读取并结束等待（保留已收到的部分）
    const onAbort = () => {
      err = new Error('已停止');
      try { tauriInvoke('agent_abort'); } catch {}
      resolve();
    };
    if (signal) signal.addEventListener('abort', onAbort);
    unlisteners.push(await listen('agent-stream-status', (e) => { status = Number(e.payload); }));
    unlisteners.push(await listen('agent-stream-chunk', (e) => {
      full += e.payload;
      if (onChunk) onChunk(e.payload);
    }));
    unlisteners.push(await listen('agent-stream-error', (e) => {
      err = new Error(String(e.payload).slice(0, 300) || '渠道流式错误');
      resolve();
    }));
    unlisteners.push(await listen('agent-stream-done', () => resolve()));
    await tauriInvoke('agent_http_stream', { url, method, headers, body })
      .catch((e) => { err = e; resolve(); });
    await done;
    if (signal) signal.removeEventListener('abort', onAbort);
    unlisteners.forEach((u) => { try { u(); } catch {} });
    if (err) throw err;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => full,
      json: async () => JSON.parse(full),
    };
  }
  if (currentMode === 'server') {
    // 服务器模式：走 /api/agent/proxy-stream，逐块透传
    const r = await fetch('/api/agent/proxy-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method, headers, body }),
      signal,
    });
    if (!r.body) {
      const data = await r.json().catch(() => ({}));
      return { ok: false, status: data.status || r.status, text: async () => (data.body || '') };
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      full += chunk;
      if (onChunk) onChunk(chunk);
    }
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => full };
  }
  // 浏览器直连（opts 含 signal，fetch 原生支持取消）
  const r = await fetch(url, opts);
  if (!r.body) return { ok: r.ok, status: r.status, text: () => r.text() };
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, { stream: true });
    full += chunk;
    if (onChunk) onChunk(chunk);
  }
  return { ok: r.ok, status: r.status, text: async () => full };
}

/** 提供给大模型的能力与执行器（核心逻辑在 agent-core.js，便于 Node 测试）
 * store 在 boot() 阶段才初始化，故执行器延迟创建
 * onDisplay：查询/存/改的真实结果（含明文）只进应用卡片，不回传 AI 渠道 */
function getAgentExec() {
  return AgentCore.createExecutor(store, PassGen, () => { refreshChips(); refreshList(); }, agentDisplay);
}

/** AI 工具真实结果卡片：明文密码 + 显示/隐藏 + 一键复制（与主页体验一致） */
function agentDisplay(payload) {
  const box = $('#agent-messages');
  if (!box || !payload || !Array.isArray(payload.items) || !payload.items.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'agent-display';
  wrap.innerHTML = payload.items.map((x, i) => `
    <div class="ad-row" data-i="${i}">
      <div class="ad-main">
        <div class="ad-owner">${escapeHtml(x.owner || '')}${x.account ? ' <span class="ad-acc">' + escapeHtml(x.account) + '</span>' : ''}</div>
        ${x.note ? `<div class="ad-note">${escapeHtml(x.note)}</div>` : ''}
      </div>
      <div class="ad-pass">
        <code class="pw-masked ad-pw" data-pw="${escapeHtml(String(x.password || ''))}">••••••••</code>
        <div class="pw-actions">
          <button data-act="toggle" title="显示/隐藏">${ICONS.eye}</button>
          <button data-act="copy" title="复制密码">${ICONS.copy}</button>
        </div>
      </div>
    </div>`).join('');
  wrap.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const row = btn.closest('.ad-row');
    const pwEl = row.querySelector('.ad-pw');
    if (btn.dataset.act === 'toggle') {
      if (pwEl.classList.contains('revealed')) {
        pwEl.classList.remove('revealed');
        pwEl.textContent = '••••••••';
        btn.innerHTML = ICONS.eye;
      } else {
        pwEl.classList.add('revealed');
        pwEl.textContent = pwEl.dataset.pw;
        btn.innerHTML = ICONS.eyeOff;
      }
    } else if (btn.dataset.act === 'copy') {
      await copyText(pwEl.dataset.pw);
    }
  });
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
}

const agentState = { busy: false, messages: [], abortController: null };

function agentBubble(html, cls) {
  const div = document.createElement('div');
  div.className = `agent-msg ${cls}`;
  div.innerHTML = html;
  const box = $('#agent-messages');
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

/** 一轮完整对话：消息 → 工具循环 → 最终回复（流式） */
async function agentChat(userText, onDelta, signal) {
  const cfg = loadAgentConfig();
  if (!cfg.baseUrl || !cfg.model) throw new Error('AI 渠道未配置：请到 设置 → AI 助理 填写接口地址和模型');
  agentState.messages.push({ role: 'user', content: userText });

  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;

  return await AgentCore.chatStream({
    messages: agentState.messages,
    channelFetch: (u, o, onChunk) => agentFetchStream(u, o, onChunk),
    url,
    headers,
    model: cfg.model,
    signal,
    exec: getAgentExec(),
    onEvent: (type, payload) => {
      if (type === 'tool') {
        const label = AgentCore.TOOL_LABELS[payload.name]?.(payload.args) || payload.name;
        agentBubble(`🔧 ${escapeHtml(label)} …`, 'tool');
        agentStatus(`执行：${label}`);
      } else if (type === 'tool_result') {
        const label = AgentCore.TOOL_LABELS[payload.name]?.(payload.args) || payload.name;
        const failed = payload.result && payload.result.error;
        const last = [...$('#agent-messages').children].pop();
        if (last && last.classList.contains('tool')) {
          last.innerHTML = escapeHtml(label) + (failed ? ' · 失败' : ' · 完成');
        }
      } else if (type === 'assistant') {
        agentStatus(payload.tool_calls?.length ? '处理工具结果…' : '');
      }
    },
  });
}

function agentStatus(text) {
  const el = $('#agent-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('hidden', !text);
}

async function agentSend() {
  if (agentState.busy) return;
  const input = $('#agent-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  agentBubble(escapeHtml(text), 'user');
  agentState.busy = true;
  const sendBtn = $('#agent-send');
  const stopBtn = $('#agent-stop');
  sendBtn.disabled = true;
  stopBtn.classList.remove('hidden');
  const ac = new AbortController();
  agentState.abortController = ac;
  const busyBubble = agentBubble('<span class="dotting">正在回复</span>', 'assistant');
  let streamed = false;
  let streamedFull = '';
  let chunkCount = 0;
  let renderTimer = null;
  const renderNow = () => {
    renderTimer = null;
    const t = streamedFull;
    if (!streamed) { busyBubble.innerHTML = ''; streamed = true; }
    if (t) busyBubble.innerHTML = mdToHtml(t);
  };
  try {
    const reply = await agentChat(text, (fullText) => {
      // 流式渐进：仅存储文本，由 rAF 统一渲染（防止手机 WebView 高频 innerHTML 卡顿）
      streamedFull = fullText;
      chunkCount++;
      if (!renderTimer) renderTimer = requestAnimationFrame(renderNow);
    }, ac.signal);
    // 最终回复（可能无流式增量时直接到这里）
    busyBubble.innerHTML = mdToHtml(reply || '');
    // 诊断标记：最终块数（便于排查流式是否真的分块到达）
    busyBubble.insertAdjacentHTML('beforeend', `<span class="stream-dbg" style="font-size:10px;color:#999;float:right">⚡共${chunkCount}块</span>`);
  } catch (e) {
    if (ac.signal.aborted) {
      // 保留已流出的部分 + 停止标记
      busyBubble.innerHTML = (streamedFull ? mdToHtml(streamedFull) : '') + '<div class="agent-stopped">⏹ 已停止</div>';
    } else {
      busyBubble.innerHTML = `<span class="agent-err">${escapeHtml(e.message)}</span>`;
    }
  } finally {
    agentState.busy = false;
    agentState.abortController = null;
    sendBtn.disabled = false;
    stopBtn.classList.add('hidden');
    agentStatus('');
    input.focus();
  }
}

function setAgentPanel(show) {
  const panel = $('#agent-panel');
  const wasHidden = panel.classList.contains('hidden');
  if (show) panel.classList.remove('hidden');
  else panel.classList.add('hidden');
  if (show && wasHidden) history.pushState({ pb: 1 }, ''); // 打开时压一层，返回键先关面板
  else if (!show && !wasHidden && history.state && history.state.pb) { pbSuppressPop = true; history.back(); }
}

$('#btn-agent').addEventListener('click', () => {
  const panel = $('#agent-panel');
  setAgentPanel(panel.classList.contains('hidden'));
  const cfg = loadAgentConfig();
  if (!cfg.baseUrl || !cfg.model) {
    const has = [...$('#agent-messages').children].some((x) => x.classList.contains('cfg-tip'));
    if (!has) {
      agentBubble('当前 AI 渠道未配置。打开 设置 → AI 助理，填入接口地址与模型名即可开始聊天存/查密码。', 'sys cfg-tip');
    }
  }
  $('#agent-input').focus();
});
$('#agent-close').addEventListener('click', () => setAgentPanel(false));

/* 保留欢迎语 HTML，清空对话后恢复 */
const AGENT_WELCOME_HTML = (document.querySelector('#agent-messages .agent-msg.sys') || {}).outerHTML || '';

/* 停止生成：中止当前请求（Tauri 分支内部会同时 invoke agent_abort 让 Rust 停止读取） */
$('#agent-stop').addEventListener('click', () => {
  agentState.abortController?.abort();
});

/* 清空对话：若正在生成先停止，再重置消息与界面 */
$('#agent-clear').addEventListener('click', () => {
  if (agentState.busy) agentState.abortController?.abort();
  agentState.messages = [];
  $('#agent-messages').innerHTML = AGENT_WELCOME_HTML;
  agentStatus('');
});

// 系统返回键 / 浏览器后退：先关弹窗，再关面板，最后才是退出/离开
window.addEventListener('popstate', () => {
  const root = $('#modal-root');
  if (root && root.children.length) { root.innerHTML = ''; return; } // 已由返回键弹出历史，无需再 back()
  const panel = $('#agent-panel');
  if (panel && !panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
  const gen = $('#gen-panel');
  if (gen && !gen.classList.contains('hidden')) gen.classList.add('hidden');
});
$('#agent-send').addEventListener('click', agentSend);
$('#agent-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agentSend(); }
});
$('#agent-input').addEventListener('input', (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
});

/* ---------------- PWA ---------------- */
// 桌面版（Tauri）不需要 Service Worker
if (!IS_TAURI && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 忽略 */ });
  });
}

/* ---------------- 启动 ---------------- */
(async function boot() {
  try {
    // 先过启动锁（PIN），再自动解锁加密库（本机密钥，无感），最后加载数据渲染
    await showLockIfNeeded();
    await initStore();
    await refreshChips();
    await refreshList();
  } catch (e) {
    toast('初始化失败: ' + e.message, true);
    console.error(e);
  }

  // 截图/深链辅助：#shot-xxx 自动打开对应界面（也方便文档直链）
  const shot = (location.hash.match(/^#shot-([a-z]+)/) || [])[1];
  if (shot) setTimeout(() => {
    const badge = $('#mode-badge'); if (badge) badge.style.display = 'none'; // 截图时隐藏存储模式徽标
    if (shot === 'manual') openManualAddModal();
    else if (shot === 'gen') { $('#btn-gen-open').click(); setTimeout(() => $('#btn-generate')?.click(), 150); }
    else if (shot === 'agent') $('#btn-agent').click();
    else if (shot === 'settings') openSettingsModal();
    else if (shot === 'import') openImportModal();
    else if (shot === 'guide') openGuideModal();
  }, 500);
})();

/* ---------------- 使用说明（图文） ---------------- */
let _guideDir = 'guide'; // 由 openGuideModal 根据当前设备设置

function guideSec(img, title, html) {
  const dir = _guideDir;
  return `
    <section class="guide-sec">
      <h4>${title}</h4>
      ${img ? `<img class="guide-img" src="${dir}/${img}" alt="${title}" loading="lazy" />` : ''}
      <div class="guide-txt">${html}</div>
    </section>`;
}

function openGuideModal() {
  // 根据当前设备选图目录：触屏设备（手机/PWA）显示手机版截图
  _guideDir = (navigator.maxTouchPoints > 0 && 'ontouchstart' in window) ? 'guide-mobile' : 'guide';
  openModal(`
    <div class="modal-head">
      <h3>使用说明</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body guide-body">
      ${guideSec('main.png', '① 界面总览与强搜索', `
        <p>顶部<b>搜索框</b>支持多词与操作符：除了关键词（命中 所属 / 账户 / 网址 / 备注 / 分类，自动打分排序+高亮），还可以用 <code>分类：工作</code>、<code>有验证码</code>、<code>无验证码</code> 这样的过滤语法组合筛选。</p>
        <p>每条记录默认打码，点 <b>眼睛</b> 看明文、<b>复制</b> 进剪贴板；带 <b>TOTP 动态码</b> 的记录会实时显示 6 位验证码与倒计时（点一下即复制）；带 <b>📎 徽标</b> 的记录挂着附件（点开即可查看/另存）。</p>`)}
      ${guideSec('manual.png', '② 存一条密码（手动录入）', `
        <p>点工具栏 <b>「＋ 手动录入」</b>，填写<b>所属</b>（应用/网站）、<b>账户</b>、<b>密码</b>三项必填。</p>
        <p>还可选填 <b>TOTP 密钥</b>（base32 或直接粘贴 otpauth:// 链接自动提取）、<b>分类</b>、<b>网址</b>、<b>备注</b>；编辑已有记录时能上传<b>附件</b>（每张 ≤2MB，随数据库加密存储）。</p>
        <p>连续录入用<b>「保存并继续录入」</b>；改密码时旧密码自动归档进<b>历史</b>，随时可查看/复制。</p>`)}
      ${guideSec('gen.png', '③ 生成强密码（字符型）', `
        <p>点 <b>「生成密码」</b> 展开生成器：选长度、字符类型，可勾选排除易混淆字符、键盘布局不连续、禁止连续相同/顺序字符等约束。</p>
        <p>实时显示<b>熵值与强度评级</b>；生成后一键<b>复制</b>或<b>保存到密码本</b>。手动录入表单里的魔棒按钮也能按当前设置快速生成。</p>`)}
      ${guideSec('phrase.png', '④ 生成密码短语（好记型）', `
        <p>切到 <b>「密码短语」</b> 标签：用<b>中文词表</b>（或 English words）随机组词，自选词数（推荐 6+）、分隔符，可附加两位数字。</p>
        <p>例如「灯塔-枫叶-晨曦-海豚-麦浪-松柏-47」，比随机字符串好记得多，6 词约 54 bits、8 词约 72 bits，配合数字更高。</p>`)}
      ${guideSec('agent.png', '⑤ AI 助理：聊天存 / 查 / 改密码', `
        <p>点右上角 <b>星形图标</b> 打开侧边对话面板，直接说人话：</p>
        <p>· 「帮我存一下：GitHub，账户 tom@example.com，密码 Abc!2345，备注工作主力号」<br/>
           · 「我 GitHub 的密码是什么？」<br/>
           · 「把 GitHub 的密码改成 Xk9#New2025」<br/>
           · 「生成一个 20 位不含符号的密码」</p>
        <p><b>隐私保护</b>：查询结果里的密码已打码，真实密码只在应用内卡片展示（可点眼睛/一键复制，与主页一致），不会发送给 AI 渠道；存、改密码时你提供的内容会发送给你配置的模型渠道。</p>
        <p>面板右上角可<b>清空对话</b>；生成过程中可点<b>停止</b>按钮随时中断。</p>`)}
      ${guideSec('sync.png', '⑥ 设置：加密 / 备份 / 锁定', `
        <p>点右上角<b>齿轮</b>打开设置：</p>
        <p>· <b>自动备份快照</b>：每小时自动把数据库整份快照存入 <code>backups/</code>，滚动保留最近 3~20 份；可随时<b>立即备份</b>，列表里每份可一键<b>恢复</b>或删除——误删、写坏都能救回来。</p>
        <p>· <b>数据库加密</b>：AES-256 全库加密（含导出的 .db），密钥自动生成仅存本机，启动自动解密。<b>请务必备份密钥</b>（设置页 → 数据库加密 → 备份密钥），换设备导入加密 .db 时需要它。</p>
        <p>· <b>存储模式 / 数据库位置</b>：桌面版默认本地文件，可指向网盘文件夹多机共用。</p>
        <p>· <b>AI 助理</b>：填接口地址 / 模型名 / API Key（OpenAI 兼容渠道均可）。</p>
        <p>· <b>启动锁 PIN</b> 与 <b>自动锁定</b>：闲置可锁定（默认 5 分钟，可选），复制密码后剪贴板自动清除；深色主题跟随系统或手动固定。电脑（Windows Hello）与手机（指纹/面容）可开启<b>生物识别解锁</b>，启动时免输 PIN，未通过自动回退 PIN。</p>`)}
      ${guideSec('', '⑦ 多端同步（手机 ↔ 电脑）', `
        <p>每台设备各存一份完整数据库（桌面是本地 <b>.db</b> 文件，手机是应用内存储），通过<b>导出 .db → 网盘/Syncthing → 另一端导入</b>合并；导入时选<b>「合并（跳过重复）」</b>即可汇总。</p>
        <p>Android 版默认开启<b>防截屏</b>：截图、最近任务卡片都看不到密码内容。</p>`)}
      ${guideSec('import.png', '⑧ 批量导入 / 导出备份', `
        <p>「导入」支持三种方式：<b>粘贴文本</b>（每行一条：<code>所属,账户,密码[,网址][,备注]</code>）、上传 <b>CSV / JSON / TXT</b>、以及直接导入别的设备的 <b>.db</b> 文件（加密的 .db 会提示输入密钥文本解锁后导入）。</p>
        <p>「导出」可导出 .db 数据库（用于同步，已启用加密时导出副本同样为密文）或 JSON 备份（用于留存）。</p>`)}
      <p class="hint">提示：请保管好数据库文件，建议开启数据库加密（自动密钥，请备份密钥文本）与启动锁 PIN；配合自动备份快照更安心。</p>
    </div>
    <div class="modal-foot">
      <button class="btn primary" id="btn-guide-ok">知道了</button>
    </div>
  `, true);
  $('#btn-guide-ok').addEventListener('click', closeModal);
}
$('#btn-guide').addEventListener('click', openGuideModal);
