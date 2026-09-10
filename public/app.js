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
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14h.01M14 21h.01M17.5 17.5h.01M21 21h.01"/></svg>',
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
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17.25 6.16 20.4l1.26-6.5-4.72-4.6 6.53-.95L12 2.75l2.77 5.6 6.53.95-4.72 4.6 1.26 6.5Z"/></svg>',
  starFill: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17.25 6.16 20.4l1.26-6.5-4.72-4.6 6.53-.95L12 2.75l2.77 5.6 6.53.95-4.72 4.6 1.26 6.5Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>',
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
  favicons: false, // 站点图标（v2.7.0）：联网经 DuckDuckGo 图标服务，默认关
  quickNoteShortcut: 'Ctrl+Alt+N', // v4.3.0：桌面随手记全局快捷键
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
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal)); // v3.3.3：统一关闭约定（TOTP 说明「我知道了」此前无监听）
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
    fav INTEGER NOT NULL DEFAULT 0,
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
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    mime TEXT NOT NULL DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'other',
    tags TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    ftext TEXT NOT NULL DEFAULT '',
    ftext_ok INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at);
  CREATE INDEX IF NOT EXISTS idx_files_sha ON files(sha256);
  CREATE TABLE IF NOT EXISTS file_kv (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL DEFAULT ''
  );
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
  async list({ q = '', category = '', sort = 'updated', favOnly = false } = {}) {
    const p = new URLSearchParams({ q, category, sort });
    if (favOnly) p.set('fav', '1');
    const r = await fetch('/api/entries?' + p, { cache: 'no-store' });
    if (!r.ok) throw new Error('获取列表失败');
    return r.json();
  },
  async setFav(id, fav) {
    const r = await fetch('/api/entries/' + id + '/fav', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fav: fav ? 1 : 0 }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '操作失败');
    return j;
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
  /* v4.3.0：便签仅本地模式支持（远程服务端无 notes 表，返回空并提示） */
  notesList() { return []; },
  async noteCreate() { throw new Error('便签仅本地存储模式支持'); },
  /* v4.4.0：文件仓仅本地模式支持（远程服务端无 files 表，同便签口径提示） */
  filesList() { return []; },
  async fileCreate() { throw new Error('文件仓仅本地存储模式支持'); },

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
    let backfilled = false;
    if (bytes && bytes.byteLength > 0) {
      this.db = new SQL.Database(new Uint8Array(bytes));
      // v2.7.1：存量老库补建缺失表/索引（SCHEMA_SQL 全部 IF NOT EXISTS，幂等）——
      // v2.4.0 前创建的库没有 attachments 表，详情页附件查询曾报 no such table
      this.db.run(SCHEMA_SQL);
      backfilled = true;
    } else {
      this.db = new SQL.Database();
      this.db.run(SCHEMA_SQL);
      await this.persist();
    }
    // v1.3.0/v1.5.0/v2.7.0 迁移：为旧库补 totp_secret / history / fav 列（幂等）
    const cols = this.query('PRAGMA table_info(entries)').map((c) => c.name);
    let migrated = false;
    if (!cols.includes('totp_secret')) { this.db.run("ALTER TABLE entries ADD COLUMN totp_secret TEXT NOT NULL DEFAULT ''"); migrated = true; }
    if (!cols.includes('history')) { this.db.run("ALTER TABLE entries ADD COLUMN history TEXT NOT NULL DEFAULT ''"); migrated = true; }
    if (!cols.includes('fav')) { this.db.run('ALTER TABLE entries ADD COLUMN fav INTEGER NOT NULL DEFAULT 0'); migrated = true; }
    // v4.5.0：文件仓内容检索列（老库补列，幂等）
    const fcols = this.query('PRAGMA table_info(files)').map((c) => c.name);
    if (fcols.length) {
      if (!fcols.includes('ftext')) { this.db.run("ALTER TABLE files ADD COLUMN ftext TEXT NOT NULL DEFAULT ''"); migrated = true; }
      if (!fcols.includes('ftext_ok')) { this.db.run('ALTER TABLE files ADD COLUMN ftext_ok INTEGER NOT NULL DEFAULT 0'); migrated = true; }
    }
    if (migrated || backfilled) await this.persist();
  },
  /** 读取底层原始字节：Tauri 下从数据库文件读，否则从 IndexedDB 读 */
  async _readRaw() {
    if (IS_TAURI) {
      const path = await getTauriDbPath();
      const bytes = await tauriReadDb(path); // v4.1.1：base64 IPC
      return bytes && bytes.length ? bytes : null;
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
      await tauriWriteDb(path, out); // v4.1.1：base64 IPC
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
    // v4.4.0：文件本体从固定设备密钥重加密为数据库密钥（同 DbCrypto 体系）
    try { const n = await vaultReencryptAll(key, FILE_FIXED_MATERIAL); if (n) toast(`文件仓 ${n} 个文件本体已随库加密`); }
    catch (e) { console.warn('[passbook] 文件本体重加密失败', e); toast('文件本体重加密失败：' + e.message, true); }
    return key; // 返回密钥材料，供设置页展示备份
  },
  /** 关闭加密：把整库重写为明文，并删除本机保存的密钥 */
  async disableEncryption() {
    if (!this._encrypted) throw new Error('当前文件未加密');
    const oldKey = this._key; // v4.4.0：关库加密时文件本体回退到固定设备密钥（重加密唯一路径）
    this._encKey = null; this._encSalt = null; this._key = null; this._encrypted = false;
    this.clearKey();
    await this.persist();
    try { await vaultReencryptAll(FILE_FIXED_MATERIAL, oldKey); }
    catch (e) { console.warn('[passbook] 文件本体重加密失败', e); }
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

  /* ---------------- 便签（v4.3.0 随手记）：notes 表 CRUD ---------------- */
  notesList() {
    return this.query('SELECT * FROM notes ORDER BY updated_at DESC, id DESC');
  },
  async noteCreate({ title = '', content = '', tags = '', source = 'manual' }) {
    const now = new Date().toISOString();
    this.db.run(
      'INSERT INTO notes (title, content, tags, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [title, content, tags, source, now, now],
    );
    await this.persist();
    return this.lastInsertId();
  },
  async noteUpdate(id, { title, content, tags }) {
    this.db.run(
      'UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?',
      [title, content, tags, new Date().toISOString(), id],
    );
    await this.persist();
  },
  async noteRemove(id) {
    this.db.run('DELETE FROM notes WHERE id = ?', [id]);
    await this.persist();
  },

  /* ---------------- 文件仓（v4.4.0）：files 元数据表 CRUD（本体在 files-store 分桶加密，绝不进 SQLite） ---------------- */
  filesList() {
    return this.query('SELECT * FROM files ORDER BY created_at DESC, id DESC');
  },
  async fileCreate(row) {
    this.db.run(
      'INSERT INTO files (name, mime, size, sha256, source, tags, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [row.name, row.mime, row.size, row.sha256, row.source, row.tags, row.note, row.created_at],
    );
    await this.persist();
    return this.lastInsertId();
  },
  async fileUpdate(id, { name, tags, note }) {
    const cur = this.query('SELECT * FROM files WHERE id = ?', [id])[0];
    if (!cur) throw new Error('文件记录不存在');
    this.db.run('UPDATE files SET name = ?, tags = ?, note = ? WHERE id = ?', [
      (name ?? cur.name), (tags ?? cur.tags), (note ?? cur.note), id,
    ]);
    await this.persist();
  },
  async fileRemove(id) {
    this.db.run('DELETE FROM files WHERE id = ?', [id]);
    await this.persist();
  },
  /** v4.5.0 内容检索：写入抽取正文（ok=1 表示已索引；正文空也算已索引，避免反复重试） */
  async fileSetFtext(id, ftext, ok) {
    this.db.run('UPDATE files SET ftext = ?, ftext_ok = ? WHERE id = ?', [ftext || '', ok ? 1 : 0, id]);
    await this.persist();
  },
  fileKvGet(k) {
    try { return (this.query('SELECT v FROM file_kv WHERE k = ?', [k])[0] || {}).v || null; } catch { return null; }
  },
  async fileKvSet(k, v) {
    this.db.run('INSERT INTO file_kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', [k, String(v)]);
    await this.persist();
  },
  async list({ q = '', category = '', sort = 'updated', favOnly = false } = {}) {
    const where = [];
    const params = [];
    if (q) {
      const like = `%${escLike(q.trim())}%`;
      where.push(`(owner LIKE ? ESCAPE '\\' OR account LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like, like);
    }
    // v3.4.0：多分类——逗号边界精确匹配（'个人' 不会误命中 '个人理财'）；
    // 旧单值数据天然兼容（'工作' ↔ ',工作,'）
    if (category) { where.push("(',' || category || ',') LIKE ? ESCAPE '\\'"); params.push('%,' + escLike(String(category)) + ',%'); }
    if (favOnly) where.push('fav = 1'); // 收藏筛选（v2.7.0）
    let order = 'updated_at DESC, id DESC';
    if (sort === 'created') order = 'created_at DESC, id DESC';
    if (sort === 'owner') order = 'owner COLLATE NOCASE ASC, account COLLATE NOCASE ASC';
    order = `fav DESC, ${order}`; // 收藏置顶（v2.7.0）
    const sql = `SELECT * FROM entries ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`;
    const items = this.query(sql, params);
    return { items, total: items.length };
  },
  async setFav(id, fav) {
    this.db.run('UPDATE entries SET fav = ? WHERE id = ?', [fav ? 1 : 0, id]);
    await this.persist();
    return this.query('SELECT * FROM entries WHERE id = ?', [id])[0];
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
          'INSERT INTO entries (owner, account, password, url, category, note, totp_secret, history, fav, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [e.owner, e.account, e.password, e.url, e.category, e.note, e.totp_secret ?? '', typeof e.history === 'string' ? e.history : '', raw && (raw.fav === 1 || raw.fav === true) ? 1 : 0, now, now]
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
      const srcPath = await getTauriDbPath();
      // Android 无桌面保存对话框（tauri dialog 不可用）：走 SAF 系统另存为（v3.0.5）
      if (IS_ANDROID && window.__passbook_saf) {
        const bytes = await tauriReadDb(srcPath); // v4.1.1：base64 IPC
        await androidSafSave(bytes, 'passwords.db');
        return { safSaved: true };
      }
      // 桌面版：弹系统保存对话框，复制数据库文件
      const dest = await tauriInvoke('export_db', { srcPath });
      if (!dest) return null; // 对话框取消——不再返回 {tauriPath:null} 假对象（曾致 createObjectURL 报错）
      return { tauriPath: dest };
    }
    const bytes = this.db.export();
    return new Blob([bytes], { type: 'application/octet-stream' });
  },
  async exportJsonToFile() {
    if (IS_TAURI) {
      const data = await this.exportJson();
      const contents = JSON.stringify(data, null, 2);
      // Android：SAF 系统另存为（v3.0.5）
      if (IS_ANDROID && window.__passbook_saf) {
        const fname = `passbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
        await androidSafSave(new TextEncoder().encode(contents), fname);
        return { safSaved: true };
      }
      const dest = await tauriInvoke('export_json', { contents });
      if (!dest) return null;
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
/** v4.1.1：数据库文件读写走 base64 IPC——旧的 JSON 数字数组载荷随库体积线性变慢，
 *  导入大量条目后兆级库单条删除耗时近 10 秒；base64 一次编解码降至毫秒级。 */
async function tauriWriteDb(path, bytes) {
  await tauriInvoke('write_db_file_b64', { path, b64: bytesToBase64(bytes) });
}
async function tauriReadDb(path) {
  const b64 = await tauriInvoke('read_db_file_b64', { path });
  return b64 ? base64ToBytes(b64) : null;
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
  const oldKey = LocalStore._key; // v4.4.0：换密钥时文件本体随之重加密（唯一重加密路径）
  const newKey = await LocalStore.generateKey();
  LocalStore._key = newKey;
  LocalStore._encSalt = DbCrypto.newSalt();
  LocalStore._encKey = await DbCrypto.deriveKey(newKey, LocalStore._encSalt);
  LocalStore._encrypted = true;
  LocalStore.saveKey(newKey);
  await LocalStore.persist();
  try { await vaultReencryptAll(newKey, oldKey); }
  catch (e) { console.warn('[passbook] 文件本体重加密失败', e); }
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
  favOnly: false, // 收藏筛选（v2.7.0 侧栏「收藏」）
  sort: 'updated',
  categories: [],
  total: 0,
  currentGenPw: '',
  // v3.4.0：多分类体系
  filterCats: [],      // 漏斗多分类筛选（额外维度，与侧栏单分类叠加）
  filterMode: 'any',   // 'any' | 'all' | 'exclude'
  multiSelect: false,  // 列表多选模式
  selectedIds: new Set(),
  visibleIds: [],      // v4.1.1：当前搜索/筛选后实际可见的条目 id（全选以此为准）
  view: 'pass',        // v4.3.0：页面级三标签 pass | notes | files
  noteQ: '',           // v4.3.1：便签页独立搜索词（与顶栏密码搜索互不干扰）
};

/** 字母头像颜色：按文本 hash 取 HSL（v2.7.0 favicon 回退） */
function avatarHue(text) {
  let h = 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** 卡片图标位 HTML（v2.7.0）：默认首字头像；开启站点图标时三级回退（v3.0.2）：
 *  ① 站点直连 https://{域名}/favicon.ico（国内免代理可达，不经过第三方）
 *  ② DuckDuckGo 图标服务（代理环境可用）
 *  ③ 首字头像（纯本地） */
function faviconSlot(it) {
  const domain = pbDomainOf(it.url); // v3.3.8：host 含端口（frp-way.com:44806 等），与 hydrate 同源
  const letter = escapeHtml(String(it.owner || '?').trim().charAt(0).toUpperCase() || '?');
  const style = `background:hsl(${avatarHue(it.owner)} 62% 88%);color:hsl(${avatarHue(it.owner)} 45% 32%)`;
  if (loadSettings().favicons && domain) {
    const rev = loadSettings().faviconRev || 0;
    const bust = rev ? `?v=${rev}` : '';
    if (IS_TAURI) {
      // v3.0.9：Android WebView 外部请求（fetch/img）全被 tauri 拦截层挡死，
      // Tauri 环境不写远程 src——由 hydrateFavicons() 经 Rust reqwest 下载转
      // data:URL 注入。v3.0.12：不带任何内联 onload/onerror（无 src 的 img
      // 插入时可能触发内联 onerror 自删，水合来不及处理），显示完全由 JS 控制
      return `<span class="entry-favicon" style="${style}">${letter}<img data-fd="${escapeHtml(domain)}" style="opacity:0;transition:opacity .15s" alt="" /></span>`;
    }
    // 浏览器模式：直连 img（opacity 淡入 + 站点直连→DDG 回退）
    return `<span class="entry-favicon" style="${style}">${letter}<img data-fd="${escapeHtml(domain)}" src="https://${escapeHtml(domain)}/favicon.ico${bust}" style="opacity:0;transition:opacity .15s" onload="if(this.naturalWidth){this.style.opacity='1'}else{this.onerror()}" onerror="if(this.dataset.f2){this.remove()}else{this.dataset.f2='1';this.src='https://icons.duckduckgo.com/ip3/'+encodeURIComponent(this.dataset.fd)+'.ico${bust}'}" /></span>`;
  }
  return `<span class="entry-favicon" style="${style}">${letter}</span>`;
}

/** 自绘输入联想（v3.0.8）：替代原生 datalist——Android WebView 的 datalist
 *  下拉定位有缺陷会遮挡输入框，改为输入框正下方绝对定位列表（双端统一行为）。
 *  getItems() 每次输入时实时取全部候选；过滤：不区分大小写包含，最多 8 条；
 *  空输入/无匹配不显示；点选项回填并触发 change；blur/ESC/Enter 关闭；
 *  选项 mousedown preventDefault 防 blur 先行关闭。
 *  v3.0.9 opts（手动录入弹窗用）：badge=Set（命中值渲染「预置」徽章）；
 *  onPick=fn(value)（选中后回调，如自动填 URL）。 */
function attachSuggest(inputEl, getItems, opts) {
  if (!inputEl) return;
  const field = inputEl.closest('.field');
  if (!field) return;
  opts = opts || {};
  field.style.position = 'relative'; // .pb-suggest 的定位锚
  let box = null, tm = null;
  const close = () => { if (box) { box.remove(); box = null; } clearTimeout(tm); };
  const open = () => {
    const q = inputEl.value.trim();
    if (!q) { close(); return; }
    const low = q.toLowerCase();
    const hit = (getItems() || []).filter((x) => x && x.toLowerCase().includes(low)).slice(0, 8);
    close();
    if (!hit.length) return;
    box = document.createElement('div');
    box.className = 'pb-suggest';
    box.innerHTML = hit
      .map((x) => `<div class="pb-suggest-item" data-v="${escapeHtml(x)}">${escapeHtml(x)}${opts.badge && opts.badge.has(x) ? '<span class="pb-badge">预置</span>' : ''}</div>`)
      .join('');
    box.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 保住焦点，防 blur 关闭竞速
      const it = e.target.closest('.pb-suggest-item');
      if (!it) return;
      inputEl.value = it.dataset.v;
      close();
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (opts.onPick) opts.onPick(it.dataset.v);
    });
    field.appendChild(box);
  };
  inputEl.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(open, 150); });
  inputEl.addEventListener('blur', () => setTimeout(close, 120));
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); });
}

/* ---------------- favicon 注水（v3.0.9，仅 Tauri）----------------
 * Android WebView 的外部 fetch/img 全被 tauri 拦截层拦截，唯一可用网络
 * 路径是 Rust reqwest（AI 聊天实测可通）。列表渲染后扫描 img[data-fd]，
 * 经 favicon_fetch 下载图标转 data:URL 注入；内存 Map 缓存（domain →
 * dataUrl | null 已知失败）防止重渲染反复请求；「重试加载全部图标」清缓存。 */
const faviconDataCache = new Map();
/* 图标持久缓存（v3.3.1）：成功的 data:URL 存 localStorage，重启/断网后
 * 仍显示上次成功图标——首字母只兜底从未成功过的条目；上限 200 条先进先出 */
function faviconPersistGet(domain) {
  try { return localStorage.getItem('pb-fav:' + domain); } catch { return null; }
}
function faviconPersistSet(domain, dataUrl) {
  try {
    localStorage.setItem('pb-fav:' + domain, dataUrl);
    const keys = Object.keys(localStorage).filter((k) => k.indexOf('pb-fav:') === 0);
    if (keys.length > 200) localStorage.removeItem(keys[0]); // 粗略 FIFO 上限
  } catch { /* 超配额静默放弃 */ }
}
let lastHydration = null; // 最近一次列表水合的 Promise（重试统计要接它）
/* v3.3.1 请求纪律：渲染只读缓存零网络；仅 ①刚导入 ②编辑了网址字段 ③手动重试
 * 才发起请求，每次至多 3 连试（直连→DDG→直连）。首字母只兜底从未成功过的条目。 */
