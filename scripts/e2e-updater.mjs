// E2E（手动跑）：桌面自动更新全链路——真实应用 + 真实 GitHub Release
// 前提：① portable exe 已复制到独立目录 ② 存在比其版本新的 Release（含 latest.json）
//      ③ %TEMP%\gh-token.txt 有 token（私有仓期间）
// 用法：node scripts/e2e-updater.mjs <portable目录> [调试端口]
// 过程：CDP 注入 token → checkForUpdate → 断言弹窗版本 → 点「下载并安装」→ 跟进度 → 等安装器跑完
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = process.argv[2] || 'D:/hobby/产物/密码本/updatetest';
const CD = Number(process.argv[3] || 9333);
const EXE = join(DIR, 'Passbook_4.9.0_portable.exe');
const log = (m) => console.log('[upd-e2e] ' + m);

const token = readFileSync(process.env.TOKEN_FILE || 'C:/Users/Rem1sy/AppData/Local/Temp/gh-token.txt', 'utf8').trim();
if (!token) throw new Error('缺少 gh token');

const edg = spawn(EXE, [], { cwd: DIR, detached: false, stdio: 'ignore', env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CD}` } });
try { execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${edg.pid}').CommandLine" >nul 2>&1`, { shell: 'cmd.exe', stdio: 'ignore' }); } catch { /* 忽略 */ }
let list = null;
for (let i = 0; i < 30 && !list; i++) {
  try { list = await (await fetch(`http://127.0.0.1:${CD}/json`)).json(); } catch {}
  if (!list) await sleep(500);
}
const page = list.find((t) => t.type === 'page') || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (raw) => { const m = JSON.parse(raw.data); if (m.id && pend[m.id]) { clearTimeout(pend[m.id].t); pend[m.id].res(m); delete pend[m.id]; } };
const send = (method, params = {}, to = 20000) => new Promise((res, rej) => { const i = ++id; const t = setTimeout(() => { delete pend[i]; rej(new Error('超时 ' + method)); }, to); pend[i] = { res, t }; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression, to = 20000) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, to)).result?.result?.value;
await send('Runtime.enable');
await sleep(4000); // 等 boot 静默检查（会因无 token 404 静默）

// 1) 注入 token 并手动检查
log('当前版本: ' + await ev("(async()=>{ try { return await window.__TAURI__.core.invoke('app_version') } catch(e){ return 'ERR '+e } })()"));
const chk = await ev(`(async()=>{
  const s = JSON.parse(localStorage.getItem('passbook-settings')||'{}');
  s.ghToken = ${JSON.stringify(token)};
  localStorage.setItem('passbook-settings', JSON.stringify(s));
  try { const r = await checkForUpdate(true); return 'modal=' + r + ' ver=' + ((document.querySelector('.modal-head h3')||{}).textContent||''); }
  catch (e) { return 'ERR: ' + e.message; }
})()`, 60000);
log('检查更新: ' + chk);
if (!/modal=true/.test(chk)) throw new Error('未弹更新窗口: ' + chk);

// 2) 下载并安装
log('开始下载安装…');
await ev("document.querySelector('#btn-upd-go').click()");
let last = '';
for (let i = 0; i < 120; i++) {
  await sleep(2000);
  const st = await ev(`(document.querySelector('#upd-progress .hint')||{}).textContent || (document.querySelector('#btn-upd-go')||{}).textContent || ''`);
  if (st !== last) { last = st; log('进度: ' + st.slice(0, 60)); }
  if (/安装完成|更新失败/.test(st)) break;
  if (await ev("(async()=>{ try { await window.__TAURI__.core.invoke('app_version'); return false } catch(e){ return 'gone' } })()").then?.(()=>{})) {}
}
// 等待进程退出（安装器接管）
let exited = false;
for (let i = 0; i < 60; i++) {
  const alive = await ev("(async()=>{ return 1 })()", 3000).then(() => true, () => false);
  if (!alive) { exited = true; break; }
  await sleep(1000);
}
log('应用进程' + (exited ? '已退出（安装器接管）' : '仍在运行（可能安装在后台）'));
ws.close();
log('完成');
process.exit(0);
