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

ws.close();
for (const p of [edg, srv]) { try { p.kill(); } catch {} }
try { (await import('node:child_process')).execSync(`taskkill /F /T /PID ${edg.pid} & taskkill /F /T /PID ${srv.pid}`, { shell: 'cmd.exe', stdio: 'ignore' }); } catch {}
process.exit(0);