const faviconDemand = new Set();
function pbDomainOf(url) {
  // v3.3.8：u.host（含端口）而非 hostname——frp-way.com:44806 这类非标准端口
  // 站点此前被截掉端口导致图标恒失败；www 前缀只作用于主机部分，端口不受影响
  try { const u = new URL((url || '').includes('://') ? url : 'https://' + url); return u.host.replace(/^www\./, ''); } catch { return ''; }
}
async function hydrateFavicons(mode = 'cache-only') {
  if (!IS_TAURI) return { ok: 0, fail: 0 };
  let ok = 0, fail = 0; const jobs = [];
  // v3.3.2：fetch 模式要重扫全部 img——refreshList 内部的 cache-only 已把它们
  // 标记 data-hydrated，若仍排除已标记节点，手动重试/导入触发会恒扫到 0 个
  const sel = (mode === 'cache-only' && faviconDemand.size === 0) ? 'img[data-fd]:not([data-hydrated])' : 'img[data-fd]';
  const imgs = document.querySelectorAll(sel);
  for (const img of imgs) {
    const domain = img.dataset.fd;
    if (!domain) continue;
    img.dataset.hydrated = '1';
    const apply = (d) => { if (document.body.contains(img) && d) { img.src = d; img.style.opacity = '1'; } };
    const mem = faviconDataCache.has(domain) ? faviconDataCache.get(domain) : faviconPersistGet(domain);
    if (mem) { faviconDataCache.set(domain, mem); apply(mem); }
    const wantFetch = mode === 'fetch-all' || faviconDemand.has(domain) || (!mem && mode === 'fetch-missing');
    faviconDemand.delete(domain);
    if (!wantFetch) continue; // cache-only 渲染：零网络
    jobs.push((async () => {
      let dataUrl = null;
      // v3.3.8：3 连试——https(带端口)→http(带端口)→DDG（对带端口域名无意义，仅用主机名）
      const host = domain.split(':')[0];
      const tryUrls = [`https://${domain}/favicon.ico`, `http://${domain}/favicon.ico`, `https://icons.duckduckgo.com/ip3/${host}.ico`];
      for (const u of tryUrls) {
        try { const r = await tauriInvoke('favicon_fetch', { url: u }); if (r) { dataUrl = r; break; } } catch { /* 换下一个 */ }
      }
      if (dataUrl) { faviconDataCache.set(domain, dataUrl); faviconPersistSet(domain, dataUrl); apply(dataUrl); ok++; }
      else { if (!mem && document.body.contains(img)) img.remove(); fail++; } // 无旧图才回退首字母
    })());
  }
  await Promise.all(jobs);
  return { ok, fail };
}

/* ---------------- 列表渲染 ---------------- */
async function refreshList() {
  try {
    // 强搜索管线（v2.1.0）：解析操作符与多词；
    // 单词无操作符 → 服务端 LIKE 粗筛后客户端打分高亮；
    // 多词/操作符 → 拉当前分类全量，客户端过滤排序
    const pq = (window.PassSearch || { parseQuery: (q) => ({ terms: q ? [q.toLowerCase()] : [], filters: {}, unknown: [] }) }).parseQuery(state.q);
    const advanced = pq.terms.length > 1 || Object.keys(pq.filters).length > 0 || (pq.unknown && pq.unknown.length);
    const serverQ = advanced ? '' : (pq.terms[0] || '');
    // v3.4.0：分类筛选改在客户端做（catSplit 集合包含）——本地库多分类条目
    // 不再依赖 SQL 侧过滤，远程模式的旧服务端精确匹配也不再漏多分类条目
    const { items, total } = await store.list({ q: serverQ, category: '', sort: serverSortKey(), favOnly: state.favOnly });
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
    // v3.4.0：侧栏单分类（二级筛选）= 集合包含（大小写不敏感）
    if (state.category) {
      const k = state.category.toLowerCase();
      shown = shown.filter((it) => PassSearch.catSplit(it.category).some((c) => c.toLowerCase() === k));
    }
    // v3.4.0：漏斗多分类筛选（any/all/exclude），与侧栏分类、收藏叠加
    if (state.filterCats && state.filterCats.length) {
      shown = PassSearch.catFilter(shown, state.filterCats, state.filterMode || 'any');
    }
    // 收藏置顶（v2.7.0）+ 主页自定义排序（v3.4.2）：收藏始终优先于排序键；
    // 服务端拉取参数不变（仍按 updated），客户端统一用 sortEntries 重排覆盖
    const sSet = loadSettings();
    const sKey = sSet.sortKey || 'updated';
    const sOrd = sSet.sortOrder || (sKey === 'updated' || sKey === 'created' || sKey === 'totp' ? 'desc' : 'asc');
    shown = PassSearch.sortEntries(shown, sKey, sOrd);
    state.visibleIds = shown.map((it) => it.id); // v4.1.1：记录当前可见集合，多选全选按它算
    sortChipRender();
    renderEntries(shown, hitsMap);
    const filtered = (state.q || (state.filterCats && state.filterCats.length) || state.category) && shown.length !== total ? `${shown.length}/` : '';
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
      <div class="entry ${state.multiSelect ? 'ms-mode' : ''} ${state.selectedIds.has(it.id) ? 'ms-checked' : ''}" data-id="${it.id}">
        ${state.multiSelect ? `<span class="ms-check" title="勾选/取消">${state.selectedIds.has(it.id) ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}</span>` : ''}
        <div class="entry-top">
          ${faviconSlot(it)}
          <div class="entry-main">
            <div class="entry-title">
              <button class="entry-fav ${it.fav ? 'active' : ''}" data-act="fav" title="${it.fav ? '取消收藏' : '收藏'}">${it.fav ? ICONS.starFill : ICONS.star}</button>
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
              <button data-act="qr" title="二维码">${ICONS.qr}</button>
<button data-act="edit" title="编辑">${ICONS.edit}</button>
              <button data-act="del" class="del" title="删除">${ICONS.trash}</button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
  lastHydration = hydrateFavicons(); // v3.0.9：Tauri 环境经 Rust 下载图标注入 data:URL（内部自守卫）
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
  // v3.4.0 多选：多选模式下点卡片任意处（除操作按钮/链接）=切换勾选；
  // 桌面 ctrl/cmd+点击卡片可直接把单张加入多选（自动进入多选模式）
  const card0 = e.target.closest('.entry');
  if (card0 && !e.target.closest('button[data-act]') && !e.target.closest('a')) {
    if (state.multiSelect) {
      const id = Number(card0.dataset.id);
      if (state.selectedIds.has(id)) state.selectedIds.delete(id); else state.selectedIds.add(id);
      card0.classList.toggle('ms-checked', state.selectedIds.has(id));
      card0.querySelector('.ms-check').innerHTML = state.selectedIds.has(id)
        ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '';
      msUpdateBar();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.target.closest('input,textarea')) {
      state.multiSelect = true;
      state.selectedIds = new Set([Number(card0.dataset.id)]);
      $('#btn-multiselect')?.classList.add('active');
      refreshList();
      msUpdateBar();
      return;
    }
  }
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
  } else if (act === 'qr') {
    // v4.0.0：条目 → 二维码（分享/迁移）
    const item = (await store.list({})).items.find((x) => x.id === id);
    if (item) openEntryQrModal(item);
  } else if (act === 'fav') {
    // 收藏星标（v2.7.0）：乐观切换 + 重排（收藏置顶）
    const item = (await store.list({})).items.find((x) => x.id === id);
    if (!item) return;
    const next = !item.fav;
    try {
      await store.setFav(id, next);
      btn.classList.toggle('active', next);
      btn.innerHTML = next ? ICONS.starFill : ICONS.star;
      btn.title = next ? '取消收藏' : '收藏';
      refreshSidebar();
      refreshList();
    } catch (err) { toast(err.message, true); }
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
        state.selectedIds.delete(id); // v4.1.1：单删也同步勾选集合，多选计数不残留
        toast('已删除');
        refreshChips();
        refreshList();
      } catch (err) { toast(err.message, true); }
    }
  }
});

/* ---------------- 多选模式 + 批量操作（v3.4.0）---------------- */
function msUpdateBar() {
  const bar = $('#ms-bar');
  if (!bar) return;
  bar.classList.toggle('hidden', !state.multiSelect);
  // v3.4.1：多选时给列表底部让出操作台高度，最后一张卡片不再被挡
  document.body.classList.toggle('ms-on', state.multiSelect);
  const n = state.selectedIds.size;
  $('#ms-count').textContent = `已选 ${n} 项`;
  // v4.1.1：全选按钮状态以当前可见集合为准（搜索/筛选后可见数，而非全库 total）
  const vis = state.visibleIds.length;
  $('#ms-select-all').textContent = n && vis && n >= vis ? '取消全选' : '全选';
}
function msEnter() {
  state.multiSelect = true;
  state.selectedIds = new Set();
  $('#btn-multiselect')?.classList.add('active');
  refreshList();
  msUpdateBar();
}
function msExit() {
  state.multiSelect = false;
  state.selectedIds = new Set();
  $('#btn-multiselect')?.classList.remove('active');
  refreshList();
  msUpdateBar();
}
/** v4.1.1：取当前可见条目 id（搜索 + 分类 + 漏斗 + 收藏后的最终列表），全选以此为准 */
function msCurrentIds() {
  return state.visibleIds.slice();
}
/** 全部分类 → 计数（catSplit 统计，v3.4.0） */
async function allCatCounts() {
  const { items } = await store.list({ q: '', category: '' });
  const m = new Map();
  for (const it of items) for (const c of PassSearch.catSplit(it.category)) m.set(c, (m.get(c) || 0) + 1);
  return m;
}
/** 批量加/移除分类弹窗（op='add'|'remove'） */
async function openBatchCatModal(op) {
  if (!state.selectedIds.size) return toast('请先勾选条目', true);
  const counts = await allCatCounts();
  const isAdd = op === 'add';
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `
    <label class="bcat-row"><input type="checkbox" value="${escapeHtml(c)}" /> ${escapeHtml(c)} <span class="hint">（${n} 条）</span></label>`).join('');
  const close = openOverlayModal(`
    <div class="modal-head"><h3>批量${isAdd ? '加' : '移除'}分类（已选 ${state.selectedIds.size} 项）</h3></div>
    <div class="modal-body">
      ${rows ? `<div class="bcat-list">${rows}</div>` : '<p class="hint">暂无既有分类。</p>'}
      ${isAdd ? `<div class="field" style="margin-top:10px"><span>新建分类（可选，逗号分隔可多个）</span><input id="bcat-new" placeholder="如：工作, 个人" /></div>` : ''}
      <p class="hint">${isAdd ? '勾选/输入的分类会追加到所选条目（去重）。' : '勾选的分类会从所选条目移除（仅摘标签，不删密码）。'}</p>
    </div>
    <div class="modal-foot"><button class="btn" data-close>取消</button><button class="btn primary" id="bcat-ok">确定</button></div>
  `);
  $('#bcat-ok').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const picked = [...document.querySelectorAll('.bcat-row input:checked')].map((i) => i.value);
    const news = PassSearch.catSplit(($('#bcat-new')?.value || ''));
    const cats = [...new Set([...picked, ...news])];
    if (!cats.length) return toast('请先勾选或输入分类', true);
    if (btn.dataset.c1 === '1') { /* 二次点击执行 */ }
    else {
      btn.dataset.c1 = '1'; btn.textContent = `再点一次${isAdd ? '追加' : '移除'}（${cats.join('、')}）`; btn.classList.add('danger');
      btn.dataset.tm = String(setTimeout(() => { delete btn.dataset.c1; btn.textContent = '确定'; btn.classList.remove('danger'); }, 3000));
      return;
    }
    clearTimeout(Number(btn.dataset.tm || 0));
    btn.disabled = true; btn.textContent = '处理中…';
    try {
      const all = (await store.list({})).items;
      let n = 0;
      for (const it of all) {
        if (!state.selectedIds.has(it.id)) continue;
        const next = PassSearch.catApply(it.category, cats, op);
        if (next === it.category) continue;
        await store.update(it.id, { ...it, category: next });
        n++;
      }
      close();
      toast(`已${isAdd ? '追加' : '移除'}分类：${cats.join('、')}（${n} 条变更）`);
      refreshSidebar();
      await refreshList();
    } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = '确定'; }
  });
}
/** 批量删除（两步确认） */
async function batchDelete() {
  if (!state.selectedIds.size) return toast('请先勾选条目', true);
  const ids = [...state.selectedIds];
  const btn = $('#ms-del');
  if (btn.dataset.c1 === '1') {
    clearTimeout(Number(btn.dataset.tm || 0));
    delete btn.dataset.c1; btn.textContent = '批量删除'; btn.classList.remove('danger');
    let n = 0;
    for (const id of ids) { try { await store.remove(id); n++; state.selectedIds.delete(id); } catch { /* 单条失败继续，保留勾选 */ } }
    toast(`已删除 ${n} 项`);
    refreshSidebar();
    await refreshList();
    msUpdateBar(); // v4.1.1：已删条目从勾选集合移除，计数不再残留
  } else {
    btn.dataset.c1 = '1'; btn.textContent = `再点一次删除（${ids.length} 项）`; btn.classList.add('danger');
    btn.dataset.tm = String(setTimeout(() => { delete btn.dataset.c1; btn.textContent = '批量删除'; btn.classList.remove('danger'); }, 3000));
  }
}

