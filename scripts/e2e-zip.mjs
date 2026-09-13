// E2E：mock Tauri 环境下验证「文件仓 zip 导出 → 导入」整条管线（浏览器跑应用级逻辑）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';

const PROJ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3992, CD = 3993;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const log = (m) => console.log('[zip-e2e] ' + m);

/* 1) Node 侧构造文件仓 zip（模拟另一端导出：1 个文件 + manifest） */
globalThis.window = globalThis;
const fsx = await import('node:fs');
(0, eval)(fsx.readFileSync(new URL('../public/filehub.js', import.meta.url), 'utf8'));
const PassFiles = globalThis.window.PassFiles;
const enc = new TextEncoder();
const sha = 'a1'.padEnd(64, '0');
const manifest = {
  app: 'passbook', kind: 'filehub-export', version: 1, exported_at: new Date().toISOString(),
  files_salt: 'QUJDRA==',
  files: [{ name: '迁移文档.pdf', mime: 'application/pdf', size: 5, sha256: sha, source: 'saf', tags: '工作', note: '跨端迁移测试', created_at: new Date().toISOString() }],
};
const zipBytes = PassFiles.buildZip([
  { name: 'manifest.json', bytes: enc.encode(JSON.stringify(manifest)) },
  { name: 'blobs/' + sha, bytes: new Uint8Array([9, 8, 7, 6, 5]) },
]);
const ZIP_B64 = Buffer.from(zipBytes).toString('base64');
log('zip 已构造 ' + zipBytes.length + 'B');

