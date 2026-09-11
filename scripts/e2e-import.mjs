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
  for (let i = 1; i <= 3; i++) db.run('INSERT INTO entries (owner,account,password,category,totp_secret,fav,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', [`站${i}`, `u${i}@x.com`, `pw${i}`, '工作,测试', i === 1 ? 'JBSWY3DPEHPK3PXP' : '', i <= 2 ? 1 : 0, new Date().toISOString(), new Date().toISOString()]);
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
/* 端口守卫（同 shot-cdp 教训）：被上轮残留 headless Edge 占用时，新实例绑不上调试端口，
   CDP 会连到旧实例+旧数据上——全部断言失真。只精准清理 remote-debugging-port 特征进程。 */
{
  const { execSync } = await import('node:child_process');
  let out = '';
  try { out = execSync(`netstat -ano | findstr ":${CD}" | findstr "LISTENING"`, { shell: 'cmd.exe' }).toString(); } catch { /* 空即空闲 */ }
  for (const pid of [...new Set(out.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter(Boolean))]) {
    try {
      const cp = execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`, { shell: 'cmd.exe' }).toString();
      if (/remote-debugging-port/.test(cp) && /headless/.test(cp)) { console.log('[e2e] 清理残留 headless Edge PID ' + pid); execSync(`taskkill /F /T /PID ${pid}`, { shell: 'cmd.exe' }); }
    } catch { /* 忽略 */ }
  }
}
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
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); // v4.6.3：禁 HTTP 缓存——曾吃到旧版 app.js 导致探针时有时无

// 本地空库 + 打开导入弹窗 → file tab
log('打开应用（本地空库）…');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(4500);
await ev("(function(){var s={};try{s=JSON.parse(localStorage.getItem('passbook-settings')||'{}')}catch(e){}s.storageMode='local';localStorage.setItem('passbook-settings',JSON.stringify(s));return 1})()");
// 清 SW 旧缓存（脚本请求是 cache-first，不清会跑到旧版 app.js——曾致 e2e 误报）
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(2500);
await ev("(async function(){try{var rs=await navigator.serviceWorker.getRegistrations();for(var r of rs)await r.unregister();var ks=await caches.keys();for(var k of ks)await caches.delete(k);}catch(e){}return 1})()");
await send('Page.navigate', { url: 'about:blank' });
await sleep(400);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(5000);
log('当前模式: ' + await ev("(typeof currentMode!=='undefined')?currentMode:'?'"));
log('调试出口: ' + await ev("!!window.__PB_DEBUG"));
log('boot基线库内: ' + await ev("JSON.stringify(window.__PB_DEBUG.entries()||[])"));
log('boot基线localStorage: ' + await ev("JSON.stringify(Object.keys(localStorage))"));
log('boot基线原始db存在: ' + await ev("(async function(){try{var db=await new Promise((res,rej)=>{var r=indexedDB.open('passbook-db');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});var tx=db.transaction(['kv'],'readonly');var g=tx.objectStore('kv').get('db');var buf=await new Promise((res)=>{g.onsuccess=()=>res(g.result)});return buf?('YES '+buf.byteLength+'B'):'NO-VAL'}catch(e){return 'ERR '+e.message}})()"));
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
log('选文件后库内: ' + await ev("JSON.stringify(window.__PB_DEBUG.entries()||[])"));
log('选择后 file-info: ' + await ev("document.querySelector('#file-info')?.textContent || ''"));
log('预览: ' + await ev("(document.querySelector('#import-preview')?.textContent || '').split('\\n')[0]"));
// 密钥弹窗（promptKeyInput 是原生 confirm/prompt？检查）
await sleep(600);
log('密钥弹窗可见: ' + await ev("!!document.querySelector('.modal-mask input[type=password]')"));
log('填钥前库内: ' + await ev("JSON.stringify(window.__PB_DEBUG.entries()||[])"));
await ev(`(function(){var i=document.querySelector('.modal-mask input[type=password]');if(!i)return 'no-input';i.value=${JSON.stringify(KEY_TEXT)};var b=document.querySelector('.modal-mask [data-x=ok]');if(b)b.click();return 'filled'})()`);
await sleep(1800);
log('解锁后 file-info: ' + await ev("document.querySelector('#file-info')?.textContent || ''"));
log('解析预览: ' + await ev("(document.querySelector('#import-preview')?.textContent || '').split('\\n')[0]"));
log('解析字段抽查: ' + await ev("JSON.stringify(window.__PB_DEBUG.parsed())"));
log('点击导入前库内: ' + await ev("JSON.stringify(window.__PB_DEBUG.entries())"))
log('create调用栈: ' + String(await ev("JSON.stringify(window.__PB_DEBUG._creates||[])")).slice(0,700))
log('store/模式: ' + await ev("window.__PB_DEBUG.store()"));
// 点主导入按钮
await ev("document.querySelector('#btn-import-go').click()");
await sleep(1500);
log('导入后条数: ' + await ev("(function(){try{var n=document.querySelectorAll('.entry').length;return 'DOM条目'+n}catch(e){return 'err '+e.message}})()"));
log('entries表列: ' + await ev("JSON.stringify(window.__PB_DEBUG.cols())"))
log('点击导入后的toast: ' + await ev("(document.querySelector('#toast-root')?.textContent||'').slice(0,120)"))
log('importItems收到: ' + await ev("JSON.stringify(window.__PB_DEBUG._imp||[])", ))
log('逐条插后回读: ' + await ev("JSON.stringify(window.__PB_DEBUG._each||[])"))
log('入库后快照: ' + await ev("JSON.stringify(window.__PB_DEBUG._post||[])"))
// v4.6.3：TOTP/收藏 保真验证——有验证码过滤命中 1 条、星标 2 条
await ev("(function(){var i=document.querySelector('#search');if(i){i.value='有验证码';i.dispatchEvent(new Event('input'))}return 1})()");
await sleep(900);
log('有验证码过滤命中: ' + await ev("document.querySelectorAll('.entry').length") + '（期望 1）');
await ev("(function(){var i=document.querySelector('#search');if(i){i.value='';i.dispatchEvent(new Event('input'))}return 1})()");
await sleep(900);
log('星标条数: ' + await ev("document.querySelectorAll('.entry-fav.active').length") + '（期望 2）');
log('库内字段: ' + await ev("JSON.stringify(window.__PB_DEBUG && window.__PB_DEBUG.entries())"));
// zip 导入：直接调 importFilehubZip（绕过文件选择器，验证逻辑与状态）
const zipB64 = fsmod.readFileSync(join(PROJ, 'data-e2e.zip')).toString('base64');
const zr = await ev(`(async function(){try{ if(typeof importFilehubZip!=='function')return 'no fn'; var r=await importFilehubZip(PassFiles?base64ToBytes('${zipB64}'):null);return JSON.stringify(r)}catch(e){return 'ERR '+e.message}})()`);
log('zip 导入结果: ' + zr);
const rawDb = await ev("(async function(){try{var db=await new Promise((res,rej)=>{var r=indexedDB.open('passbook-db');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});var tx=db.transaction(['kv'],'readonly');var st=tx.objectStore('kv');var g=st.get('db');var buf=await new Promise((res)=>{g.onsuccess=()=>res(g.result)});if(!buf)return 'NO-DB';var b=new Uint8Array(buf);var s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s)}catch(e){return 'ERR '+e.message}})()");
if (rawDb && !rawDb.startsWith('ERR') && rawDb !== 'NO-DB') {
  const { writeFileSync } = await import('node:fs');
  writeFileSync('/tmp/pb-e2e-raw.db', Buffer.from(rawDb, 'base64'));
  const vm2 = await import('node:vm');
  // 用 Node 侧 sql.js 验尸
  const dbg = await import('node:fs').then(fsx => fsx.readFileSync(join(PROJ, 'public/lib/sql-wasm.js'), 'utf8'));
  log('raw db 已导出 ' + rawDb.length + 'B (base64)');
}

log('files 验证: ' + await ev("(function(){try{return JSON.stringify({mode:currentMode,fileCards:(function(){setView&&setView('files');return document.querySelectorAll('.file-card').length})()})}catch(e){return 'err '+e.message}})()"));

ws.close();
for (const p of [edg, srv]) { try { p.kill(); } catch {} }
try { await import('node:child_process').then(m => m.execSync(`taskkill /F /T /PID ${edg.pid} & taskkill /F /T /PID ${srv.pid}`, { shell: 'cmd.exe', stdio: 'ignore' })); } catch {}
process.exit(0);