/* ---------------- 分类管理（v3.4.0）---------------- */
async function openCatManageModal() {
  const counts = await allCatCounts();
  if (!counts.size) return toast('暂无分类', true);
  const close = openOverlayModal(`
    <div class="modal-head"><h3>管理分类</h3></div>
    <div class="modal-body">
      <div class="cman-list">
        ${[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `
          <div class="cman-row" data-cat="${escapeHtml(c)}">
            <span class="cman-name">${escapeHtml(c)}</span><span class="hint">${n} 条</span>
            <span class="cman-ops">
              <button class="btn ghost small" data-cman="rename">重命名</button>
              <button class="btn ghost small" data-cman="merge">合并到…</button>
              <button class="btn ghost small danger-text" data-cman="del">删除</button>
            </span>
          </div>`).join('')}
      </div>
      <p class="hint" style="margin-top:10px">重命名/合并/删除只改条目上的分类标签，不动密码本身。</p>
    </div>
    <div class="modal-foot"><button class="btn primary" data-close>关闭</button></div>
  `);
  const applyTo = async (fn) => {
    const all = (await store.list({})).items;
    let n = 0;
    for (const it of all) {
      const next = fn(it);
      if (next === null) continue; // 未命中
      await store.update(it.id, { ...it, category: next });
      n++;
    }
    return n;
  };
  document.querySelector('.cman-list').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-cman]');
    if (!b) return;
    const row = b.closest('.cman-row');
    const cat = row.dataset.cat;
    const others = [...counts.keys()].filter((c) => c !== cat);
    if (b.dataset.c1 === '1') { /* 第二步执行 */ }
    else if (b.dataset.cman === 'del') {
      b.dataset.c1 = '1'; b.textContent = '再点一次删除'; b.classList.add('danger');
      b.dataset.tm = String(setTimeout(() => { delete b.dataset.c1; b.textContent = '删除'; b.classList.remove('danger'); }, 3000));
      return;
    }
    try {
      if (b.dataset.cman === 'rename') {
        const nn = prompt(`把分类「${cat}」重命名为：`, cat);
        if (!nn || nn.trim() === cat) return;
        const t = nn.trim();
        const conflict = (await allCatCounts()).has(t);
        if (conflict && !confirm(`已存在分类「${t}」，重命名将把两者合并为「${t}」，继续？`)) return;
        const n = await applyTo((it) => {
          const arr = PassSearch.catSplit(it.category);
          if (!arr.includes(cat)) return null;
          const merged = arr.map((c) => (c === cat ? t : c));
          return PassSearch.catJoin(merged);
        });
        toast(`已重命名「${cat}」→「${t}」（${n} 条）`);
      } else if (b.dataset.cman === 'merge') {
        if (!others.length) return toast('没有其他分类可合并', true);
        const target = prompt(`把分类「${cat}」合并到哪个分类？\n可选：${others.join('、')}`, others[0]);
        if (!target || !others.includes(target.trim())) return;
        const t = target.trim();
        const n = await applyTo((it) => {
          const arr = PassSearch.catSplit(it.category);
          if (!arr.includes(cat)) return null;
          return PassSearch.catJoin([...arr.filter((c) => c !== cat), t]);
        });
        toast(`已合并「${cat}」→「${t}」（${n} 条）`);
      } else if (b.dataset.cman === 'del') {
        clearTimeout(Number(b.dataset.tm || 0));
        delete b.dataset.c1;
        const n = await applyTo((it) => {
          const arr = PassSearch.catSplit(it.category);
          if (!arr.includes(cat)) return null;
          return PassSearch.catJoin(arr.filter((c) => c !== cat));
        });
        toast(`已删除分类「${cat}」（${n} 条摘除标签）`);
      }
      close();
      refreshSidebar();
      await refreshList();
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------------- 主页自定义排序（v3.4.2）---------------- */
const SORT_KEYS = [
  { k: 'updated', label: '修改时间', def: 'desc' },
  { k: 'category', label: '分类', def: 'asc' },
  { k: 'totp', label: '是否有 TOTP', def: 'desc' },
  { k: 'owner', label: '所属名称', def: 'asc' },
  { k: 'created', label: '创建时间', def: 'desc' },
];
function sortChipRender() {
  const chip = $('#sort-chip');
  if (!chip) return;
  const s = loadSettings();
  const key = s.sortKey || 'updated';
  const order = s.sortOrder || (SORT_KEYS.find((x) => x.k === key) || SORT_KEYS[0]).def;
  const custom = key !== 'updated' || order !== 'desc';
  $('#btn-sort')?.classList.toggle('active', custom);
  chip.classList.toggle('hidden', !custom);
  if (!custom) return;
  const kl = (SORT_KEYS.find((x) => x.k === key) || {}).label || key;
  const arrow = order === 'asc' ? '↑' : '↓';
  chip.innerHTML = `排序: ${escapeHtml(kl)} ${arrow}<button id="sort-clear" title="恢复默认排序">×</button>`;
  $('#sort-clear').addEventListener('click', () => {
    saveSettings({ ...loadSettings(), sortKey: 'updated', sortOrder: 'desc' });
    refreshList();
  });
}
function openSortPanel() {
  const s = loadSettings();
  let key = s.sortKey || 'updated';
  let order = s.sortOrder || (SORT_KEYS.find((x) => x.k === key) || SORT_KEYS[0]).def;
  openOverlayModal(`
    <div class="modal-head"><h3>列表排序</h3></div>
    <div class="modal-body">
      <div class="field"><span>排序键</span>
        <div class="chk-group" id="sort-key-group">
          ${SORT_KEYS.map((x) => `<label><input type="radio" name="sortkey" value="${x.k}" ${key === x.k ? 'checked' : ''} /> ${x.label}</label>`).join('')}
        </div>
      </div>
      <div class="field"><span>顺序</span>
        <div class="chk-group">
          <label><input type="radio" name="sortord" value="asc" ${order === 'asc' ? 'checked' : ''} /> 正序</label>
          <label><input type="radio" name="sortord" value="desc" ${order === 'desc' ? 'checked' : ''} /> 倒序</label>
        </div>
        <p class="hint" id="sort-def-hint" style="margin-top:6px"></p>
      </div>
      <p class="hint">收藏条目始终置顶，本设置只影响其后的排序。</p>
    </div>
    <div class="modal-foot"><button class="btn primary" data-close>我知道了</button></div>
  `);
  const hint = $('#sort-def-hint');
  const updHint = () => { const x = SORT_KEYS.find((y) => y.k === key) || SORT_KEYS[0]; hint.textContent = `${x.label}默认${x.def === 'asc' ? '正序' : '倒序'}。`; };
  updHint();
  document.querySelectorAll('#sort-key-group input').forEach((r) => r.addEventListener('change', () => {
    key = r.value;
    order = (SORT_KEYS.find((x) => x.k === key) || SORT_KEYS[0]).def; // 切键取合理默认顺序
    document.querySelector('input[name="sortord"][value="asc"]').checked = order === 'asc';
    document.querySelector('input[name="sortord"][value="desc"]').checked = order === 'desc';
    updHint();
    saveSettings({ ...loadSettings(), sortKey: key, sortOrder: order });
    refreshList();
  }));
  document.querySelectorAll('input[name="sortord"]').forEach((r) => r.addEventListener('change', () => {
    order = r.value;
    saveSettings({ ...loadSettings(), sortKey: key, sortOrder: order });
    refreshList();
  }));
}

/* ---------------- 漏斗筛选（v3.4.0）---------------- */
function filterChipRender() {
  const chip = $('#filter-chip');
  if (!chip) return;
  const on = state.filterCats && state.filterCats.length;
  $('#btn-filter')?.classList.toggle('active', !!on);
  chip.classList.toggle('hidden', !on);
  if (!on) return;
  const modeTxt = state.filterMode === 'all' ? '全部' : state.filterMode === 'exclude' ? '排除' : '任一';
  chip.innerHTML = `分类: ${escapeHtml(state.filterCats.join(', '))}（${modeTxt}）<button id="filter-clear" title="清除筛选">×</button>`;
  $('#filter-clear').addEventListener('click', () => {
    state.filterCats = [];
    state.filterMode = 'any';
    filterChipRender();
    refreshList();
  });
}
function openFilterPanel() {
  const counts = allCatCounts();
  counts.then((m) => {
    const cats = [...m.keys()];
    const close = openOverlayModal(`
      <div class="modal-head"><h3>分类筛选</h3></div>
      <div class="modal-body">
        ${cats.length ? `<div class="bcat-list">${cats.sort((a, b) => m.get(b) - m.get(a)).map((c) => `
          <label class="bcat-row"><input type="checkbox" value="${escapeHtml(c)}" ${state.filterCats.includes(c) ? 'checked' : ''} /> ${escapeHtml(c)} <span class="hint">（${m.get(c)} 条）</span></label>`).join('')}</div>` : '<p class="hint">暂无分类。</p>'}
        <div class="field" style="margin-top:12px"><span>匹配模式</span>
          <div class="chk-group">
            <label><input type="radio" name="fmode" value="any" ${state.filterMode === 'any' ? 'checked' : ''} /> 包含任一</label>
            <label><input type="radio" name="fmode" value="all" ${state.filterMode === 'all' ? 'checked' : ''} /> 包含全部</label>
            <label><input type="radio" name="fmode" value="exclude" ${state.filterMode === 'exclude' ? 'checked' : ''} /> 排除所选</label>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="filter-reset">清空</button>
        <button class="btn primary" data-close>取消</button>
        <button class="btn primary" id="filter-ok">应用</button>
      </div>
    `);
    $('#filter-reset').addEventListener('click', () => {
      state.filterCats = []; state.filterMode = 'any';
      filterChipRender(); refreshList(); close();
    });
    $('#filter-ok').addEventListener('click', () => {
      state.filterCats = [...document.querySelectorAll('.bcat-row input:checked')].map((i) => i.value);
      const r = document.querySelector('input[name="fmode"]:checked');
      state.filterMode = r ? r.value : 'any';
      filterChipRender(); refreshList(); close();
    });
  });
}

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

/* ---------------- 分类侧栏（v2.7.0，替代旧分类 chips） ---------------- */
async function refreshChips() { return refreshSidebar(); } // 旧调用点兼容

let _favCount = 0, _allCount = null, _favCatCounts = {}; // v3.3.5：全部计数独立统计；v3.3.6：收藏上下文的分类计数（二级筛选）
async function refreshSidebar() {
  // v3.4.0：分类列表与计数改由 catSplit 统计（多分类条目在每个分类下都计数）
  state.categories = [];
  _favCatCounts = {};
  const allCatMap = new Map();
  try {
    const rf = await store.list({ favOnly: true });
    _favCount = rf.items.length;
    rf.items.forEach((it) => { for (const k of PassSearch.catSplit(it.category)) _favCatCounts[k] = (_favCatCounts[k] || 0) + 1; });
  } catch { _favCount = 0; }
  try {
    const ra = await store.list({});
    _allCount = (ra.total != null) ? ra.total : ra.items.length;
    for (const it of ra.items) for (const c of PassSearch.catSplit(it.category)) allCatMap.set(c, (allCatMap.get(c) || 0) + 1);
  } catch { /* 保留旧值 */ }
  state.categories = [...allCatMap.keys()];
  const cats = [...allCatMap.entries()].sort((a, b) => b[1] - a[1]);
  const box = $('#sidebar-nav');
  if (!box) return;
  const allActive = state.category === '' && !state.favOnly;
  box.innerHTML = `
    <button class="side-item ${allActive ? 'active' : ''}" data-side="all"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg><span>全部</span><em>${_allCount ?? ''}</em></button>
    <button class="side-item ${state.favOnly ? 'active' : ''}" data-side="fav">${ICONS.starFill}<span>收藏</span><em>${_favCount || ''}</em></button>
    <div class="side-sep"></div>
    ${cats.map(([c, n]) => `<button class="side-item ${state.category === c ? 'active' : ''}" data-side="cat" data-cat="${escapeHtml(c)}"><span class="side-dot" style="background:hsl(${avatarHue(c)} 60% 55%)"></span><span class="side-name" title="${escapeHtml(c)}">${escapeHtml(c)}</span><em>${state.favOnly ? (_favCatCounts[c] || 0) : n}</em></button>`).join('')}
    ${cats.length ? `<div class="side-sep"></div>
    <button class="side-item" data-side="manage" id="btn-cat-manage"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>管理分类</span></button>` : ''}
  `;
  $('#btn-cat-manage')?.addEventListener('click', openCatManageModal);
}
$('#sidebar-nav')?.addEventListener('click', (e) => {
  const item = e.target.closest('[data-side]');
  if (!item) return;
  const side = item.dataset.side;
  if (side === 'manage') return; // v3.4.0：管理分类按钮有自己的监听
  if (side === 'all') { state.category = ''; state.favOnly = false; }
  else if (side === 'fav') { state.category = ''; state.favOnly = true; }
  else { state.category = item.dataset.cat || ''; /* v3.3.6：保持 favOnly——收藏模式下点分类=收藏∩分类（二级筛选） */ }
  refreshSidebar();
  refreshList();
  closeSidebarDrawer(); // 手机端选择后收起抽屉
});

/* 手机端抽屉开合（v2.7.0） */
function openSidebarDrawer() {
  document.body.classList.add('side-open');
}
function closeSidebarDrawer() {
  document.body.classList.remove('side-open');
}
$('#btn-side-menu')?.addEventListener('click', () => {
  document.body.classList.contains('side-open') ? closeSidebarDrawer() : openSidebarDrawer();
});
$('#side-mask')?.addEventListener('click', closeSidebarDrawer);

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
// v3.4.0：多选 + 漏斗 + 分类管理
$('#btn-multiselect')?.addEventListener('click', () => (state.multiSelect ? msExit() : msEnter()));
$('#ms-select-all')?.addEventListener('click', () => {
  const ids = msCurrentIds();
  const allOn = ids.length && ids.every((i) => state.selectedIds.has(i));
  if (allOn) { for (const i of ids) state.selectedIds.delete(i); }
  else { for (const i of ids) state.selectedIds.add(i); } // v4.1.1：并入而非清空重置——跨搜索条件的已有勾选保留
  refreshList();
  msUpdateBar();
});
$('#ms-add-cat')?.addEventListener('click', () => openBatchCatModal('add'));
$('#ms-remove-cat')?.addEventListener('click', () => openBatchCatModal('remove'));
$('#ms-del')?.addEventListener('click', batchDelete);
$('#ms-exit')?.addEventListener('click', msExit);
$('#btn-filter')?.addEventListener('click', openFilterPanel);
$('#btn-cat-manage')?.addEventListener('click', openCatManageModal);
$('#btn-sort')?.addEventListener('click', openSortPanel);
// v3.4.3：⋯ 溢出菜单已随三排布局移除（按钮平铺，无需开关逻辑）
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
      if (IS_TAURI && IS_ANDROID && window.__passbook_saf) {
        await androidSafSave(bytes, name); // SAF 系统另存为（v3.0.5）
        toast('已保存');
      } else if (IS_TAURI) {
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
      <label class="field"><span>密码 *<button class="hint-btn" type="button" data-hint="gen" title="生成器说明"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></button></span>
        <div class="pw-input-row">
          <input id="f-password" type="text" value="${escapeHtml(v('password') || prefillPw)}" autocomplete="off" />
          <button class="btn" id="btn-gen-again" title="用当前生成器设置重新生成">${ICONS.wand}</button>
        </div>
      </label>
      <label class="field"><span>动态验证码 TOTP（可选）<button class="btn totp-scan-btn" type="button" data-totp-scan="1" title="扫码获取 TOTP"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg></button><button class="hint-btn" type="button" data-hint="totp" title="TOTP 使用说明"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></button></span>
        <input id="f-totp" placeholder="base32 密钥或 otpauth:// 链接，粘贴自动提取" value="${escapeHtml(v('totp_secret'))}" autocomplete="off" spellcheck="false" />
      </label>
      <div class="form-row">
        <label class="field"><span>分类（可选）</span>
          <input id="f-category" placeholder="如：工作, 个人（可多分类，逗号分隔）" value="${escapeHtml(v('category'))}" />
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

  // 自动补全（v3.0.8 改自绘联想，替代 datalist——安卓 WebView datalist 遮挡输入框）
  (async () => {
    const all = await store.list({});
    const so = new Set(), sa = new Set(), sc = new Set();
    // v3.4.0：分类建议源按 catSplit 拆分去重（多分类条目贡献多个候选）
    for (const x of all.items) { if (x.owner) so.add(x.owner); if (x.account) sa.add(x.account); for (const c of PassSearch.catSplit(x.category)) sc.add(c); }
    attachSuggest($('#f-owner'), () => [...so]);
    attachSuggest($('#f-account'), () => [...sa]);
    attachSuggest($('#f-category'), () => [...sc]);
    // v3.3.2：编辑弹窗同样支持预置所属联想（徽章 + 网址为空时自动填）
    (() => {
      const presetNames = (window.PB_PRESETS || []).flatMap((p) => [p.name, ...(p.aliases || [])]);
      const presetBadge = new Set(presetNames);
      attachSuggest($('#f-owner'), () => {
        const seen = new Set();
        return [...presetNames, ...so].filter((x) => {
          const k = String(x).toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      }, {
        badge: presetBadge,
        onPick: (v) => {
          const p = window.pbPresetMatch ? window.pbPresetMatch(v) : null;
          const urlEl = $('#f-url');
          if (p && urlEl && !urlEl.value.trim()) {
            urlEl.value = 'https://' + p.domain;
            toast('已填入 ' + p.name + ' 网址');
          }
        },
      });
    })();
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

  // 重新生成：二级确认（v3.0.3）——密码框非空时，第一次点击进入"确认?"状态，2.6 秒内再点才覆盖；空框直接生成
  $('#btn-gen-again')?.addEventListener('click', (ev) => {
    const btn = ev.currentTarget;
    const RESET = () => { delete btn.dataset.confirm; btn.innerHTML = ICONS.wand; btn.classList.remove('danger'); btn.title = '用当前生成器设置重新生成'; }; // v3.3.8：还原魔法棒（v3.3.4 换图标时漏改此处）
    const doGen = () => {
      try {
        const o = genOptsFromUi();
        const pw = PassGen.generate(o);
        $('#f-password').value = pw;
        state.currentGenPw = pw;
        toast('已生成新密码');
      } catch (e) { toast(e.message, true); }
    };
    if (!$('#f-password').value) { doGen(); return; } // 空框：首次生成无需确认
    if (btn.dataset.confirm === '1') { clearTimeout(Number(btn.dataset.tm || 0)); doGen(); RESET(); return; }
    btn.dataset.confirm = '1';
    btn.innerHTML = '确认?';
    btn.classList.add('danger');
    btn.title = '再点一次覆盖当前密码';
    btn.dataset.tm = String(setTimeout(RESET, 2600));
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
  $('#btn-save').addEventListener('click', async (ev) => {
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
    // v3.3.8：覆盖已有 TOTP 需二次确认（两步模式，参照重新生成按钮）——旧密钥非空
    // 且新密钥不同时，第一次点击进入确认态，窗口内再点才真正覆盖保存。
    // v3.3.9：不再弹 toast——toast 会遮挡弹窗底部 删除/取消/保存 按钮；
    // 按钮变红改文案本身就是反馈，确认窗放宽到 4 秒
    const btn = ev.currentTarget;
    if (!isNew && item.totp_secret && entry.totp_secret && entry.totp_secret !== item.totp_secret) {
      if (btn.dataset.tconfirm !== '1') {
        btn.dataset.tconfirm = '1';
        const old = btn.textContent;
        btn.dataset.oldTxt = old;
        btn.textContent = '再点一次覆盖 TOTP';
        btn.classList.add('danger');
        btn.dataset.tm = String(setTimeout(() => { delete btn.dataset.tconfirm; btn.textContent = old; btn.classList.remove('danger'); }, 4000));
        return;
      }
      clearTimeout(Number(btn.dataset.tm || 0));
      delete btn.dataset.tconfirm;
      btn.textContent = btn.dataset.oldTxt || '保存';
      btn.classList.remove('danger');
    }
    try {
      if (isNew) await store.create(entry);
      else await store.update(item.id, entry);
      closeModal();
      toast('已保存');
      refreshChips();
      await refreshList();
      // v3.3.1：仅新建或网址字段变更时才请求图标（3 连试），其余渲染零网络
      const d = pbDomainOf(entry.url);
      if (d && (isNew || (item.url || '') !== entry.url)) { faviconDemand.add(d); hydrateFavicons('fetch-missing'); }
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
        <div style="display:flex;justify-content:flex-end;margin-bottom:4px">
          <button class="btn totp-scan-btn" id="mf-scan-fill" type="button" title="扫码自动填写（迁移码/分享卡片/TOTP/网址/文本）"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg> 扫码填写</button>
        </div>
      <label class="field"><span>所属（应用 / 网站）*</span>
        <input id="mf-owner" placeholder="如：GitHub、微信、网银…" autocomplete="off" />
        <datalist id="dl-mf-owner"></datalist>
      </label>
      <label class="field"><span>账户（用户名 / 邮箱 / 手机号）*</span>
        <input id="mf-account" placeholder="如：user@example.com" autocomplete="off" />
        <datalist id="dl-mf-account"></datalist>
      </label>
      <label class="field"><span>密码 *<button class="hint-btn" type="button" data-hint="gen" title="生成器说明"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></button></span>
        <div class="pw-input-row">
          <input id="mf-password" type="text" autocomplete="off" placeholder="手动输入，或点右侧按钮生成" />
          <button class="btn" id="mf-gen" title="用当前生成器设置生成">${ICONS.wand}</button>
        </div>
      </label>
      <label class="field"><span>动态验证码 TOTP（可选）<button class="btn totp-scan-btn" type="button" data-totp-scan="1" title="扫码获取 TOTP"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg></button><button class="hint-btn" type="button" data-hint="totp" title="TOTP 使用说明"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></button></span>
        <input id="mf-totp" placeholder="base32 密钥或 otpauth:// 链接，粘贴自动提取" autocomplete="off" spellcheck="false" />
      </label>
      <div class="form-row">
        <label class="field"><span>分类（可选）</span>
          <input id="mf-category" placeholder="如：工作, 个人（可多分类，逗号分隔）" />
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

  // 自动补全（v3.0.8 改自绘联想，替代 datalist——安卓 WebView datalist 遮挡输入框；
  // 仅当用户输入非空时才出现列表，行为与编辑弹窗一致）
  (async () => {
    const all = await store.list({});
    const so = new Set(), sa = new Set(), sc = new Set();
    for (const x of all.items) { if (x.owner) so.add(x.owner); if (x.account) sa.add(x.account); for (const c of PassSearch.catSplit(x.category)) sc.add(c); }
    attachSuggest($('#mf-owner'), () => [...so]);
    attachSuggest($('#mf-account'), () => [...sa]);
    attachSuggest($('#mf-category'), () => [...sc]);
    // v3.3.0：预置所属库——PB_PRESETS 名称/别名排最前并带「预置」徽章；
    // 选中命中预置且 mf-url 为空时自动填 https://{domain}（不覆盖已有内容）
    const presetNames = (window.PB_PRESETS || []).flatMap((p) => [p.name, ...(p.aliases || [])]);
    const presetBadge = new Set(presetNames);
    attachSuggest($('#mf-owner'), () => {
      const seen = new Set();
      return [...presetNames, ...so].filter((x) => {
        const k = String(x).toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }, {
      badge: presetBadge,
      onPick: (v) => {
        const p = window.pbPresetMatch ? window.pbPresetMatch(v) : null;
        const urlEl = $('#mf-url');
        if (p && urlEl && !urlEl.value.trim()) {
          urlEl.value = 'https://' + p.domain;
          toast('已填入 ' + p.name + ' 网址');
        }
      },
    });
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
      await refreshList();
      const dmf = pbDomainOf(entry.url);
      if (dmf) { faviconDemand.add(dmf); hydrateFavicons('fetch-missing'); } // v3.3.1：新条目才请求图标（3 连试）
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
        <button class="btn" data-tab="scan">扫码导入</button>
        <button class="btn" data-tab="browser">浏览器导入</button>
      </div>
      <div id="tab-paste">
        <label class="field"><span>每行一条：所属,账户,密码[,网址][,备注]（也支持 所属/账户/密码 或 所属 账户 密码）</span>
          <textarea id="import-paste" placeholder="微信,13800000000,P@ssw0rd1&#10;GitHub,user@example.com,Abc12345&#10;网银/张三/XyZ!6789"></textarea>
        </label>
      </div>
      <div id="tab-scan" class="hidden">
        <p class="hint">连续扫描多张二维码：迁移码 / 分享卡片将逐条直接入库（其他类型提示跳过），完成后显示汇总。</p>
        <button class="btn primary" id="scan-import-start" type="button">开始扫码</button>
        <div id="scan-import-count" class="hint" style="margin-top:8px"></div>
      </div>
      <div id="tab-file" class="hidden">
        <label class="file-drop" id="file-drop">
          <div class="file-drop-main">${('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0) ? '选择文件' : '点击选择或拖入文件'}</div>
          <div class="hint">支持 .csv / .json / .txt / .db（SQLite 数据库文件）</div>
        </label>
        <input type="file" id="file-input" class="hidden" accept=".csv,.json,.txt,.db" />
        <div id="file-info" class="hint"></div>
      </div>
      <div id="tab-browser" class="hidden">
        <p class="hint">Edge / Chrome / Firefox「导出密码」得到的 CSV 一键导入：表头自动识别，无需手动整理列序。</p>
        <label class="file-drop" id="browser-drop">
          <div class="file-drop-main">${('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0) ? '选择 CSV 文件' : '点击选择或拖入 CSV 文件'}</div>
          <div class="hint">浏览器「设置 → 密码 → 导出密码」生成的 .csv 明文文件</div>
        </label>
        <input type="file" id="browser-input" class="hidden" accept=".csv" />
        <div id="browser-info" class="hint"></div>
        <div id="browser-preview-wrap" class="hidden">
          <span class="hint">解析预览</span>
          <div class="import-preview" id="browser-preview"></div>
          <div id="browser-dup-strategy" class="hidden">
            <span class="hint">去重策略（同网址+账户判重）</span>
            <label class="radio-row"><input type="radio" name="browser-dup-mode" value="skip" checked> 跳过重复条目</label>
            <label class="radio-row"><input type="radio" name="browser-dup-mode" value="keep"> 仍导入（保留重复）</label>
          </div>
        </div>
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
    $('#tab-scan').classList.toggle('hidden', tab !== 'scan'); // v4.0.3：漏了这行——扫码 tab 内容从未显示过
    $('#tab-browser').classList.toggle('hidden', tab !== 'browser'); // v4.1.0：浏览器导入 tab
    $('#import-mode-wrap').classList.toggle('hidden', tab === 'browser'); // 浏览器导入固定合并模式（去重策略独立单选）
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
        if (!picked || !picked.b64) return;
        const name = picked.name || '';
        const pickedBytes = base64ToBytes(picked.b64); // v4.1.1：Rust 返回 b64
        importFileCache = { name };
        const isDb = name.toLowerCase().endsWith('.db');
        if (isDb) {
          importFileCache.bytes = pickedBytes;
          await handleImportBytes(importFileCache.bytes, 'db');
        } else {
          importFileCache.text = new TextDecoder().decode(pickedBytes);
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
    // v4.1.0：浏览器导入 tab——独立管线（去重策略单选 + 明文删除提醒）
    if (!$('#tab-browser').classList.contains('hidden')) {
      const r = browserImportCache && browserImportCache.result;
      if (!r || !r.ok || !r.rows.length) return toast('请先选择浏览器导出的 CSV 文件', true);
      const keepDup = (document.querySelector('input[name="browser-dup-mode"]:checked') || {}).value === 'keep';
      const rows = keepDup ? r.rows : r.rows.filter((x) => !x._dup);
      if (!rows.length) return toast(`${r.dupCount} 条全部为重复（同网址+账户），无新增`, true);
      try {
        const res = await store.importItems(rows, 'merge');
        closeModal();
        toast(`导入完成：新增 ${res.imported} 条${res.skipped ? `，跳过完全相同 ${res.skipped} 条` : ''}。浏览器导出的 CSV 是明文文件，导入后请及时删除原文件`);
        hydrateFavicons('fetch-missing'); // 导入完成才请求缺失图标（3 连试）
        refreshChips();
        refreshList();
      } catch (e) { toast(e.message, true); }
      return;
    }
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
    hydrateFavicons('fetch-missing'); // v3.3.1 导入完成才请求缺失图标（3 连试）
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

/* ---------------- 浏览器一键导入（v4.1.0） ---------------- */
let browserImportCache = null; // { name, result: PassImporter.parseBrowserCsv 结果 }

async function browserPickFile() {
  if (IS_TAURI) {
    // 桌面/Android：WebView 内文件选择不稳，走 Rust 系统对话框（复用 pick_import_db 通道）
    try {
      const picked = await tauriInvoke('pick_import_db');
      if (!picked || !picked.b64) return;
      const text = new TextDecoder().decode(base64ToBytes(picked.b64)); // v4.1.1：Rust 返回 b64
      browserImportParse(picked.name || '浏览器导出.csv', text);
    } catch (e) { toast(e.message, true); }
  } else {
    const inp = document.getElementById('browser-input');
    if (inp) inp.click();
  }
}

async function browserImportHandleFile(file) {
  try { browserImportParse(file.name, await file.text()); }
  catch (e) { toast('读取文件失败：' + (e && e.message ? e.message : ''), true); }
}

async function browserImportParse(name, text) {
  let existing = [];
  try { existing = (await store.list({})).items || []; } catch { /* 判重降级为仅文件内部 */ }
  const r = PassImporter.parseBrowserCsv(text, existing);
  const info = document.getElementById('browser-info');
  if (!info) { browserImportCache = null; return; } // 弹窗已关
  browserImportCache = { name, result: r };
  const wrap = document.getElementById('browser-preview-wrap');
  if (!r.ok) {
    browserImportCache = null;
    info.textContent = `无法识别「${name}」：${r.error}`;
    if (wrap) wrap.classList.add('hidden');
    return;
  }
  info.textContent = `${name} · ${(text.length / 1024).toFixed(1)} KB`;
  if (wrap) wrap.classList.remove('hidden');
  const pv = document.getElementById('browser-preview');
  if (pv) pv.textContent =
    `识别为 ${r.formatLabel} 格式 / 共 ${r.total} 条` +
    (r.skippedEmpty ? `（另有 ${r.skippedEmpty} 条空密码已跳过）` : '') +
    (r.dupCount ? ` / ${r.dupCount} 条重复（同网址+账户）` : '') +
    '\n' + r.rows.slice(0, 12).map((row) => `${row.owner || row.url} | ${row.account} | ${'*'.repeat((row.password || '').length)}`).join('\n') +
    (r.rows.length > 12 ? `\n… 共 ${r.rows.length} 条` : '');
  const strat = document.getElementById('browser-dup-strategy');
  if (strat) strat.classList.toggle('hidden', !r.dupCount); // 无重复时不展示策略
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
        <div class="export-item">
          <div><div class="t">文件仓导出（zip）</div><div class="d">加密本体 + 清单打包（.db 导出不含文件本体）；zip 内本体保持加密，导入端需同密钥</div></div>
          <button class="btn" id="btn-export-files">导出</button>
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
      if (blob && blob.safSaved) { toast('数据库已另存'); }
      else if (blob && blob.tauriPath) {
        toast('数据库文件已导出：' + blob.tauriPath);
      } else if (blob) {
        downloadBlob(blob, 'passwords.db');
        toast('数据库文件已下载');
      } else {
        toast('已取消导出');
      }
    } catch (e) { toast(e.message, true); }
  });
  $('#btn-export-files')?.addEventListener('click', async () => {
    try {
      await vaultExportZip();
    } catch (e) { toast(e.message, true); }
  });
  $('#btn-export-json').addEventListener('click', async () => {
    try {
      const saved = await store.exportJsonToFile && await store.exportJsonToFile();
      if (saved && saved.safSaved) {
        toast('JSON 备份已保存');
        return;
      }
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
  if (!(blob instanceof Blob)) blob = new Blob([blob]); // v3.0.5：防御非 Blob 入参（曾致 createObjectURL 报错）
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Android SAF 另存为（v3.0.5）：字节先写缓存临时文件（Rust saf_temp_write），
 *  再拉起系统「创建文档」界面由用户选位置，SafSaveActivity 流式拷贝到位。
 *  resolve(true) 成功；取消/失败 reject。仅 Android Tauri 环境可用。 */
function androidSafSave(bytes, name) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!window.__passbook_saf) throw new Error('此环境不支持系统另存为');
      const arr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes;
      const tempPath = await tauriInvoke('saf_temp_write', { bytes: arr });
      let done = false;
      const finish = (ok, err) => { if (done) return; done = true; clearInterval(iv); ok ? resolve(true) : reject(new Error(err || '已取消')); };
      const t0 = Date.now();
      const iv = setInterval(() => {
        let r = 'pending';
        try { r = window.__passbook_saf.result(); } catch { /* 忽略 */ }
        if (r === 'true') finish(true);
        else if (r.startsWith('false:')) finish(false, r.slice(6));
        else if (Date.now() - t0 > 300000) finish(false, '保存超时');
      }, 400);
      window.__passbookSafResult = (ok) => finish(ok); // evaluateJavascript 快路径
      window.__passbook_saf.save(name, tempPath);
    } catch (e) { reject(e); }
  });
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
// 体检结果图标：与应用一致的线性 SVG（24 viewBox / stroke 1.8 / round），随级别着色（v3.0.1）
const WT_SVG = (paths) => `<svg class="wt-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const WT_TYPE_ICON = {
  reused: WT_SVG('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  weak: WT_SVG('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'),
  incomplete: WT_SVG('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h4"/>'),
  stale: WT_SVG('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  pwned: WT_SVG('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
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
    ? '<span class="wt-allclear"><svg class="wt-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg> 未发现问题，继续保持</span>'
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
  // 预置渠道（v2.6.1）：agent-config.local.js 可给 AGENT_DEFAULTS.presets 数组（不入库、纯净版无）
  const presets = (typeof window !== 'undefined' && window.AGENT_DEFAULTS && Array.isArray(window.AGENT_DEFAULTS.presets)) ? window.AGENT_DEFAULTS.presets : [];
  const presetField = presets.length ? `
      <div class="field"><span>预置渠道（一键填入）</span>
        <select id="set-agent-preset">
          ${presets.map((p, i) => `<option value="${i}">${escapeHtml(p.name || `渠道${i + 1}`)}${p.model ? ' · ' + escapeHtml(p.model) : ''}</option>`).join('')}
        </select>
      </div>` : '';
  const agentField = `${presetField}
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
        <div class="lock-toggle"><span class="lock-state" id="enc-state">检测中…</span><button class="hint-btn" type="button" data-hint="enc" title="数据库加密说明"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></button></div>
        <div id="enc-actions" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"></div>
        <p class="hint">密钥由应用自动生成并仅保存在本机，启动时自动解密、使用无感。<b style="color:var(--danger)">请务必点击「备份密钥」保存密钥文本</b>，丢失或更换设备导入加密 .db 时都需要它。</p>
      </div>` : `
      <div class="field"><span>数据库加密</span>
        <p class="hint">服务器存储模式的数据库由服务端管理，暂不支持应用内加密；重要数据请用「导出」定期备份。</p>
      </div>`;
  const bk = { ...DEFAULT_SETTINGS.backup, ...(s.backup || {}) };
  // 站点图标（v2.7.0）：默认关；开启后经 DuckDuckGo 图标服务联网加载
  const faviconField = `
      <div class="field"><span>站点图标（列表卡片左侧）</span>
        <div class="chk-group" style="padding-top:2px">
          <label><input type="checkbox" id="set-favicons" ${s.favicons ? 'checked' : ''} /> 显示网站 favicon（联网：优先向站点本身请求 /favicon.ico，免代理可达；失败时尝试 DuckDuckGo 图标服务（需代理）；都失败用首字头像）</label>
          <div style="margin-top:6px"><button class="btn" id="btn-favicon-refresh" type="button" style="padding:6px 12px;font-size:12.5px">↻ 重试加载全部图标</button><span class="hint" style="margin-left:8px">跳过缓存重新请求（图标未显示/异常时用）</span></div>
        </div>
      </div>`;
  // v4.3.0：桌面随手记全局快捷键
  const quickNoteField = (IS_TAURI && !IS_ANDROID) ? `
      <div class="field"><span>随手记全局快捷键（读取剪贴板 → 确认后存为便签）</span>
        <input id="set-quicknote-key" type="text" placeholder="如 Ctrl+Alt+N" value="${escapeHtml(s.quickNoteShortcut || 'Ctrl+Alt+N')}" />
        <p class="hint">修改保存后生效；格式如 Ctrl+Alt+N / CommandOrControl+Shift+N。</p>
      </div>` : '';
  const backupField = currentMode === 'local' ? `
      <div class="field"><span>自动备份快照（${IS_TAURI ? '存于应用数据目录 backups\\' : '存于本机浏览器存储'}，加密库快照保持密文）<button class="hint-btn" type="button" data-hint="snap" title="自动备份快照说明"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></button></span>
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
      ${faviconField}
      ${quickNoteField}
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
  $('#set-agent-preset')?.addEventListener('change', (e) => {
    const p = presets[Number(e.target.value)];
    if (!p) return;
    $('#set-agent-url').value = p.baseUrl || '';
    $('#set-agent-model').value = p.model || '';
    $('#set-agent-key').value = p.apiKey || '';
    toast(`已填入预置渠道「${p.name || ''}」，保存后生效`);
  });
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
    ns.favicons = !!$('#set-favicons')?.checked; // 站点图标（v2.7.0）
    const qnEl = $('#set-quicknote-key'); // v4.3.0：随手记全局快捷键（桌面）
    if (qnEl && qnEl.value.trim()) {
      ns.quickNoteShortcut = qnEl.value.trim();
      if (IS_TAURI && !IS_ANDROID) {
        tauriInvoke('set_quicknote_shortcut', { accel: ns.quickNoteShortcut })
          .then(() => toast('全局快捷键已更新'))
          .catch((err) => toast('快捷键注册失败: ' + err, true));
      }
    }
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
            await tauriWriteDb(path, bytes); // v4.1.1：base64 IPC
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
  // v3.0.7：幂等单例——生物识别往返会触发自动锁定再弹一层锁，多层叠加导致
  // "解锁了却还在锁页、PIN 也要输多次"的假象；已有锁页则直接复用，不再叠加
  if (document.querySelector('.lock-mask')) return;
  const mask = document.createElement('div');
  mask.className = 'modal-mask lock-mask';
  mask.style.zIndex = '800'; // v3.0.12：锁页始终最顶层（侧栏60/弹窗500/联想600）
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
  // v3.0.5：元素引用收敛到 mask 作用域（生物识别往返后全局 id 查询可能失效），并加空值防护
  const pinEl = () => mask.querySelector('#lock-pin');
  const errEl = () => mask.querySelector('#lock-err');
  const tryUnlock = async () => {
    if (unlocked || !document.body.contains(mask)) return;
    const el = pinEl();
    if (!el) return;
    const hash = await sha256(el.value);
    if (hash === s.pinHash) {
      unlocked = true;
      document.querySelectorAll('.lock-mask').forEach((m) => m.remove()); // v3.0.7：清掉所有锁层
    } else if (errEl()) {
      errEl().textContent = 'PIN 错误';
    }
  };
  $('#lock-bio')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true; // 防重复拉起
    let ok = false;
    try { ok = await Bio.prompt('解锁密码本'); } catch { ok = false; }
    btn.disabled = false;
    if (unlocked || !document.body.contains(mask)) return;
    if (ok) {
      unlocked = true;
      document.querySelectorAll('.lock-mask').forEach((m) => m.remove()); // v3.0.7：清掉所有锁层
    } else if (errEl()) errEl().textContent = '生物识别未通过，请输入 PIN';
    pinEl()?.focus();
  });
  mask.querySelector('#lock-go')?.addEventListener('click', tryUnlock);
  pinEl()?.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  pinEl()?.focus();
}

/* ---------------- 搜索 / 排序 ---------------- */
$('#search').addEventListener('input', debounce((e) => {
  state.q = e.target.value.trim();
  refreshList();
}, 200));
// v3.4.2 规格修正：旧排序下拉（#sort）已删除，排序唯一入口=新排序面板。
// 服务端拉取键由 sortKey 派生（category/totp 无对应服务端键，回落 updated）
(function deriveSort() {
  const s = loadSettings();
  if (!s.sortKey && s.sort) {
    // 旧持久化值迁移：updated/created/owner → 对应新键 + 合理默认顺序
    const map = { updated: ['updated', 'desc'], created: ['created', 'desc'], owner: ['owner', 'asc'] };
    const m = map[s.sort] || map.updated;
    saveSettings({ ...s, sortKey: m[0], sortOrder: m[1] });
  }
})();
function serverSortKey() {
  const k = loadSettings().sortKey || 'updated';
  return k === 'created' || k === 'owner' ? k : 'updated';
}

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
      await tauriWriteDb(dir + '\\' + name, bytes); // v4.1.1：base64 IPC
      return;
    }
    await idbSet(PassBackup.idbKey(name), bytes);
  },
  /** 读取快照字节 */
  async read(name) {
    if (IS_TAURI) {
      const dir = await this.dir();
      const b = await tauriReadDb(dir + '\\' + name); // v4.1.1：base64 IPC
      return b && b.length ? b : null;
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
        ${x.totp_secret ? `<div class="entry-totp"><code class="totp-code" data-totp="${escapeHtml(x.totp_secret)}">······</code><span class="totp-remain"></span><button class="btn-icon" data-act="copy-totp" title="复制验证码">${ICONS.copy}</button></div>` : ''}
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
    } else if (btn.dataset.act === 'copy-totp') {
      const el = row.querySelector('.totp-code');
      if (!el) return;
      try { const { code } = await PassTotp.generateTotp(el.dataset.totp); await copyText(code); } catch (err) { toast(err.message, true); }
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

  // v2.6.1: 兜底渠道 —— 主渠道失败时自动切 AGENT_DEFAULTS.fallback 重试一次
  const fbCfg = (typeof window !== 'undefined' && window.AGENT_DEFAULTS?.fallback) || null;
  const mk = (c) => {
    const headers = { 'Content-Type': 'application/json' };
    if (c.apiKey) headers.Authorization = 'Bearer ' + c.apiKey;
    return { url: c.baseUrl.replace(/\/+$/, '') + '/chat/completions', headers, model: c.model };
  };
  const run = async (c) => {
    const { url, headers, model } = mk(c);
    return await AgentCore.chatStream({
    messages: agentState.messages,
    channelFetch: (u, o, onChunk) => agentFetchStream(u, o, onChunk),
    url,
    headers,
    model,
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
  };
  try {
    return await run(cfg);
  } catch (e) {
    if (!fbCfg || fbCfg.baseUrl === cfg.baseUrl || signal?.aborted) throw e;
    toast('主渠道不可用，已切换兜底渠道重试', true);
    return await run(fbCfg);
  }
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
/* ---------------- 随手记 + 三标签页（v4.3.0） ---------------- */
const VIEW_KEYS = ['pass', 'notes', 'files'];
const VIEW_LS_KEY = 'passbook-view';
const NOTE_SOURCE_LABEL = { manual: '手动', clipboard: '剪贴板', share: '分享' };

/** 切换页面级标签：外层显隐 + 记忆停留页；密码页 DOM/交互不动 */
function setView(v) {
  if (!VIEW_KEYS.includes(v)) v = 'pass';
  state.view = v;
  try { localStorage.setItem(VIEW_LS_KEY, v); } catch { /* 忽略隐私模式 */ }
  for (const k of VIEW_KEYS) $('#view-' + k)?.classList.toggle('hidden', k !== v);
  document.querySelectorAll('#view-tabs .view-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === v);
  });
  // 便签/文件页隐藏密码分类侧栏（只做外层显隐，不动密码页结构）
  closeSidebarDrawer();
  $('#sidebar')?.classList.toggle('hidden', v !== 'pass');
  $('#side-mask')?.classList.add('hidden');
  if (v === 'notes') refreshNotesList();
  if (v === 'files') refreshFilesList();
}

function noteSrcBadge(src) {
  const label = NOTE_SOURCE_LABEL[src] || '手动';
  return `<span class="src-badge src-${src}" title="来源：${label}">${label}</span>`;
}

function noteTime(iso) {
  try {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return ''; }
}

/** 便签页列表渲染（搜索复用 PassSearch 多词管线） */
async function refreshNotesList() {
  const listEl = $('#note-list'), emptyEl = $('#note-empty'), countEl = $('#note-count');
  if (!listEl) return;
  if (currentMode !== 'local') {
    listEl.innerHTML = '<div class="note-card"><div class="note-content">便签仅本地存储模式支持（服务器存储模式无 notes 表）。桌面/手机应用内默认即为本地模式。</div></div>';
    emptyEl.classList.add('hidden');
    countEl.textContent = '';
    return;
  }
  let notes = [];
  try { notes = LocalStore.notesList() || []; } catch (e) { toast('读取便签失败: ' + e.message, true); return; }
  let shown = notes;
  if (state.noteQ && window.PassNotes && window.PassSearch) {
    const res = PassNotes.searchNotes(notes, state.noteQ, PassSearch);
    if (res) shown = res.map((r) => r.note);
  }
  listEl.innerHTML = shown.map(renderNoteCard).join('');
  countEl.textContent = state.noteQ ? `${shown.length}/${notes.length} 条` : `共 ${notes.length} 条`;
  emptyEl.classList.toggle('hidden', shown.length > 0);
}

function renderNoteCard(n) {
  const tags = String(n.tags || '').split(/[,，、\s]+/).filter(Boolean);
  return `
  <article class="note-card" data-id="${n.id}" title="点击查看全文" style="cursor:pointer">
    <div class="note-head">
      <span class="note-title">${escapeHtml(n.title || PassNotes.titleOf(n.content))}</span>
      ${noteSrcBadge(n.source)}
    </div>
    <div class="note-content">${escapeHtml(n.content)}</div>
    <div class="note-foot">
      <span>${noteTime(n.updated_at)}</span>
      ${tags.map((t) => `<span class="note-tag-chip">${escapeHtml(t)}</span>`).join('')}
      <span class="note-ops">
        <button class="btn small" data-note-act="edit">编辑</button>
        <button class="btn small danger" data-note-act="del">删除</button>
      </span>
    </div>
  </article>`;
}

/** 新建/编辑便签弹窗（标题、正文、标签；来源徽标只读展示） */
/** 便签详情弹窗（v4.3.1）：卡片只显示截断预览，点卡片看全文（可滚动） */
function openNoteDetail(note) {
  const tags = String(note.tags || '').split(/[,，、\s]+/).filter(Boolean);
  openModal(`
    <div class="modal-head">
      <h3>${escapeHtml(note.title || PassNotes.titleOf(note.content))}</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;font-size:12px;color:var(--muted,#889)">
        ${noteSrcBadge(note.source)}
        <span>${noteTime(note.updated_at)}</span>
        ${tags.map((t) => `<span class="note-tag-chip">${escapeHtml(t)}</span>`).join('')}
      </div>
      <div style="white-space:pre-wrap;word-break:break-word;max-height:58vh;overflow-y:auto;font-size:14px;line-height:1.7">${escapeHtml(note.content)}</div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="btn-nd-del">删除</button>
      <button class="btn" id="btn-nd-copy">复制全文</button>
      <button class="btn primary" id="btn-nd-edit">编辑</button>
    </div>
  `, true);
  $('#btn-nd-copy').addEventListener('click', () => {
    copyText(note.content).catch(() => toast('复制失败', true)); // copyText 自带成功 toast
  });
  $('#btn-nd-edit').addEventListener('click', () => openNoteModal(note));
  $('#btn-nd-del').addEventListener('click', async () => {
    if (!confirm('确定删除这条便签？')) return;
    try {
      await LocalStore.noteRemove(note.id);
      closeModal();
      toast('便签已删除');
      refreshNotesList();
    } catch (e) { toast('删除失败: ' + e.message, true); }
  });
}

function openNoteModal(note) {
  const isNew = !note;
  note = note || { title: '', content: '', tags: '', source: 'manual' };
  openModal(`
    <div class="modal-head">
      <h3>${isNew ? '新建便签' : '编辑便签'}</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <label class="field"><span>标题（留空自动取正文首行）</span>
        <input id="note-f-title" type="text" maxlength="120" value="${escapeHtml(note.title || '')}" placeholder="如：会议要点 / 快递单号" />
      </label>
      <label class="field"><span>正文</span>
        <textarea id="note-f-content" rows="6" placeholder="粘贴或输入内容…">${escapeHtml(note.content || '')}</textarea>
      </label>
      <label class="field"><span>标签（空格/逗号分隔，可选）</span>
        <input id="note-f-tags" type="text" value="${escapeHtml(note.tags || '')}" placeholder="如：工作 灵感" />
      </label>
      <p class="hint">来源：${NOTE_SOURCE_LABEL[note.source] || '手动'}（记录该便签的收集通道，不可改）</p>
    </div>
    <div class="modal-foot">
      ${isNew ? '' : '<button class="btn danger" id="btn-note-del">删除</button>'}
      <button class="btn" id="btn-note-cancel">取消</button>
      <button class="btn primary" id="btn-note-save">保存</button>
    </div>
  `);
  $('#btn-note-cancel').addEventListener('click', closeModal);
  $('#btn-note-save').addEventListener('click', async () => {
    const content = $('#note-f-content').value;
    if (!content.trim()) return toast('正文不能为空', true);
    const title = $('#note-f-title').value.trim() || PassNotes.titleOf(content);
    const tags = $('#note-f-tags').value.trim();
    try {
      if (isNew) await LocalStore.noteCreate({ title, content, tags, source: 'manual' });
      else await LocalStore.noteUpdate(note.id, { title, content, tags });
      closeModal();
      toast(isNew ? '便签已保存' : '便签已更新');
      refreshNotesList();
    } catch (e) { toast('保存失败: ' + e.message, true); }
  });
  $('#btn-note-del')?.addEventListener('click', async () => {
    if (!confirm('确定删除这条便签？')) return;
    try {
      await LocalStore.noteRemove(note.id);
      closeModal();
      toast('便签已删除');
      refreshNotesList();
    } catch (e) { toast('删除失败: ' + e.message, true); }
  });
}

/* ---------- 手机 pending 队列消费（快捷方式/分享写入，启动时入 notes 表） ---------- */
async function consumePendingNotes() {
  if (!(IS_TAURI && IS_ANDROID && currentMode === 'local')) return;
  try {
    const b64 = await tauriInvoke('read_pending_notes');
    if (!b64) return;
    const text = new TextDecoder().decode(base64ToBytes(b64));
    if (!text.trim()) return;
    const existing = new Set((LocalStore.notesList() || []).map((n) => n.content));
    const r = PassNotes.consumePending(text, existing);
    for (const n of r.toInsert) await LocalStore.noteCreate(n); // source=clipboard|share 随队列
    if (r.toInsert.length) {
      toast(`已收入 ${r.toInsert.length} 条随手记${r.dup ? `（跳过重复 ${r.dup} 条）` : ''}`);
      refreshNotesList();
    }
  } catch (e) { console.warn('[passbook] pending notes 消费失败', e); }
}

/* ---------- 桌面全局快捷键（v4.3.0）：读剪贴板 → 应用内确认 → 直接入库 ---------- */
async function setupQuickNoteShortcut() {
  if (!(IS_TAURI && !IS_ANDROID)) return;
  try {
    await tauriInvoke('set_quicknote_shortcut', { accel: loadSettings().quickNoteShortcut || 'Ctrl+Alt+N' });
    await window.__TAURI__.event.listen('quicknote-clip', (ev) => {
      let text = '';
      try { text = new TextDecoder().decode(base64ToBytes(ev.payload)); } catch { text = String(ev.payload || ''); }
      if (text.trim()) openQuickNoteConfirm(text);
    });
  } catch (e) { console.warn('[passbook] 全局快捷键不可用', e); }
}

function openQuickNoteConfirm(text) {
  const preview = PassNotes.previewText(text);
  openModal(`
    <div class="modal-head">
      <h3>随手记：收入剪贴板内容？</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <p class="hint" style="margin-bottom:8px">剪贴板内容预览（前 80 字）：</p>
      <div class="note-card"><div class="note-content">${escapeHtml(preview)}</div></div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="btn-qn-cancel">取消</button>
      <button class="btn primary" id="btn-qn-ok">收入便签</button>
    </div>
  `);
  $('#btn-qn-cancel').addEventListener('click', closeModal);
  $('#btn-qn-ok').addEventListener('click', async () => {
    try {
      if (currentMode !== 'local') throw new Error('便签仅本地存储模式支持');
      await LocalStore.noteCreate({ title: PassNotes.titleOf(text), content: text, tags: '', source: 'clipboard' });
      closeModal();
      toast('已收入便签');
      if (state.view === 'notes') refreshNotesList();
    } catch (e) { toast(e.message, true); }
  });
}

// v4.4.0：回前台时消费 pending 文件队列（分享/其他应用打开通道确认后即入库）
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) setTimeout(consumePendingFiles, 300);
});

/* ---------- 三标签 + 便签页事件绑定 ---------- */
document.querySelectorAll('#view-tabs .view-tab').forEach((b) => {
  b.addEventListener('click', () => setView(b.dataset.view));
});
$('#btn-note-add')?.addEventListener('click', () => openNoteModal(null));
// v4.3.1：便签页独立搜索框（顶栏搜索只管密码页，互不干扰）
$('#note-search')?.addEventListener('input', debounce((e) => {
  state.noteQ = e.target.value.trim();
  refreshNotesList();
}, 200));
$('#note-list')?.addEventListener('click', (e) => {
  const card = e.target.closest('.note-card');
  const id = Number(card?.dataset.id);
  if (!(currentMode === 'local' && id)) return;
  const note = (LocalStore.notesList() || []).find((n) => n.id === id);
  if (!note) return;
  const btn = e.target.closest('[data-note-act]');
  if (!btn) { openNoteDetail(note); return; } // v4.3.1：点卡片本体看全文详情
  if (btn.dataset.noteAct === 'del') {
    if (!confirm('确定删除这条便签？')) return;
    LocalStore.noteRemove(note.id).then(() => { toast('便签已删除'); refreshNotesList(); }).catch((err) => toast(err.message, true));
  } else {
    openNoteModal(note);
  }
});


/* ---------------- 文件仓（v4.4.0）：加密分桶存储 + 四通道收件 + 文档预览 ---------------- */
/* 密钥策略：文件本体始终加密——密钥从数据库密钥派生（DbCrypto 同体系，salt 记 file_kv）；
 * 未启用整库加密的库用固定设备密钥派生；换密钥/关加密走 vaultReencryptAll 唯一重加密路径。 */
const FILE_FIXED_MATERIAL = 'passbook-device-fixed-key-v1';
const FILE_SOURCE_LABEL = { wechat: '微信', qq: 'QQ', saf: '导入', drag: '拖拽', open: '其他应用打开', other: '其他' };

function fileMaterial() {
  return (currentMode === 'local' && LocalStore._key) || FILE_FIXED_MATERIAL;
}

async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 取文件加密上下文 { material, saltB64, key }：salt 惰性建（file_kv 随 .db 走，本体绝不进 SQLite） */
async function vaultEnsureCrypto() {
  if (currentMode !== 'local') throw new Error('文件仓仅本地存储模式支持');
  if (!IS_TAURI) throw new Error('文件仓需在桌面/手机应用内使用');
  let saltB64 = LocalStore.fileKvGet('files_salt');
  if (!saltB64) {
    saltB64 = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    await LocalStore.fileKvSet('files_salt', saltB64);
  }
  const mat = fileMaterial();
  const matHash = await sha256Hex(new TextEncoder().encode(mat));
  const stored = LocalStore.fileKvGet('files_material');
  if (stored && stored !== matHash) {
    // 正常路径（启用/关闭加密、导入换钥）已在钩子里显式重加密；走到这里说明材料变化未被挂钩
    console.warn('[passbook] 文件仓密钥材料指纹变化但未走重加密路径，旧本体将无法解密');
  }
  if (stored !== matHash) await LocalStore.fileKvSet('files_material', matHash);
  const key = await DbCrypto.deriveKey(mat, base64ToBytes(saltB64));
  return { material: mat, saltB64, key };
}

/** 共用入库管线：sha256 → 去重查桶 → 加密入桶 → 元数据入库 */
async function vaultImport(meta) {
  const fc = await vaultEnsureCrypto();
  const sha = await sha256Hex(meta.bytes);
  const row = PassFiles.buildMetaRow({
    name: meta.name, mime: meta.mime, size: meta.bytes.length, sha256: sha,
    source: meta.source, tags: meta.tags || '', note: meta.note || '',
  });
  const dupBefore = PassFiles.dupCount(LocalStore.filesList() || [], sha);
  const exists = await tauriInvoke('store_blob_exists', { sha256: sha });
  if (!exists) {
    const enc = await DbCrypto.encryptBytes(meta.bytes, fc.key, base64ToBytes(fc.saltB64));
    await tauriInvoke('store_blob_write_b64', { sha256: sha, b64: bytesToBase64(enc) });
  }
  const id = await LocalStore.fileCreate(row);
  queueFtext(id); // v4.5.0：入库后异步抽取正文建内容索引（不阻塞入库）
  return { row: { ...row, id }, dupBefore, storedNew: !exists };
}

/** 解密读取本体 */
async function vaultReadBytes(sha256) {
  const fc = await vaultEnsureCrypto();
  const b64 = await tauriInvoke('store_blob_read_b64', { sha256 });
  if (!b64) throw new Error('加密本体缺失（可能已被清理）');
  return await DbCrypto.decryptBytes(base64ToBytes(b64), fc.key);
}

/** 删除：引用计数——同内容多条共享本体，最后一条引用删掉才物理删桶内文件 */
async function vaultRemove(id) {
  const rows = LocalStore.filesList() || [];
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error('文件记录不存在');
  const remaining = rows.filter((r) => r.sha256 === row.sha256 && r.id !== id);
  const lastRef = PassFiles.shouldDeleteBlob(remaining);
  await LocalStore.fileRemove(id);
  if (lastRef && IS_TAURI) {
    try { await tauriInvoke('store_blob_delete', { sha256: row.sha256 }); } catch (e) { console.warn('本体删除失败', e); }
  }
  return { lastRef };
}

/** 换密钥重加密（唯一路径）：全部本体 旧材料解密 → 新材料加密 → 回写 */
async function vaultReencryptAll(newMaterial, oldMaterial) {
  if (!(IS_TAURI && currentMode === 'local')) return 0;
  let shas = [];
  try { shas = await tauriInvoke('store_blob_list') || []; } catch { return 0; }
  if (!shas.length) return 0;
  const saltB64 = LocalStore.fileKvGet('files_salt');
  if (!saltB64) return 0;
  const salt = base64ToBytes(saltB64);
  const plan = PassFiles.reencryptTasks(shas);
  const oldKey = await DbCrypto.deriveKey(oldMaterial || FILE_FIXED_MATERIAL, salt);
  const newKey = await DbCrypto.deriveKey(newMaterial, salt);
  for (const t of plan.tasks) {
    const b64 = await tauriInvoke('store_blob_read_b64', { sha256: t.sha256 });
    if (!b64) continue;
    const plain = await DbCrypto.decryptBytes(base64ToBytes(b64), oldKey);
    const enc = await DbCrypto.encryptBytes(plain, newKey, salt);
    await tauriInvoke('store_blob_write_b64', { sha256: t.sha256, b64: bytesToBase64(enc) });
  }
  LocalStore.fileKvSet('files_material', await sha256Hex(new TextEncoder().encode(newMaterial)));
  return plan.tasks.length;
}

/** 文件仓导出：zip（store-only）= manifest.json + blobs/<sha256>（本体保持加密原样） */
async function vaultExportZip() {
  if (currentMode !== 'local') throw new Error('文件仓仅本地存储模式支持');
  if (!IS_TAURI) throw new Error('文件仓导出需在桌面/手机应用内使用');
  const rows = LocalStore.filesList() || [];
  if (!rows.length) throw new Error('文件仓为空');
  const fc = await vaultEnsureCrypto();
  const parts = [{
    name: 'manifest.json',
    bytes: new TextEncoder().encode(JSON.stringify({
      app: 'passbook', kind: 'filehub-export', version: 1,
      exported_at: new Date().toISOString(),
      files_salt: fc.saltB64,
      files: rows.map((r) => ({
        name: r.name, mime: r.mime, size: r.size, sha256: r.sha256,
        source: r.source, tags: r.tags, note: r.note, created_at: r.created_at,
      })),
    }, null, 2)),
  }];
  const seen = {};
  for (const r of rows) {
    if (seen[r.sha256]) continue;
    seen[r.sha256] = true;
    const b64 = await tauriInvoke('store_blob_read_b64', { sha256: r.sha256 });
    if (b64) parts.push({ name: 'blobs/' + r.sha256, bytes: base64ToBytes(b64) });
  }
  const zip = PassFiles.buildZip(parts);
  const fname = `passbook-filehub-${new Date().toISOString().slice(0, 10)}.zip`;
  if (IS_ANDROID && window.__passbook_saf) {
    await androidSafSave(zip, fname); // SAF 系统另存（v3.0.5 桥）
    toast('文件仓 zip 已另存');
  } else {
    const dest = await tauriInvoke('export_bytes_b64', { b64: bytesToBase64(zip), suggestedName: fname });
    if (dest) toast('文件仓 zip 已导出：' + dest);
    else toast('已取消导出');
  }
}

/* ---------- 文件仓页 UI ---------- */

/** mime 类型着色图标（纯 CSS 色块 + 缩写） */
function fileIcon(mime, name) {
  const k = PassFiles.previewKind(mime, name);
  const ext = (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '?';
  const cls = { 'inline-pdf': 'ft-pdf', 'inline-docx': 'ft-doc', 'inline-xlsx': 'ft-xls', 'text': 'ft-txt', 'inline-md': 'ft-md', 'inline-img': 'ft-img' }[k] || 'ft-sys';
  return `<span class="file-icon ${cls}">${escapeHtml(ext.toUpperCase().slice(0, 4))}</span>`;
}

function fileSrcBadge(src) {
  const label = FILE_SOURCE_LABEL[src] || '其他';
  return `<span class="src-badge src-${src}" title="来源：${label}">${label}</span>`;
}

function renderFileCard(f, ci) {
  const tags = String(f.tags || '').split(/[,，、\s]+/).filter(Boolean);
  const k = PassFiles.previewKind(f.mime, f.name);
  const canInline = k !== 'system';
  const contentBadge = ci && ci.contentHit ? '<span class="src-badge src-content" title="检索词命中文件正文">内容命中</span>' : '';
  const snippetLine = ci && ci.snippet ? `<div class="file-snippet">${escapeHtml(ci.snippet)}</div>` : '';
  const body = ci && ci.snippet ? snippetLine : `<div class="note-content">${escapeHtml(f.note || (canInline ? '点击卡片可应用内预览' : '点击卡片可用系统应用打开'))}</div>`;
  return `
  <article class="note-card file-card" data-id="${f.id}" title="点击查看详情" style="cursor:pointer">
    <div class="note-head">
      ${fileIcon(f.mime, f.name)}
      <span class="note-title">${escapeHtml(f.name)}</span>
      ${fileSrcBadge(f.source)}
      ${contentBadge}
    </div>
    ${body}
    <div class="note-foot">
      <span>${noteTime(f.created_at)}</span>
      <span>${escapeHtml(PassFiles.formatSize(f.size))}</span>
      ${tags.map((t) => `<span class="note-tag-chip">${escapeHtml(t)}</span>`).join('')}
    </div>
  </article>`;
}

async function refreshFilesList() {
  const listEl = $('#file-list'), emptyEl = $('#file-empty'), countEl = $('#file-count');
  if (!listEl) return;
  if (currentMode !== 'local') {
    listEl.innerHTML = '<div class="note-card"><div class="note-content">文件仓仅本地存储模式支持（服务器存储模式无 files 表）。桌面/手机应用内默认即为本地模式。</div></div>';
    emptyEl.classList.add('hidden');
    countEl.textContent = '';
    return;
  }
  if (!IS_TAURI) {
    listEl.innerHTML = '<div class="note-card"><div class="note-content">文件仓需在桌面/手机应用内使用（浏览器 PWA 无加密文件存储通道）。</div></div>';
    emptyEl.classList.add('hidden');
    countEl.textContent = '';
    return;
  }
  let files = [];
  try { files = LocalStore.filesList() || []; } catch (e) { toast('读取文件列表失败: ' + e.message, true); return; }
  let shown = files;
  let contentInfo = {}; // v4.5.0：id → { contentHit, snippet }（内容命中徽标与片段）
  if (state.fileQ && window.PassFiles && window.PassSearch) {
    const res = PassFiles.searchFiles(files, state.fileQ, PassSearch);
    if (res) {
      shown = res.map((r) => r.file);
      const terms = state.fileQ.split(/\s+/).filter(Boolean);
      for (const r of res) {
        if (r.contentHit || (r.file.ftext && terms.length)) {
          const sn = PassFiles.snippetOf(r.file.ftext || '', terms);
          if (r.contentHit || sn) contentInfo[r.file.id] = { contentHit: !!r.contentHit, snippet: sn };
        }
      }
    }
  }
  listEl.innerHTML = shown.map((f) => renderFileCard(f, contentInfo[f.id])).join('');
  countEl.textContent = state.fileQ ? `${shown.length}/${files.length} 个` : `共 ${files.length} 个`;
  emptyEl.classList.toggle('hidden', shown.length > 0);
}

/** 文件详情（照 openNoteDetail 模式：元数据+备注+预览/系统打开/编辑/删除） */
function openFileDetail(file) {
  const tags = String(file.tags || '').split(/[,，、\s]+/).filter(Boolean);
  const k = PassFiles.previewKind(file.mime, file.name);
  openModal(`
    <div class="modal-head">
      <h3>${escapeHtml(file.name)}</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;font-size:12px;color:var(--muted,#889)">
        ${fileIcon(file.mime, file.name)}
        ${fileSrcBadge(file.source)}
        <span>${escapeHtml(PassFiles.formatSize(file.size))}</span>
        <span>${escapeHtml(file.mime || PassFiles.mimeFromName(file.name) || '未知类型')}</span>
        <span>${noteTime(file.created_at)}</span>
      </div>
      <div style="font-size:12px;color:var(--muted,#889);margin-bottom:8px" class="mono">sha256: ${escapeHtml(file.sha256)}</div>
      ${tags.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${tags.map((t) => `<span class="note-tag-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      ${file.note ? `<div style="white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.7;margin-bottom:8px">${escapeHtml(file.note)}</div>` : ''}
    </div>
    <div class="modal-foot foot-wrap">
      <button class="btn danger" id="btn-fd-del">删除</button>
      <button class="btn" id="btn-fd-edit">重命名/标签</button>
      <button class="btn" id="btn-fd-open">系统打开</button>
      <button class="btn primary" id="btn-fd-preview">${k === 'system' ? '打开' : '预览'}</button>
    </div><!-- foot-wrap：手机端四按钮换行不超宽 -->
  `, true);
  $('#btn-fd-preview').addEventListener('click', () => openFilePreview(file));
  $('#btn-fd-open').addEventListener('click', () => systemOpenFile(file).catch((e) => toast(e.message, true)));
  $('#btn-fd-edit').addEventListener('click', () => openFileEditModal(file));
  $('#btn-fd-del').addEventListener('click', async () => {
    const rows = LocalStore.filesList() || [];
    const same = rows.filter((r) => r.sha256 === file.sha256).length;
    const lastRef = same <= 1;
    if (!confirm(lastRef ? '确定删除该文件？这是此内容的最后一份引用，删除后加密存储将一并清除。' : `确定删除该文件？该内容还有 ${same - 1} 份引用，加密本体将保留。`)) return;
    try {
      await vaultRemove(file.id);
      closeModal();
      toast(lastRef ? '文件已删除（加密本体已清理）' : '文件已删除');
      refreshFilesList();
    } catch (e) { toast('删除失败: ' + e.message, true); }
  });
}

function openFileEditModal(file) {
  openModal(`
    <div class="modal-head">
      <h3>编辑文件信息</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <label class="field"><span>文件名</span>
        <input id="file-f-name" type="text" maxlength="160" value="${escapeHtml(file.name || '')}" />
      </label>
      <label class="field"><span>标签（空格/逗号分隔，可选）</span>
        <input id="file-f-tags" type="text" value="${escapeHtml(file.tags || '')}" placeholder="如：工作 合同" />
      </label>
      <label class="field"><span>备注（可选）</span>
        <textarea id="file-f-note" rows="3" placeholder="记录这份文件的背景…">${escapeHtml(file.note || '')}</textarea>
      </label>
      <p class="hint">来源（${FILE_SOURCE_LABEL[file.source] || '其他'}）与内容指纹不可改；文件本体保持加密不变。</p>
    </div>
    <div class="modal-foot">
      <button class="btn" id="btn-file-edit-cancel">取消</button>
      <button class="btn primary" id="btn-file-edit-save">保存</button>
    </div>
  `);
  $('#btn-file-edit-cancel').addEventListener('click', closeModal);
  $('#btn-file-edit-save').addEventListener('click', async () => {
    try {
      await LocalStore.fileUpdate(file.id, {
        name: $('#file-f-name').value.trim() || file.name,
        tags: $('#file-f-tags').value.trim(),
        note: $('#file-f-note').value,
      });
      closeModal();
      toast('文件信息已更新');
      refreshFilesList();
    } catch (e) { toast(e.message, true); }
  });
}

/* ---------- 第三方预览库按需加载（本地打包，绝不走 CDN） ---------- */
let _libCache = {};
function loadScriptOnce(src) {
  if (!_libCache[src]) {
    _libCache[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => { delete _libCache[src]; reject(new Error('加载 ' + src + ' 失败')); };
      document.head.appendChild(el);
    });
  }
  return _libCache[src];
}
async function ensurePdfJs() {
  if (!window.__pdfjsLib) {
    const mod = await import('./lib/pdfjs/pdf.min.mjs');
    mod.GlobalWorkerOptions.workerSrc = './lib/pdfjs/pdf.worker.min.mjs';
    window.__pdfjsLib = mod;
  }
  return window.__pdfjsLib;
}
async function ensureDocx() {
  await loadScriptOnce('./lib/jszip.min.js');
  await loadScriptOnce('./lib/docx-preview.min.js');
  if (!window.docx) throw new Error('docx 渲染库未就绪');
  return window.docx;
}
async function ensureXlsx() {
  await loadScriptOnce('./lib/xlsx.full.min.js');
  if (!window.XLSX) throw new Error('表格渲染库未就绪');
  return window.XLSX;
}

/* ---------- 预览矩阵（全部离线本地渲染，文件不出本机） ---------- */
async function openFilePreview(file) {
  const kind = PassFiles.previewKind(file.mime, file.name);
  openModal(`
    <div class="modal-head">
      <h3>${escapeHtml(file.name)}</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div id="file-preview-box" style="min-height:120px"><p class="hint">解密读取中…（大文件稍等）</p></div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="btn-fp-open">系统打开</button>
      <button class="btn primary" id="btn-fp-close">关闭</button>
    </div>
  `, true);
  $('#btn-fp-close').addEventListener('click', closeModal);
  $('#btn-fp-open').addEventListener('click', () => systemOpenFile(file).catch((e) => toast(e.message, true)));
  const box = $('#file-preview-box');
  try {
    if (kind === 'system') {
      box.innerHTML = `<p class="hint">该类型（${escapeHtml(file.mime || '未知')}）不做内置渲染：可点「系统打开」用系统应用查看，文件已加密保存于文件仓。</p>`;
      return;
    }
    if (file.size > 30 * 1024 * 1024) box.innerHTML = '<p class="hint">文件较大（' + escapeHtml(PassFiles.formatSize(file.size)) + '），解密与渲染可能需要一会儿…</p>';
    const bytes = await vaultReadBytes(file.sha256);
    if (kind === 'inline-img') {
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mime || 'image/*' }));
      box.innerHTML = `<img src="${url}" alt="${escapeHtml(file.name)}" style="max-width:100%;border-radius:8px" />`;
      box.querySelector('img').addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
    } else if (kind === 'text') {
      box.innerHTML = `<pre style="white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.6;max-height:60vh;overflow-y:auto">${escapeHtml(new TextDecoder('utf-8', { fatal: false }).decode(bytes))}</pre>`;
    } else if (kind === 'inline-md') {
      box.innerHTML = `<div class="md-body" style="max-height:60vh;overflow-y:auto">${PassFiles.mdToHtml(new TextDecoder().decode(bytes))}</div>`;
    } else if (kind === 'inline-pdf') {
      const pdfjs = await ensurePdfJs();
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      let page = 1;
      const render = async () => {
        box.innerHTML = `<p class="hint" id="fp-status">渲染第 ${page}/${doc.numPages} 页…</p>
          <div id="fp-pages" style="display:flex;flex-direction:column;gap:12px;align-items:center"></div>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
            <button class="btn small" id="fp-prev" ${page <= 1 ? 'disabled' : ''}>上一页</button>
            <span style="align-self:center;font-size:12px;color:var(--muted,#889)">${page} / ${doc.numPages}</span>
            <button class="btn small" id="fp-next" ${page >= doc.numPages ? 'disabled' : ''}>下一页</button>
          </div>`;
        const pg = await doc.getPage(page);
        const scale = Math.min(1.6, (box.clientWidth || 600) / pg.getViewport({ scale: 1 }).width);
        const viewport = pg.getViewport({ scale: Math.max(0.5, scale) });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        canvas.style.maxWidth = '100%';
        box.querySelector('#fp-pages').appendChild(canvas);
        await pg.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        box.querySelector('#fp-status')?.remove();
        box.querySelector('#fp-prev')?.addEventListener('click', () => { if (page > 1) { page--; render(); } });
        box.querySelector('#fp-next')?.addEventListener('click', () => { if (page < doc.numPages) { page++; render(); } });
      };
      await render();
    } else if (kind === 'inline-docx') {
      const docx = await ensureDocx();
      box.innerHTML = '<div id="fp-docx" style="max-height:60vh;overflow-y:auto"></div>';
      await docx.renderAsync(bytes, box.querySelector('#fp-docx'), null, { inWrapper: true });
    } else if (kind === 'inline-xlsx') {
      const XLSX = await ensureXlsx();
      const wb = XLSX.read(bytes, { type: 'array' });
      const sheets = wb.SheetNames;
      let html = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${sheets.map((n, i) => `<button class="btn small fp-sheet-tab" data-sheet="${i}">${escapeHtml(n)}</button>`).join('')}</div><div id="fp-sheet-box" style="max-height:56vh;overflow:auto"></div>`;
      box.innerHTML = html;
      const show = (i) => {
        const ws = wb.Sheets[sheets[i]];
        box.querySelector('#fp-sheet-box').innerHTML = XLSX.utils.sheet_to_html(ws, { id: 'fp-xlsx-table' });
        box.querySelectorAll('.fp-sheet-tab').forEach((b) => b.classList.toggle('primary', Number(b.dataset.sheet) === i));
      };
      box.querySelectorAll('.fp-sheet-tab').forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.sheet))));
      show(0);
    }
  } catch (e) {
    box.innerHTML = `<p class="hint" style="color:var(--danger,#c33)">预览失败：${escapeHtml(e.message || String(e))}</p><p class="hint">可尝试「系统打开」。</p>`;
  }
}

/** 系统打开：解密到临时目录 → Android FileProvider+ACTION_VIEW / 桌面 shell open */
async function systemOpenFile(file) {
  const bytes = await vaultReadBytes(file.sha256);
  const path = await tauriInvoke('filehub_temp_write_b64', { name: file.name, b64: bytesToBase64(bytes) });
  const mime = file.mime || PassFiles.mimeFromName(file.name) || '*/*';
  if (IS_ANDROID) {
    if (window.__passbook_saf && typeof window.__passbook_saf.open === 'function') {
      window.__passbook_saf.open(path, mime);
      toast('已用系统应用打开（临时解密文件在系统缓存目录）');
    } else toast('当前环境不支持系统打开', true);
  } else {
    await tauriInvoke('shell_open', { path });
    toast('已用系统应用打开');
  }
}

/* ---------- v4.5.0 内容检索：正文抽取（依赖已打包库：pdfjs / JSZip / XLSX） ---------- */

/** 抽取正文：按预览类型分派。旧二进制（doc/ppt/xls）与图片无文本层 → 空文本（仍记 ok=1 不重试） */
async function extractFtext(file) {
  const k = PassFiles.previewKind(file.mime, file.name);
  const ext = (String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  let text = '';
  const bytes = await vaultReadBytes(file.sha256);
  if (k === 'text' || k === 'inline-md') {
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } else if (k === 'inline-pdf') {
    const pdfjs = await ensurePdfJs();
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const parts = [];
    const maxPages = Math.min(doc.numPages, 500); // 超长 PDF 抽前 500 页，足够个人检索
    for (let i = 1; i <= maxPages; i++) {
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent();
      parts.push(tc.items.map((it) => it.str).join(' '));
      if (parts.join('\n').length > PassFiles.FTEXT_CAP * 2) break; // 留出余量后早停
    }
    text = parts.join('\n');
  } else if (k === 'inline-docx') {
    await ensureDocx(); // 载入 JSZip 全局
    const zip = await window.JSZip.loadAsync(bytes);
    const parts = [];
    const names = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];
    for (const n of names) {
      const f = zip.file(n);
      if (f) parts.push(PassFiles.xmlToText(await f.async('string')));
    }
    text = parts.join('\n');
  } else if (k === 'inline-xlsx') {
    const XLSX = await ensureXlsx();
    const wb = XLSX.read(bytes, { type: 'array' });
    text = wb.SheetNames.map((n) => '# ' + n + '\n' + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
  } else if (ext === 'pptx') {
    // pptx 预览走系统打开，但正文抽取便宜（JSZip 解 slides XML），内容检索照样支持
    await ensureDocx();
    const zip = await window.JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort(PassFiles.slideKeyOrder);
    const parts = [];
    for (const n of names) parts.push(PassFiles.xmlToText(await zip.file(n).async('string')));
    text = parts.join('\n');
  }
  /* 其余（图片 / doc / ppt / xls 旧二进制 / 未知类型）：无轻量文本层，记空 */
  text = PassFiles.capText(text);
  await LocalStore.fileSetFtext(file.id, text, 1);
  return text;
}

/** 串行抽取队列（大 PDF 解析慢，排队不阻塞 UI；已索引跳过） */
let _ftextQueue = [];
let _ftextRunning = false;
function queueFtext(fileId) {
  if (!(currentMode === 'local' && IS_TAURI)) return;
  _ftextQueue.push(fileId);
  runFtextQueue();
}
async function runFtextQueue() {
  if (_ftextRunning) return;
  _ftextRunning = true;
  try {
    while (_ftextQueue.length) {
      const id = _ftextQueue.shift();
      const f = (LocalStore.filesList() || []).find((x) => x.id === id);
      if (!f || f.ftext_ok) continue;
      try { await extractFtext(f); }
      catch (e) { console.warn('[passbook] 正文抽取失败', f.name, e); }
    }
    if (state.view === 'files') refreshFilesList(); // 索引完成后刷新（内容命中徽标可能变化）
  } finally { _ftextRunning = false; }
}

/* ---------- 内容索引按钮 + 检索结果渲染 ---------- */
$('#btn-files-index')?.addEventListener('click', async () => {
  if (currentMode !== 'local' || !IS_TAURI) return toast('内容索引需在桌面/手机应用内本地模式使用', true);
  const rows = (LocalStore.filesList() || []).filter((r) => !r.ftext_ok);
  if (!rows.length) return toast('内容索引已是最新（旧 doc/ppt/xls 与图片无文本层，不参与内容检索）');
  toast(`开始为 ${rows.length} 个文件抽取正文建索引，大文件稍候…`);
  for (const r of rows) queueFtext(r.id);
});

/* ---------- 四通道导入 ---------- */
async function filesImportClick() {
  if (currentMode !== 'local') return toast('文件仓仅本地存储模式支持', true);
  if (!IS_TAURI) return toast('文件仓导入需在桌面/手机应用内使用', true);
  if (IS_ANDROID) {
    // SAF 批量导入：ACTION_OPEN_DOCUMENT 多选 → SafImportActivity 流式拷贝入 pending 队列 → 前端消费
    if (!(window.__passbook_saf && typeof window.__passbook_saf.pick === 'function')) return toast('此环境不支持 SAF 导入', true);
    const t0 = Date.now();
    const iv = setInterval(() => {
      let r = 'pending';
      try { r = window.__passbook_saf.pickResult(); } catch { /* 忽略 */ }
      if (r !== 'pending') { clearInterval(iv); setTimeout(consumePendingFiles, 400); }
      else if (Date.now() - t0 > 300000) clearInterval(iv);
    }, 500);
    window.__passbookSafPickResult = () => { clearInterval(iv); setTimeout(consumePendingFiles, 400); }; // evaluateJavascript 快路径
    window.__passbook_saf.pick();
  } else {
    // 桌面：系统对话框多选（pick_files 多选版，保持 pick_import_db 旧语义）→ 应用内确认
    const picked = await tauriInvoke('pick_files');
    if (!picked || !picked.length) return;
    openFilesImportConfirm(picked.map((f) => ({ name: f.name, path: f.path, size: f.size, file: null })), 'saf');
  }
}

/** 桌面导入确认弹窗（动态按钮 document 委托） */
function openFilesImportConfirm(items, source) {
  openModal(`
    <div class="modal-head">
      <h3>导入 ${items.length} 个文件到文件仓？</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <p class="hint">文件将以 AES-GCM 加密存入本机文件仓（同内容自动去重，只存一份）。</p>
      <div style="max-height:44vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-top:8px">
        ${items.map((f, i) => `
        <label class="note-card" style="display:flex;gap:8px;align-items:center;cursor:pointer">
          <input type="checkbox" class="files-import-ck" data-i="${i}" checked />
          <span style="flex:1;word-break:break-all">${escapeHtml(f.name)}</span>
          <span style="font-size:12px;color:var(--muted,#889);white-space:nowrap;flex:none">${escapeHtml(PassFiles.formatSize(f.size))}</span>
        </label>`).join('')}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="btn-files-import-cancel">取消</button>
      <button class="btn primary" id="btn-files-import-ok">导入</button>
    </div>
  `, true);
  $('#btn-files-import-cancel').addEventListener('click', closeModal);
  const doImport = async () => {
    const cks = [...document.querySelectorAll('.files-import-ck')].filter((c) => c.checked).map((c) => items[Number(c.dataset.i)]);
    if (!cks.length) return toast('未选择任何文件', true);
    const okBtn = document.getElementById('btn-files-import-ok');
    if (okBtn) { okBtn.disabled = true; okBtn.textContent = '导入中…'; }
    let ok = 0, dup = 0;
    for (const f of cks) {
      try {
        let bytes;
        if (f.file) bytes = new Uint8Array(await f.file.arrayBuffer());
        else {
          const b64 = await tauriInvoke('read_file_bytes_b64', { path: f.path });
          if (!b64) throw new Error('读取失败');
          bytes = base64ToBytes(b64);
        }
        const r = await vaultImport({ name: f.name, mime: '', bytes, source });
        if (r.dupBefore) dup++;
        ok++;
      } catch (e) { console.warn('[passbook] 导入失败', f.name, e); toast(`「${f.name}」导入失败：` + e.message, true); }
    }
    closeModal();
    toast(`已导入 ${ok} 个文件${dup ? `（${dup} 个与已有内容相同）` : ''}`);
    refreshFilesList();
  };
  // 动态弹窗按钮 document 委托（v4.1.0 教训）
  if (!document.getElementById('btn-files-import-ok')) {
    document.addEventListener('click', function onImportOk(e) {
      const btn = e.target.closest('#btn-files-import-ok');
      if (btn) { document.removeEventListener('click', onImportOk); doImport(); }
    });
  } else {
    document.getElementById('btn-files-import-ok').addEventListener('click', doImport);
  }
}

/* ---------- 手机 pending 队列消费（分享/其他应用打开/SAF 写入，启动与回前台时入库） ---------- */
let _pendingFilesBusy = false;
async function consumePendingFiles() {
  if (!(IS_TAURI && IS_ANDROID && currentMode === 'local') || _pendingFilesBusy) return;
  _pendingFilesBusy = true;
  try {
    const b64 = await tauriInvoke('read_pending_files');
    if (!b64) return;
    const text = new TextDecoder().decode(base64ToBytes(b64));
    if (!text.trim()) return;
    const r = PassFiles.parsePendingFiles(text);
    let ok = 0, dup = 0, openRow = null;
    for (const it of r.items) {
      try {
        const fb64 = await tauriInvoke('read_file_bytes_b64', { path: it.tempPath });
        if (!fb64) continue;
        const res = await vaultImport({ name: it.name, mime: it.mime, bytes: base64ToBytes(fb64), source: it.source });
        if (res.dupBefore) dup++;
        ok++;
        if (it.open) openRow = res.row;
      } catch (e) { console.warn('[passbook] 文件入库失败', it.name, e); }
      try { await tauriInvoke('delete_file', { path: it.tempPath }); } catch { /* 临时文件清理尽力而为 */ }
    }
    if (ok) {
      toast(`文件仓已收入 ${ok} 个文件${dup ? `（${dup} 个与已有内容相同）` : ''}`);
      if (state.view === 'files') refreshFilesList();
      if (openRow) {
        setView('files');
        setTimeout(() => {
          const row = (LocalStore.filesList() || []).find((x) => x.id === openRow.id);
          if (row) { openFileDetail(row); openFilePreview(row); }
        }, 300);
      }
    }
  } catch (e) { console.warn('[passbook] pending files 消费失败', e); }
  finally { _pendingFilesBusy = false; }
}

/* ---------- 文件仓页事件绑定 ---------- */
$('#btn-files-import')?.addEventListener('click', filesImportClick);
$('#file-search')?.addEventListener('input', debounce((e) => {
  state.fileQ = e.target.value.trim();
  refreshFilesList();
}, 200));
$('#file-list')?.addEventListener('click', (e) => {
  const card = e.target.closest('.file-card');
  const id = Number(card?.dataset.id);
  if (!(currentMode === 'local' && id)) return;
  const file = (LocalStore.filesList() || []).find((f) => f.id === id);
  if (file) openFileDetail(file);
});
// 桌面拖拽导入（label.file-drop 必须 display:block —— inline label width:100% 不生效，v4.0 教训）
(() => {
  const zone = $('#file-drop-zone');
  if (!zone) return;
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag');
    const fs = [...(e.dataTransfer?.files || [])];
    if (!fs.length) return;
    if (!IS_TAURI || currentMode !== 'local') return toast('文件仓导入需在桌面应用内本地模式使用', true);
    openFilesImportConfirm(fs.map((f) => ({ name: f.name, size: f.size, file: f })), 'drag');
  });
  $('#file-input-multi')?.addEventListener('change', (e) => {
    const fs = [...(e.target.files || [])];
    e.target.value = '';
    if (!fs.length) return;
    if (!IS_TAURI || currentMode !== 'local') return toast('文件仓导入需在桌面应用内本地模式使用', true);
    openFilesImportConfirm(fs.map((f) => ({ name: f.name, size: f.size, file: f })), 'drag');
  });
})();

/* ---------- 截图/深链演示注入（#shot-notes / #shot-files 专用）：空库注入演示行 ---------- */
async function injectShotDemo() {
  if (currentMode !== 'local') return;
  try {
    if (location.hash === '#shot-notes') {
      if (!(LocalStore.notesList() || []).length) {
        for (const n of [
          { title: '快递单号', content: '顺丰 SF1388821992199，预计明天下午到，放驿站', tags: '生活', source: 'clipboard' },
          { title: '会议要点 0308', content: '1. 二期功能 3/22 上线\n2. 预算追加 8%\n3. 找王工要压测报告\n4. 新人周四入职', tags: '工作 灵感', source: 'manual' },
          { title: '租房燃气开户', content: '周一打 96777 预约，带身份证 + 房本照片，地址：朝阳区xx路 12 号', tags: '生活', source: 'share' },
        ]) await LocalStore.noteCreate(n);
      }
    } else if (location.hash === '#shot-files') {
      if (!(LocalStore.filesList() || []).length) {
        const demo = [
          ['2025 年度体检报告.pdf', 'application/pdf', 842133, 'wechat', '健康'],
          ['项目排期表 v3.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 53248, 'qq', '工作'],
          ['出差报销说明.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 88340, 'open', '工作 财务'],
          ['读书笔记.md', 'text/markdown', 4211, 'drag', '灵感'],
          ['合同扫描件.jpg', 'image/jpeg', 1024768, 'saf', '财务'],
        ];
        let i = 0;
        for (const [name, mime, size, source, tags] of demo) {
          i++;
          const fid = await LocalStore.fileCreate(PassFiles.buildMetaRow({
            name, mime, size, source, tags, note: '',
            sha256: (i.toString(16) + '0'.repeat(64)).slice(0, 64),
            created_at: new Date(Date.now() - i * 86400000 * 3).toISOString(),
          }));
          const demoText = [
            '体检结论：各项指标基本正常，血脂略高，建议低脂饮食并三个月后复查。项目明细见附页。',
            '里程碑：M1 需求冻结 3/10，M2 联调 3/18，M3 上线 3/22。风险：第三方支付接口延期。',
            '报销范围：差旅住宿每晚上限 400 元，需附发票与行程单，事前审批走 OA。',
            '读书笔记：第一章讲局部性原理，缓存友好的数据结构能差出一个数量级……',
            '扫描件：房屋租赁合同，租期 2025-03 至 2026-02，月租金 5600 元。',
          ][i - 1] || '';
          await LocalStore.fileSetFtext(fid, demoText, 1);
        }
      }
    }
  } catch (e) { console.warn('[passbook] 演示注入失败', e); }
}

(async function boot() {
  try {
    // 截图/深链演示分支：#shot-notes / #shot-files 强制本地模式（便签/文件仓为本地功能，截图走空库+演示注入）
    if (/^#shot-(notes|files)/.test(location.hash)) {
      try { const s = loadSettings(); s.storageMode = 'local'; saveSettings(s); } catch { /* 忽略 */ }
    }
    // 先过启动锁（PIN），再自动解锁加密库（本机密钥，无感），最后加载数据渲染
    await showLockIfNeeded();
    await initStore();
    await refreshChips();
    // v4.3.0：恢复上次停留页（默认密码页）
    let startView = 'pass';
    try { startView = localStorage.getItem(VIEW_LS_KEY) || 'pass'; } catch { /* 忽略 */ }
    setView(startView);
    await refreshList();
    // v4.3.0：手机消费 pending 队列入库；桌面注册全局快捷键
    await consumePendingNotes();
    await consumePendingFiles();
    await injectShotDemo(); // 截图深链演示注入（非截图场景为 no-op）
    setupQuickNoteShortcut();
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
    else if (shot === 'notes') setView('notes');
    else if (shot === 'files') setView('files');
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
      ${guideSec('main.png', '① 界面总览：三标签页与强搜索', `
        <p>顶栏下方是页面级<b>三标签</b>：<b>密码 | 随手记 | 文件仓</b>，点选切换，停留页自动记忆。三个页面各有<b>独立的搜索框</b>，互不干扰——密码页用顶栏搜索，随手记/文件仓用各自工具栏内的搜索框。</p>
        <p>密码页：左侧<b>分类侧栏</b>（手机端点左上角 ☰ 呼出）按「全部 / 收藏 / 各分类」切换；卡片左侧<b>星标</b> ☆ 收藏常用条目并自动置顶。顶部<b>搜索框</b>支持多词与操作符：关键词（命中 所属 / 账户 / 网址 / 备注 / 分类，打分排序+高亮）+ <code>分类：工作</code>、<code>有验证码</code>、<code>有收藏</code> 等过滤语法。</p>
        <p>每条记录默认打码，点 <b>眼睛</b> 看明文、<b>复制</b> 进剪贴板；<b>TOTP 动态码</b>实时显示 6 位验证码与倒计时（点一下即复制）；带 <b>📎 徽标</b> 的记录挂着附件。卡片左侧默认<b>首字头像</b>，设置里可开启<b>站点图标</b>。</p>`)}
      ${guideSec('notes.png', '② 随手记：碎片信息一键收集', `
        <p><b>手机快捷方式</b>：长按应用图标 →「随手记」，秒开小卡片预览剪贴板（前 80 字），点「收入」入队，下次打开应用自动入库并提示补了几条。</p>
        <p><b>微信/QQ 分享</b>：聊天里长按<b>文字</b> → 分享 →「存为随手记」，卡片确认后保存。</p>
        <p><b>电脑 Ctrl+Alt+N</b>（可在设置里改键）：读剪贴板弹应用内确认，点「收入便签」直接入库。</p>
        <p>便签页：卡片列表（标题/正文预览/来源徽标/标签/时间），<b>点卡片看全文详情</b>（可复制全文/编辑/删除）；工具栏「新建便签」手动录入。搜索框多词模糊匹配<b>标题 / 正文 / 标签</b>。</p>`)}
      ${guideSec('files.png', '③ 文件仓：文档统一加密收纳', `
        <p><b>四条收文件通道</b>（共用「拷贝 → sha256 → 加密入桶 → 元数据入库」管线，全程本机加密、不上传）：</p>
        <p>· <b>分享</b>（主通道）：微信/QQ 里长按<b>文件</b> → 分享 →「存入文件仓」，卡片确认（文件名/大小/类型/同内容去重提示）后保存；<br/>
           · <b>其他应用打开</b>：微信/QQ 文件右上角「…」→「选择用其他应用打开」→ 密码本。卡片提供两个动作：<b>保存到文件仓</b>，或<b>用密码本打开</b>（直接进文件仓并弹出预览）；<br/>
           · <b>应用内导入</b>：文件仓页点「导入文件」，手机走系统文档多选，电脑弹系统对话框多选；<br/>
           · <b>桌面拖拽</b>：把文件拖进文件仓页的虚线框即导入。</p>
        <p><b>同内容自动去重</b>：按内容 sha256 共用一份加密存储，删除时最后一份引用才会物理清除。</p>
        <p><b>文档预览（全离线本地渲染）</b>：PDF / docx / xlsx / Markdown / txt / 图片直接应用内预览；旧版 doc/ppt/xls 与 pptx 不做内置渲染，提供「系统打开」（临时解密到缓存目录调用系统应用）。桌面与手机同一套渲染。</p>
        <p>文件页搜索框多词模糊匹配<b>名称 / 备注 / 标签 / 来源 / 正文内容</b>（顶栏搜索依旧只管密码页）。<b>内容检索</b>：PDF / Word / Excel / PPT / Markdown / 文本文件的正文在导入时自动抽取建索引（本地完成、不上传），命中正文的结果带「内容命中」徽标与上下文片段；点工具栏「内容索引」可为存量/失败的文件补建。旧 doc/ppt/xls 二进制与图片没有文本层，只检索名称等元数据。</p>`)}
      ${guideSec('manual.png', '④ 存一条密码（手动录入）', `
        <p>点工具栏 <b>「＋ 手动录入」</b>，填写<b>所属</b>（应用/网站）、<b>账户</b>、<b>密码</b>三项必填。</p>
        <p>还可选填 <b>TOTP 密钥</b>（base32 或直接粘贴 otpauth:// 链接自动提取）、<b>分类</b>、<b>网址</b>、<b>备注</b>；编辑已有记录时能上传<b>附件</b>（每张 ≤2MB，随数据库加密存储）。</p>
        <p>连续录入用<b>「保存并继续录入」</b>；改密码时旧密码自动归档进<b>历史</b>，随时可查看/复制。</p>`)}
      ${guideSec('gen.png', '⑤ 生成强密码（字符型）', `
        <p>点 <b>「生成密码」</b> 展开生成器：选长度、字符类型，可勾选排除易混淆字符、键盘布局不连续、禁止连续相同/顺序字符等约束。</p>
        <p>实时显示<b>熵值与强度评级</b>；生成后一键<b>复制</b>或<b>保存到密码本</b>。手动录入表单里的魔棒按钮也能按当前设置快速生成。</p>`)}
      ${guideSec('phrase.png', '⑥ 生成密码短语（好记型）', `
        <p>切到 <b>「密码短语」</b> 标签：用<b>中文词表</b>（或 English words）随机组词，自选词数（推荐 6+）、分隔符，可附加两位数字。</p>
        <p>例如「灯塔-枫叶-晨曦-海豚-麦浪-松柏-47」，比随机字符串好记得多，6 词约 54 bits、8 词约 72 bits，配合数字更高。</p>`)}
      ${guideSec('agent.png', '⑦ AI 助理：聊天存 / 查 / 改密码', `
        <p>点右上角 <b>星形图标</b> 打开侧边对话面板，直接说人话：</p>
        <p>· 「帮我存一下：GitHub，账户 tom@example.com，密码 Abc!2345，备注工作主力号」<br/>
           · 「我 GitHub 的密码是什么？」<br/>
           · 「把 GitHub 的密码改成 Xk9#New2025」<br/>
           · 「生成一个 20 位不含符号的密码」</p>
        <p><b>隐私保护</b>：查询结果里的密码已打码，真实密码只在应用内卡片展示（可点眼睛/一键复制，与主页一致），不会发送给 AI 渠道；存、改密码时你提供的内容会发送给你配置的模型渠道。</p>
        <p>面板右上角可<b>清空对话</b>；生成过程中可点<b>停止</b>按钮随时中断。</p>`)}
      ${guideSec('sync.png', '⑧ 设置：加密 / 备份 / 锁定', `
        <p>点右上角<b>齿轮</b>打开设置：</p>
        <p>· <b>自动备份快照</b>：每小时自动把数据库整份快照存入 <code>backups/</code>，滚动保留最近 3~20 份；可随时<b>立即备份</b>，列表里每份可一键<b>恢复</b>或删除。</p>
        <p>· <b>数据库加密</b>：AES-256 全库加密（含导出的 .db）；<b>文件仓本体同样始终加密</b>（密钥从数据库密钥派生，未启用整库加密时用本机固定密钥），开启/关闭加密或更换密钥时文件本体自动重加密。<b>请务必备份密钥</b>（设置 → 数据库加密 → 备份密钥）。</p>
        <p>· <b>存储模式 / 数据库位置</b>：桌面版默认本地文件，可指向网盘文件夹多机共用。随手记与文件仓为本地模式功能。</p>
        <p>· <b>AI 助理</b>：填接口地址 / 模型名 / API Key（OpenAI 兼容渠道均可）；<b>随手记快捷键</b>（默认 Ctrl+Alt+N）。</p>
        <p>· <b>启动锁 PIN</b> 与 <b>自动锁定</b>：闲置可锁定（默认 5 分钟），复制密码后剪贴板自动清除；深色主题跟随系统或手动固定。电脑（Windows Hello）与手机（指纹/面容）可开启<b>生物识别解锁</b>。</p>`)}
      ${guideSec('', '⑨ 多端同步（手机 ↔ 电脑）', `
        <p>每台设备各存一份完整数据库（桌面是本地 <b>.db</b> 文件，手机是应用内存储），通过<b>导出 .db → 网盘/Syncthing → 另一端导入</b>合并；导入时选<b>「合并（跳过重复）」</b>即可汇总。导出的 .db 不含文件仓本体——文件仓单独用「导出 → 文件仓导出（zip：加密本体+清单）」。</p>
        <p>Android 版默认开启<b>防截屏</b>：截图、最近任务卡片都看不到密码内容。</p>`)}
      ${guideSec('import.png', '⑩ 批量导入 / 导出备份', `
        <p>「导入」支持三种方式：<b>粘贴文本</b>（每行一条：<code>所属,账户,密码[,网址][,备注]</code>）、上传 <b>CSV / JSON / TXT</b>、以及直接导入别的设备的 <b>.db</b> 文件（加密的 .db 会提示输入密钥文本解锁后导入）。手机端也可从别的应用「分享 / 用其他应用打开」把数据送进来（随手记与文件仓）。</p>
        <p>「导出」可导出 .db 数据库（用于同步，已启用加密时导出副本同样为密文）、JSON 备份（用于留存），以及<b>文件仓 zip</b>（加密本体 + 清单）。</p>`)}
      <p class="hint">提示：请保管好数据库文件，建议开启数据库加密（自动密钥，请备份密钥文本）与启动锁 PIN；配合自动备份快照更安心。</p>
    </div>
    <div class="modal-foot">
      <button class="btn primary" id="btn-guide-ok">知道了</button>
    </div>
  `, true);
  $('#btn-guide-ok').addEventListener('click', closeModal);
}
$('#btn-guide').addEventListener('click', openGuideModal);

/* ---------------- 全局错误提示（v3.0.5）----------------
 * 未捕获异常 / Promise 拒绝以 toast 展示原文（30 秒去重），便于用户反馈真实报错；
 * 资源加载失败（img/script 等，event.target 非空且无 message）不弹，避免头像请求刷屏 */
(function () {
  const seen = new Map();
  const show = (msg) => {
    const key = String(msg || '').slice(0, 160);
    if (!key) return;
    const now = Date.now();
    if (now - (seen.get(key) || 0) < 30000) return;
    seen.set(key, now);
    try { toast('⚠ ' + key, true); } catch { /* UI 未就绪时忽略 */ }
  };
  window.addEventListener('error', (e) => {
    if (e && e.target && e.target.tagName && !e.message) return; // 资源加载错误
    show(e.message || (e.error && e.error.message) || '未知错误');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    show((r && (r.message || r)) || 'Promise 未处理拒绝');
  });
})();
/* 手动刷新站点图标（v3.0.5）：文档级委托——设置弹窗里的「重试加载全部图标」
 * 计数 +1 并重绘列表，图标 URL 带新版本号跳过浏览器缓存强制重取。
 * v3.0.8 诊断探针：同时用 fetch(no-cors) 探测外网连通性——
 * 下次回报即可区分「fetch 通而 img 不通」（tauri 拦截层问题，走 Rust 侧下载）
 * 还是「都不通」（纯网络问题） */
document.addEventListener('click', async (e) => {
  const b = e.target && e.target.closest ? e.target.closest('#btn-favicon-refresh') : null;
  if (!b) return;
  const cur = loadSettings();
  saveSettings({ ...cur, faviconRev: (cur.faviconRev || 0) + 1 });
  faviconDataCache.clear(); // 清 Rust 下载缓存，强制全部重取
  toast('开始加载图标…');
  await refreshList(); // v3.2.1：等列表重建完（旧节点已标 hydrated，之前秒扫到 0 个任务）
  // v3.2.0：开始/完成两级提示（完成带成功/失败统计）；探针已退役
  const st = await hydrateFavicons('fetch-all').catch(() => ({ ok: 0, fail: 0 })); // v3.3.1 手动重试=全量重取（持久层兜底）
  toast('图标加载完成：成功 ' + st.ok + ' 个' + (st.fail ? '，失败 ' + st.fail + ' 个' : ''));
});

/* ---------------- TOTP 分渠道指南（v3.3.0）----------------
 * 手动录入/编辑弹窗 TOTP 标题旁的问号按钮：读取同弹窗「所属」当前值（打开
 * 瞬间快照），命中 PB_PRESETS 显示该渠道逐步获取指南；Steam 等不支持项显示
 * 不支持说明；未收录显示通用提示。 */
const TOTP_GUIDE_ICONS = [
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><path d="M14 14h3v3h-3zM21 14h.01M14 21h.01M17.5 17.5h.01M21 21h.01"></path></svg>',
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>',
];
function openTotpGuideModal(ownerVal) {
  const p = ownerVal && window.pbPresetMatch ? window.pbPresetMatch(ownerVal) : null;
  let channel;
  if (p && p.totp && p.totp.supported) {
    channel = `
      <div class="guide-channel">
        <div class="guide-channel-title">${escapeHtml(p.name)} 开启步骤</div>
        <div class="guide-steps">
          ${p.totp.steps.map((s, i) => `
            <div class="guide-step"><span class="guide-step-ico">${TOTP_GUIDE_ICONS[i % TOTP_GUIDE_ICONS.length]}</span><span class="guide-step-num">${i + 1}</span><span>${escapeHtml(s)}</span></div>`).join('')}
        </div>
        ${p.totp.note ? `<div class="guide-note">${escapeHtml(p.totp.note)}</div>` : ''}
      </div>`;
  } else if (p) {
    channel = `
      <div class="guide-channel">
        <div class="guide-channel-title">${escapeHtml(p.name)}（不支持标准 TOTP）</div>
        <div class="guide-note">${escapeHtml(p.totp && p.totp.note ? p.totp.note : '该渠道不支持标准 TOTP。')}</div>
      </div>`;
  } else {
    channel = `
      <div class="guide-channel">
        <div class="guide-note">该渠道未收录：开启两步验证时选择「身份验证器应用」即可获得密钥，把它存入本条目 TOTP 字段。</div>
      </div>`;
  }
  openOverlayModal(`
    <div class="modal-head"><h3>动态验证码（TOTP）说明</h3></div>
    <div class="modal-body totp-guide">
      <div class="guide-base">
        <p><b>TOTP</b>（基于时间的一次性密码）：每 <b>30 秒</b>轮换的 6 位动态码，本条目保存密钥后列表卡片会实时显示并一键复制。</p>
        <p><b>密钥只显示一次</b>：开启两步验证时务必当场把密钥（Base32 串或 otpauth:// 链接）存入本条目 TOTP 字段，错过只能重新绑定。</p>
        <p><b>换手机要迁移</b>：新设备无法自动继承——在新手机上重新绑定（先加新绑定、验证可用后再删旧的）。</p>
        <p><b>与短信验证的区别</b>：不依赖手机号与信号、离线可算、不怕 SIM 卡补办劫持；两者都开时优先用 TOTP。</p>
      </div>
      ${channel}
    </div>
    <div class="modal-foot"><button class="btn primary" data-close>我知道了</button></div>
  `);
}
/* ---------------- 通用说明弹窗（v3.3.3，v3.3.4 改独立层）----------------
 * 复用 TOTP 指南的样式（guide-base/guide-note/guide-steps）与「我知道了」
 * data-close 按钮；各处 ⃝? 按钮统一 class hint-btn + data-hint=key。
 * v3.3.4：不再走 openModal（那会替换 #modal-root，从设置弹窗点说明会把
 * 设置弹窗销毁）——自建 overlay 层 append 到 body，z-index 650 高于弹窗；
 * 关闭只移除自身（点遮罩空白/我知道了都关），不压 history 返回栈。
 * TOTP 指南同样走此层。 */
function openOverlayModal(html, wide = false, onClose) { // v4.0.0：onClose 关闭回调（扫码层释放相机）
  const mask = document.createElement('div');
  mask.className = 'modal-mask hint-mask';
  mask.innerHTML = `<div class="modal${wide ? ' wide' : ''}">${html}</div>`;
  const close = () => { mask.remove(); if (onClose) try { onClose(); } catch (e) { } };
  mask.addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  mask.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  mask.querySelector('.modal-close')?.addEventListener('click', close);
  document.body.appendChild(mask);
  return close;
}
function openHintModal(title, bodyHtml) {
  openOverlayModal(`
    <div class="modal-head"><h3>${escapeHtml(title)}</h3></div>
    <div class="modal-body totp-guide">
      ${bodyHtml}
    </div>
    <div class="modal-foot"><button class="btn primary" data-close>我知道了</button></div>
  `);
}
const hintSteps = (arr) => `<div class="guide-steps">${arr.map((s, i) => `
  <div class="guide-step"><span class="guide-step-ico">${TOTP_GUIDE_ICONS[i % TOTP_GUIDE_ICONS.length]}</span><span class="guide-step-num">${i + 1}</span><span>${s}</span></div>`).join('')}</div>`;
const PB_HINTS = {
  gen: {
    title: '密码生成说明',
    body: `
      <div class="guide-base">
        <p><b>长度建议 16 位以上</b>：生成器默认 16 位（可调 4-128）；对重要账户建议 20 位起步，长度比复杂度更防暴力破解。</p>
        <p><b>字符集</b>：大小写 + 数字 + 符号组合最抗猜测；个别老旧网站会拒绝部分符号（如 <code>*&lt;&gt;|</code>），登录报错时可关闭「符号」重新生成。</p>
        <p><b>口令模式</b>：生成器可切换为「多词口令」——几个随机词拼成好记的长口令，适合需要手动输入的场合。</p>
        <p><b>注意</b>：生成结果只在保存进条目后才入库；关闭弹窗即丢弃，不会自动保留明文副本（编辑旧密码时历史仅记录变更）。</p>
      </div>`,
  },
  enc: {
    title: '数据库加密说明',
    body: `
      <div class="guide-base">
        <p><b>作用</b>：整个 .db 库文件被加密保存——文件被拷走/网盘泄露也无法读取内容。</p>
        <p><b>密钥机制</b>：密钥由应用自动生成、仅保存在本机，启动时自动解密、日常使用无感。</p>
        <p><b style="color:var(--danger)">务必备份密钥</b>：加密库丢失密钥 = 数据<b>无法恢复</b>。请在下方点「备份密钥」保存密钥文本（相当于恢复码），换设备导入加密 .db 时也必须提供它。</p>
        <p><b>与 PIN 锁的区别</b>：PIN 只锁界面（防旁人翻看），加密锁的是文件本身（防文件外泄）；两者互补。</p>
      </div>`,
  },
  snap: {
    title: '自动备份快照说明',
    body: `
      <div class="guide-base">
        <p><b>频率与保留</b>：默认开启，每 60 分钟内至多自动快照一次；可设保留 3/5/10/20 份，超出自动清理最旧的。</p>
        <p><b>位置</b>：桌面/手机版存于应用数据目录 <code>backups\\</code>，浏览器版存于本机浏览器存储（清浏览器数据会丢，请定期导出 .db）。</p>
        <p><b>加密不变</b>：加密库的快照保持密文——快照本身也需密钥才能打开，不会被旁路明文泄露。</p>
        <p><b>如何恢复</b>：把 .db 快照文件用「导入」功能导入（导入页选 .db 文件，自动识别），或在导入前先备好加密密钥。</p>
      </div>`,
  },
  watch: {
    title: '安全体检说明',
    body: `
      <div class="guide-base">
        <p><b>弱密码</b>：命中常见弱密码词典（高危）；长度不足 8 位（高危）、不足 10 位且字符组合单一（低危）。</p>
        <p><b>重复密码</b>：同一密码用于多个条目——一处泄露即殃及全部同密码账户。</p>
        <p><b>陈旧密码</b>：超过设定期限未修改（默认 12 个月，可设 6/12/24 个月或关闭）。</p>
        <p><b>信息不完整</b>：缺账户或密码字段的条目，可能影响使用。</p>
        <p><b>建议动作</b>：点每条发现即可跳到对应条目，改成生成的强密码后体检项自动消除。</p>
      </div>`,
  },
};
document.addEventListener('click', (e) => {
  const b = e.target && e.target.closest ? e.target.closest('.hint-btn') : null;
  if (!b) return;
  const key = b.dataset.hint;
  if (key === 'totp') {
    const modal = b.closest('.modal-mask');
    const ownerEl = modal ? (modal.querySelector('#f-owner') || modal.querySelector('#mf-owner')) : null;
    openTotpGuideModal(ownerEl ? ownerEl.value : ''); // 打开瞬间快照，不实时刷新
    return;
  }
  const h = PB_HINTS[key];
  if (h) openHintModal(h.title, h.body);
});
/* ===================== v4.0.0 扫码进出 ===================== */
/* 依赖：lib/jsQR.js（解码）、lib/qrcode-generator.js（出码）、qr.js（PassQR） */

// 通用扫码浮层：相机取景 + 相册选图；onText(text) 返回 true 且 continuous 时继续扫
function openScanOverlay(onText, opts = {}) {
  const continuous = !!opts.continuous;
  let scanner = null, closed = false;
  const html = `
    <div class="modal-head"><h3>${escapeHtml(opts.title || '扫码')}</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" x2="19" y1="5" y2="19"/><line x1="19" x2="5" y1="5" y2="19"/></svg></button>
    </div>
    <div class="modal-body" style="text-align:center">
      <div class="scan-frame"><video id="scan-video" autoplay muted playsinline style="width:100%;max-width:340px;border-radius:10px;background:#0b0e14"></video></div>
      <p class="hint" id="scan-status" style="margin:10px 0">对准二维码（${continuous ? '连续模式：识别一张后自动继续' : '识别后自动回填'}）</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn" id="scan-album" type="button">相册选图</button>
        <button class="btn primary" data-close type="button">完成</button>
      </div>
      <input type="file" id="scan-file" accept="image/*" class="hidden" />
    </div>`;
  const closeIt = openOverlayModal(html, false, () => {
    closed = true;
    if (scanner) scanner.stop();
  });
  if (closed) return;
  const handle = async (text) => {
    if (!text) { toast('未识别到二维码'); return; }
    const keep = await Promise.resolve(onText(text));
    if (continuous && !keep && !closed) {
      // 未入库（跳过）——重启相机继续
      scanner = PassQR.scanFromVideo($('#scan-video'), handle, (e) => {
        toast('相机不可用：' + (e && e.name ? e.name : '未知错误'));
      });
    }
  };
  scanner = PassQR.scanFromVideo($('#scan-video'), handle, (e) => {
    const msg = e && e.name === 'NotAllowedError' ? '相机权限被拒绝，请在系统设置中允许'
      : e && e.name === 'NotFoundError' ? '未找到相机设备'
        : '相机不可用：' + (e && e.name ? e.name : '未知错误');
    toast(msg);
  });
  $('#scan-album').addEventListener('click', () => $('#scan-file').click());
  $('#scan-file').addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const t = await PassQR.scanFromImage(file);
    if (t) { if (continuous) { await handle(t); } else { closeIt(); await onText(t); } }
    else toast('图片中未识别到二维码');
  });
  return closeIt;
}

// ① TOTP 扫码录入（手动录入/编辑两处 [data-totp-scan]）
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-totp-scan]');
  if (!btn) return;
  const input = btn.closest('label')?.querySelector('input');
  if (!input) return;
  openScanOverlay(async (text) => {
    const r = PassQR.parseQrPayload(text);
    let fill = '';
    if (r.level === 'otpauth') {
      fill = text.trim();
      // issuer 带回所属（若空）
      const owner = input.closest('.modal')?.querySelector('#f-owner, #mf-owner');
      if (owner && !owner.value.trim() && r.totp.issuer) owner.value = r.totp.issuer;
      toast('已识别 otpauth（签发方 ' + (r.totp.issuer || '未知') + '）');
    } else if (/^[A-Z2-7 =]{8,}$/i.test(text.trim())) {
      fill = text.trim();
      toast('已识别 Base32 密钥');
    } else {
      toast('不是 TOTP 二维码（' + levelName(r.level) + '），未回填');
      return;
    }
    input.value = fill;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { title: '扫码获取 TOTP' });
});
function levelName(l) {
  return { migrate: '密码本迁移码', share: '分享卡片', otpauth: 'TOTP', url: '网址', text: '纯文本', empty: '空' }[l] || l;
}

// ② 条目 → 二维码（分享 / 迁移）
async function openEntryQrModal(item) {
  let mode = 'share';
  const render = () => {
    const text = mode === 'share' ? PassQR.buildShareCard(item) : PassQR.packMigrate(item);
    const q = PassQR.encodeQR(text, 300);
    const el = $('#qr-preview');
    if (el) { el.src = q.dataUrl; el.dataset.payload = text; }
    const cap = $('#qr-mode-cap');
    if (cap) cap.textContent = mode === 'share' ? '分享模式：人类可读卡片（含明文密码）' : '迁移模式：PASSBOOK 载荷（全字段，机器可读）';
  };
  openOverlayModal(`
    <div class="modal-head"><h3>条目二维码</h3>
      <button class="modal-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" x2="19" y1="5" y2="19"/><line x1="19" x2="5" y1="5" y2="19"/></svg></button>
    </div>
    <div class="modal-body" style="text-align:center">
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:10px">
        <button class="btn ${mode === 'share' ? 'primary' : ''}" id="qr-mode-share" type="button">分享模式</button>
        <button class="btn ${mode === 'migrate' ? 'primary' : ''}" id="qr-mode-migrate" type="button">迁移模式</button>
      </div>
      <img id="qr-preview" alt="二维码预览" style="width:280px;height:280px;image-rendering:pixelated;border:1px solid var(--line);border-radius:8px" />
      <p class="hint" id="qr-mode-cap" style="margin:8px 0"></p>
      <p class="hint danger-text" style="margin:8px 0">⚠ 明文二维码 = 密码裸奔，请当面扫码、阅后即焚</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn" id="qr-save" type="button">保存图片</button>
        <button class="btn" id="qr-copy" type="button">复制图片</button>
      </div>
    </div>`, true);
  render();
  $('#qr-mode-share').addEventListener('click', () => { mode = 'share'; syncModeBtns(); render(); });
  $('#qr-mode-migrate').addEventListener('click', () => { mode = 'migrate'; syncModeBtns(); render(); });
  function syncModeBtns() {
    $('#qr-mode-share').className = 'btn' + (mode === 'share' ? ' primary' : '');
    $('#qr-mode-migrate').className = 'btn' + (mode === 'migrate' ? ' primary' : '');
  }
  $('#qr-save').addEventListener('click', async () => {
    try {
      const dataUrl = $('#qr-preview').src;
      const bin = atob(dataUrl.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const name = 'passbook-qr-' + (item.owner || 'entry').replace(/[\\/:*?"<>|]/g, '_') + '.png';
      if (window.__passbook_saf) await androidSafSave(bytes, name);
      else downloadBlob(new Blob([bytes], { type: 'image/png' }), name);
    } catch (err) { console.error(err); toast('保存失败'); }
  });
  $('#qr-copy').addEventListener('click', async () => {
    try {
      const blob = await (await fetch($('#qr-preview').src)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('图片已复制');
    } catch { toast('此环境不支持复制图片，请用保存图片'); }
  });
}

// ③ 扫码填写（手动录入弹窗，五级识别）
function scanFillStart() {
  openScanOverlay(async (text) => {
      const r = PassQR.parseQrPayload(text);
      const F = { owner: $('#mf-owner'), account: $('#mf-account'), password: $('#mf-password'), url: $('#mf-url'), note: $('#mf-note'), totp: $('#mf-totp'), cat: $('#mf-category') };
      const put = (k, v) => { if (F[k] && v != null && String(v).length) F[k].value = v; };
      if (r.level === 'migrate' || r.level === 'share') {
        const e = r.entry;
        put('owner', e.owner); put('account', e.account); put('password', e.password);
        put('url', e.url); put('note', e.note); put('cat', e.category);
        put('totp', e.totp_secret);
        toast('已按' + (r.level === 'migrate' ? '迁移码' : '分享卡片') + '填写全部字段');
      } else if (r.level === 'otpauth') {
        put('totp', text.trim());
        if (!F.owner.value.trim()) put('owner', r.totp.issuer);
        toast('已识别 TOTP');
      } else if (r.level === 'url') {
        put('url', r.url);
        toast('已填入网址');
      } else {
        put('note', ((F.note.value ? F.note.value + '\n' : '') + r.text));
        toast('纯文本已追加到备注');
      }
    }, { title: '扫码填写（迁移码/分享卡片/TOTP/网址/文本）' });
}

// ③' 扫码导入（连续，仅迁移码/分享卡片入库）
async function scanImportStart() {
  {
    let n = 0;
    const counter = $('#scan-import-count');
    counter.textContent = '已导入 0 条';
    openScanOverlay(async (text) => {
      const r = PassQR.parseQrPayload(text);
      if (r.level === 'migrate' || r.level === 'share') {
        const e = r.entry;
        await store.create({
          owner: e.owner || '', account: e.account || '', password: e.password || '',
          url: e.url || '', category: e.category || '', note: e.note || '',
          totp_secret: e.totp_secret || '', fav: e.fav || 0,
        });
        n++;
        counter.textContent = '已导入 ' + n + ' 条（最近：' + ((e.owner || '') + ' / ' + (e.account || '')).trim() + '）';
        toast('已导入：' + (e.owner || e.account || '条目'));
        await refreshList(); await refreshSidebar();
      } else {
        toast(levelName(r.level) + '，跳过（仅支持迁移码/分享卡片）');
      }
      return false; // continuous 由浮层自行重启
    }, { title: '扫码导入（连续）', continuous: true });
  }
}

// v4.0.2：document 级事件委托（与 TOTP 扫码同款模式，不依赖 openModal 重包装时机）
document.addEventListener('click', (e) => {
  try {
    if (e.target.closest('#mf-scan-fill')) scanFillStart();
    else if (e.target.closest('#scan-import-start')) scanImportStart();
    else if (e.target.closest('#browser-drop')) browserPickFile(); // v4.1.0：浏览器导入选文件（委托，动态弹窗按钮勿直绑）
  } catch (err) {
    console.error(err);
    toast('扫码启动失败：' + (err && err.message ? err.message : '未知错误'), true);
  }
});

// v4.1.0：浏览器导入 change/dragover/drop 也走 document 委托（弹窗重建后仍生效）
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'browser-input' && e.target.files && e.target.files[0]) {
    browserImportHandleFile(e.target.files[0]);
    e.target.value = '';
  }
});
document.addEventListener('dragover', (e) => {
  const d = e.target.closest && e.target.closest('#browser-drop');
  if (d) { e.preventDefault(); d.classList.add('drag'); }
});
document.addEventListener('dragleave', (e) => {
  const d = e.target.closest && e.target.closest('#browser-drop');
  if (d) d.classList.remove('drag');
});
document.addEventListener('drop', (e) => {
  const d = e.target.closest && e.target.closest('#browser-drop');
  if (!d) return;
  e.preventDefault();
  d.classList.remove('drag');
  if (e.dataTransfer && e.dataTransfer.files[0]) browserImportHandleFile(e.dataTransfer.files[0]);
});