/* 2) 服务器 + Edge，注入 __TAURI__ mock（在 app.js 之前） */
const DATA_DIR = join(PROJ, 'data');
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const srv = spawn('node', ['server.mjs', '--port', String(PORT), '--no-open'], { cwd: PROJ, stdio: 'ignore', env: { ...process.env, DATA_DIR } });
for (let i = 0; i < 30; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); if (r.ok) break; } catch {} await sleep(300); }
const PROFILE = join(DATA_DIR, '.zipe2e-' + Date.now());
const edg = spawn(EDGE, [`--remote-debugging-port=${CD}`, '--headless=new', '--disable-crash-reporter', '--noerrdialogs', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-sandbox', '--user-data-dir=' + PROFILE, 'about:blank'], { stdio: 'ignore' });
{
  const { execSync } = await import('node:child_process');
  let out = ''; try { out = execSync(`netstat -ano | findstr ":${CD}" | findstr "LISTENING"`, { shell: 'cmd.exe' }).toString(); } catch {}
  for (const pid of [...new Set(out.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter(Boolean))]) {
    try { const cp = execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`, { shell: 'cmd.exe' }).toString(); if (/remote-debugging-port/.test(cp) && /headless/.test(cp)) execSync(`taskkill /F /T /PID ${pid}`, { shell: 'cmd.exe' }); } catch {}
  }
}
let list = null; for (let i = 0; i < 20 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${CD}/json`)).json(); } catch {} if (!list) await sleep(500); }
const page = list.find((t) => t.type === 'page') || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.onopen = r);
let id = 0; const pend = {};
ws.onmessage = (raw) => { const m = JSON.parse(raw.data); if (m.id && pend[m.id]) { clearTimeout(pend[m.id].t); pend[m.id].res(m); delete pend[m.id]; } };
const send = (method, params = {}, to = 15000) => new Promise((res, rej) => { const i = ++id; const t = setTimeout(() => { delete pend[i]; rej(new Error('超时 ' + method)); }, to); pend[i] = { res, t }; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

// mock __TAURI__：先于应用脚本注入
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__TAURI__ = { core: { invoke: async function (cmd, args) {
    args = args || {};
    if (cmd === 'get_default_db_path') return 'C:\\\\mock\\\\passwords.db';
    if (cmd === 'read_db_file_b64') return null;
    if (cmd === 'write_db_file_b64') { window.__MOCK_DB = args.b64; return null; }
    if (cmd === 'pick_files') { window.__PICKED = true; return [{ name: 'passbook-filehub-e2e.zip', path: 'C:\\\\mock\\\\pick.zip', size: ${zipBytes.length} }]; }
    if (cmd === 'read_file_bytes_b64') { if (!window.__ZIP_B64) throw new Error('mock: zip 未注入'); return window.__ZIP_B64; }
    if (cmd === 'store_blob_exists') return !!(window.__BLOBS || {})[args.sha256];
    if (cmd === 'store_blob_write_b64') { window.__BLOBS = window.__BLOBS || {}; window.__BLOBS[args.sha256] = args.b64; return null; }
    if (cmd === 'store_blob_read_b64') return (window.__BLOBS || {})[args.sha256] || null;
    if (cmd === 'store_blob_list') return Object.keys(window.__BLOBS || {});
    if (cmd === 'store_blob_delete') { if (window.__BLOBS) delete window.__BLOBS[args.sha256]; return null; }
    if (cmd === 'delete_file') return null;
    throw new Error('mock 未实现命令: ' + cmd);
  } } };
` });
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(2500);
// 清 SW + 重载 + 注入 zip 字节
await ev("(async function(){try{var rs=await navigator.serviceWorker.getRegistrations();for(var r of rs)await r.unregister();var ks=await caches.keys();for(var k of ks)await caches.delete(k);}catch(e){}return 1})()");
await ev(`window.__ZIP_B64 = ${JSON.stringify(ZIP_B64)}; 1`);
await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(5000);
// 注入 zip（addScript 在导航间保留；__ZIP_B64 需重设）
await ev(`window.__ZIP_B64 = ${JSON.stringify(ZIP_B64)}; 1`);
log('环境就绪 mode=' + await ev("(typeof currentMode!=='undefined'?currentMode:'?')") + ' tauri=' + await ev('!!window.__TAURI__'));

/* 3) 走 UI：导入弹窗 → 文件仓 zip tab → 选择 zip 文件 → 断言 */
await ev('openImportModal()'); await sleep(400);
await ev("document.querySelector('.import-tabs [data-tab=zip]').click()"); await sleep(300);
log('zip tab 可见: ' + await ev("!document.querySelector('#tab-zip').classList.contains('hidden')"));
await ev("document.querySelector('#zip-import-pick').click()");
await sleep(2000);
log('info 文案: ' + await ev("(document.querySelector('#zip-import-info')?.textContent||'').slice(0,120)"));
log('toast: ' + await ev("(document.querySelector('#toast-root')?.textContent||'').slice(0,120)"));
await ev('setView && setView("files")'); await sleep(600);
log('文件卡片数: ' + await ev("document.querySelectorAll('.file-card').length") + '（期望 1）');
log('文件名: ' + await ev("(document.querySelector('.file-card .note-title')?.textContent||'')"));
log('blob 落桶: ' + await ev("JSON.stringify(Object.keys(window.__BLOBS||{}))"));

/* ---- 场景 2：判重语义验证（同 zip 二次导入 / 同名不同内容） ---- */
async function tryImport(zipB64, label) {
  await ev(`window.__ZIP_B64 = ${JSON.stringify(zipB64)}; 1`);
  await ev('openImportModal && openImportModal()'); await sleep(300);
  await ev("document.querySelector('.import-tabs [data-tab=zip]')?.click()"); await sleep(200);
  await ev("document.querySelector('#zip-import-pick')?.click()"); await sleep(1800);
  log(label + ' → info: ' + await ev("(document.querySelector('#zip-import-info')?.textContent||'').slice(0,100)"));
  await ev('closeModal && closeModal()'); await sleep(200);
}
const mkZip = (contentTag) => {
  const m2 = { ...manifest, files: manifest.files.map((f) => ({ ...f, sha256: contentTag.padEnd(64, '0').slice(0, 64), size: 6 })) };
  return Buffer.from(PassFiles.buildZip([
    { name: 'manifest.json', bytes: enc.encode(JSON.stringify(m2)) },
    { name: 'blobs/' + contentTag.padEnd(64, '0').slice(0, 64), bytes: new Uint8Array([1, 2, 3, 4, 5, 6]) },
  ])).toString('base64');
};
await ev("window.__BLOBS = {}"); // 模拟本体丢失（行在桶丢的脏状态）
await tryImport(ZIP_B64, '同 zip 二次导入+本体丢失');
log('本体自愈: ' + await ev("JSON.stringify(Object.keys(window.__BLOBS||{}))") + '（期望补写 1 个）');
await tryImport(mkZip('bb'), '同名不同内容（sha 变）');
log('累计卡片: ' + await ev("document.querySelectorAll('.file-card').length") + '（期望 2：首导 1 + 同名不同内容 1）');

/* ---- 场景 3（v4.7.0）：异密钥导出的 zip → 弹钥 → 填钥 → 重加密迁移落桶 ---- */
// Node 侧用「另一把密钥」加密本体，模拟导出端启用过加密、材料与本机不同
(0, eval)(fsx.readFileSync(new URL('../public/db-crypto.js', import.meta.url), 'utf8'));
const DbCrypto = globalThis.window.DbCrypto;
const SALT = Buffer.from('QUJDRA==', 'base64'); // 与 manifest.files_salt 一致
const exporterKey = await DbCrypto.deriveKey('导出端密钥e2e', SALT);
const plain = new Uint8Array([1, 2, 3, 4, 5, 6]);
const encBlob = await DbCrypto.encryptBytes(plain, exporterKey, SALT);
const shaX = 'cc'.padEnd(64, '0');
const manifestX = {
  ...manifest,
  files: [{ name: '异密钥导出.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: plain.length, sha256: shaX, source: 'saf', tags: '迁移', note: '异密钥场景', created_at: new Date().toISOString() }],
};
const zipX = Buffer.from(PassFiles.buildZip([
  { name: 'manifest.json', bytes: enc.encode(JSON.stringify(manifestX)) },
  { name: 'blobs/' + shaX, bytes: encBlob },
])).toString('base64');
await ev(`window.__ZIP_B64 = ${JSON.stringify(zipX)}; 1`);
await ev('openImportModal && openImportModal()'); await sleep(300);
await ev("document.querySelector('.import-tabs [data-tab=zip]')?.click()"); await sleep(200);
await ev("document.querySelector('#zip-import-pick')?.click()");
await sleep(1500);
// 断言：弹出了 z660 密钥输入框（promptKeyInput），文案指向导出端密钥
const keyVisible = await ev("(function(){var m=[].slice.call(document.querySelectorAll('.modal-mask')).filter(function(x){return (x.style.zIndex||'')==='660'});return {n:m.length,hint:(m[0]&&m[0].querySelector('.hint')||{}).textContent||''}})()");
log('密钥弹窗: ' + JSON.stringify(keyVisible));
const keyInput = await ev("(function(){var m=[].slice.call(document.querySelectorAll('.modal-mask')).filter(function(x){return (x.style.zIndex||'')==='660'})[0];if(!m)return false;m.querySelector('input').value='导出端密钥e2e';m.querySelector('[data-x=ok]').click();return true})()");
log('已填钥确认: ' + keyInput);
await sleep(2500);
const blobX = await ev(`(window.__BLOBS||{})['${shaX}'] || ''`);
log('落桶迁移: ' + (blobX ? '已写入 ' + blobX.length + 'B（原文 ' + Buffer.from(encBlob).toString('base64').length + 'B）' : '未落桶'));
log('落桶内容已重加密(≠导出端密文): ' + (blobX && blobX !== Buffer.from(encBlob).toString('base64')));
log('info 文案: ' + await ev("(document.querySelector('#zip-import-info')?.textContent||'').slice(0,140)"));
// 用本机密钥解回：vaultReadBytes 走本机 vaultEnsureCrypto 派生密钥
const roundTrip = await ev(`(async function(){try{var b=await vaultReadBytes('${shaX}');return Array.from(b).join(',')}catch(e){return 'ERR:'+e.message}})()`);
log('本机密钥解回: ' + roundTrip + '（期望 1,2,3,4,5,6）');
await ev('closeModal && closeModal()'); await sleep(200);
await ev('setView && setView("files")'); await sleep(600);
log('累计卡片: ' + await ev("document.querySelectorAll('.file-card').length") + '（期望 3）');
log('迁移文件卡片: ' + await ev("[].slice.call(document.querySelectorAll('.file-card .note-title')).map(function(x){return x.textContent}).join(' | ')"));

ws.close();
for (const p of [edg, srv]) { try { p.kill(); } catch {} }
try { (await import('node:child_process')).execSync(`taskkill /F /T /PID ${edg.pid} & taskkill /F /T /PID ${srv.pid}`, { shell: 'cmd.exe', stdio: 'ignore' }); } catch {}
process.exit(0);
