// E2E 复现：新应用（空 IndexedDB 本地库）导入 加密.db 与 文件仓 zip
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';

const PROJ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(PROJ, 'data');
const PORT = 3988, CD = 3989;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const log = (m) => console.log('[e2e] ' + m);

/* ---------- 1) 构造加密 .db（DbCrypto 体系）与文件仓 zip ---------- */
globalThis.window = globalThis;
const fsmod = await import('node:fs');
const vm = await import('node:vm');
const { createRequire } = await import('node:module');
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
(0, eval)(fsmod.readFileSync(new URL('../public/db-crypto.js', import.meta.url), 'utf8'));
(0, eval)(fsmod.readFileSync(new URL('../public/filehub.js', import.meta.url), 'utf8'));
const DbCrypto = globalThis.window.DbCrypto;
const PassFiles = globalThis.window.PassFiles;
vm.runInThisContext(fsmod.readFileSync(new URL('../public/lib/sql-wasm.js', import.meta.url), 'utf8'), { filename: 'sql-wasm.js' });
const SQL = await globalThis.initSqlJs({ locateFile: (f) => 'public/lib/' + f });

const KEY_TEXT = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const enc = new TextEncoder();
{
  const db = new SQL.Database();
  db.run(`CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT DEFAULT '', account TEXT DEFAULT '', password TEXT DEFAULT '', url TEXT DEFAULT '', category TEXT DEFAULT '', note TEXT DEFAULT '', totp_secret TEXT DEFAULT '', history TEXT DEFAULT '', fav INTEGER DEFAULT 0, created_at TEXT DEFAULT '', updated_at TEXT DEFAULT '')`);
  for (let i = 1; i <= 3; i++) db.run('INSERT INTO entries (owner,account,password,category,created_at,updated_at) VALUES (?,?,?,?,?,?)', [`站${i}`, `u${i}@x.com`, `pw${i}`, '工作,测试', new Date().toISOString(), new Date().toISOString()]);
  const plain = db.export();
  const salt = DbCrypto.newSalt();
  const key = await DbCrypto.deriveKey(KEY_TEXT, salt);
  const final = await DbCrypto.encryptBytes(plain, key, salt);
  writeFileSync(join(PROJ, 'data-e2e-enc.db'), Buffer.from(final));
  // 文件仓 zip：manifest + 一个“加密本体”（随便一段字节模拟）
  const sha = 'e2'.padEnd(64, '0');
  const zip = PassFiles.buildZip([
    { name: 'manifest.json', bytes: enc.encode(JSON.stringify({ app: 'passbook', kind: 'filehub-export', version: 1, exported_at: new Date().toISOString(), files_salt: 'QUJD', files: [{ name: 'E2E测试.pdf', mime: 'application/pdf', size: 5, sha256: sha, source: 'saf', tags: '工作', note: '', created_at: new Date().toISOString() }] })) },
    { name: 'blobs/' + sha, bytes: new Uint8Array([1, 2, 3, 4, 5]) },
  ]);
  writeFileSync(join(PROJ, 'data-e2e.zip'), Buffer.from(zip));
  writeFileSync(join(PROJ, 'data-e2e-key.txt'), KEY_TEXT);
  log('加密 .db 与 zip 已生成（3 条记录 / 1 个文件）');
}

/* ---------- 2) 起服务器 + headless Edge 走 UI ---------- */
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const srv = spawn('node', ['server.mjs', '--port', String(PORT), '--no-open'], { cwd: PROJ, stdio: 'ignore', env: { ...process.env, DATA_DIR } });
for (let i = 0; i < 30; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); if (r.ok) break; } catch {} await sleep(300); }
const PROFILE = join(DATA_DIR, '.e2e-' + Date.now());
const edg = spawn(EDGE, [`--remote-debugging-port=${CD}`, '--headless=new', '--disable-crash-reporter', '--noerrdialogs', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-sandbox', '--user-data-dir=' + PROFILE, 'about:blank'], { stdio: 'ignore' });
let list = null; for (let i = 0; i < 20 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${CD}/json`)).json(); } catch {} if (!list) await sleep(500); }
const page = list.find((t) => t.type === 'page') || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.onopen = r);
let id = 0; const pend = {};
let lastToast = '';
ws.onmessage = (raw) => { const m = JSON.parse(raw.data);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') log('[console.error] ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 160));
  if (m.id && pend[m.id]) { clearTimeout(pend[m.id].t); pend[m.id].res(m); delete pend[m.id]; } };
const send = (method, params = {}, to = 15000) => new Promise((res, rej) => { const i = ++id; const t = setTimeout(() => { delete pend[i]; rej(new Error('超时 ' + method)); }, to); pend[i] = { res, t }; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');

// 本地空库 + 打开导入弹窗 → file tab
log('打开应用（本地空库）…');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(4500);
await ev("(function(){var s={};try{s=JSON.parse(localStorage.getItem('passbook-settings')||'{}')}catch(e){}s.storageMode='local';localStorage.setItem('passbook-settings',JSON.stringify(s));return 1})()");
await send('Page.navigate', { url: 'about:blank' });
await sleep(400);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(5000);
log('当前模式: ' + await ev("(typeof currentMode!=='undefined')?currentMode:'?'"));
await ev('openImportModal()');
await sleep(400);
await ev("document.querySelector('.import-tabs [data-tab=file]').click()");
await sleep(300);
log('file tab 就绪: ' + await ev("!!document.querySelector('#tab-file') && !document.querySelector('#tab-file').classList.contains('hidden')"));

// 用 DOM.setFileInputFiles 给 #file-input 挂真实加密 .db
const { root } = (await send('DOM.getDocument')).result;
const nodeId = (await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#file-input' })).result.nodeId;
await send('DOM.setFileInputFiles', { files: ['D:\\hobby\\源码\\密码本\\data-e2e-enc.db'], nodeId });
await ev("document.querySelector('#file-input').dispatchEvent(new Event('change'))");
await sleep(1200);
log('选择后 file-info: ' + await ev("document.querySelector('#file-info')?.textContent || ''"));
log('预览: ' + await ev("(document.querySelector('#import-preview')?.textContent || '').split('\\n')[0]"));
// 密钥弹窗（promptKeyInput 是原生 confirm/prompt？检查）
await sleep(600);
log('密钥弹窗可见: ' + await ev("!!document.querySelector('.modal-mask input[type=password]')"));
await ev(`(function(){var i=document.querySelector('.modal-mask input[type=password]');if(!i)return 'no-input';i.value=${JSON.stringify(KEY_TEXT)};var b=document.querySelector('.modal-mask [data-x=ok]');if(b)b.click();return 'filled'})()`);
await sleep(1800);
log('解锁后 file-info: ' + await ev("document.querySelector('#file-info')?.textContent || ''"));
log('解析预览: ' + await ev("(document.querySelector('#import-preview')?.textContent || '').split('\\n')[0]"));
// 点主导入按钮
await ev("document.querySelector('#btn-import-go').click()");
await sleep(1500);
log('导入后条数: ' + await ev("(function(){try{var n=document.querySelectorAll('.entry').length;return 'DOM条目'+n}catch(e){return 'err '+e.message}})()"));
// zip 导入：直接调 importFilehubZip（绕过文件选择器，验证逻辑与状态）
const zipB64 = fsmod.readFileSync(join(PROJ, 'data-e2e.zip')).toString('base64');
const zr = await ev(`(async function(){try{ if(typeof importFilehubZip!=='function')return 'no fn'; var r=await importFilehubZip(PassFiles?base64ToBytes('${zipB64}'):null);return JSON.stringify(r)}catch(e){return 'ERR '+e.message}})()`);
log('zip 导入结果: ' + zr);
log('files 验证: ' + await ev("(function(){try{return JSON.stringify({mode:currentMode,fileCards:(function(){setView&&setView('files');return document.querySelectorAll('.file-card').length})()})}catch(e){return 'err '+e.message}})()"));

ws.close();
for (const p of [edg, srv]) { try { p.kill(); } catch {} }
try { await import('node:child_process').then(m => m.execSync(`taskkill /F /T /PID ${edg.pid} & taskkill /F /T /PID ${srv.pid}`, { shell: 'cmd.exe', stdio: 'ignore' })); } catch {}
process.exit(0);
