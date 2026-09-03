#!/usr/bin/env node
/** 调试：headless 打开应用页面，取回页面文本与 console 错误 */
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJ = join(__dirname, '..');
const DATA_DIR = join(PROJ, 'data');
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => { try { existsSync(p); return true; } catch { return false; } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const port = 3966, cdPort = port + 1;
  const url = `http://127.0.0.1:${port}/#shot-bare`;
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.mjs', '--port', String(port), '--no-open'], { cwd: PROJ, stdio: 'ignore', env: { ...process.env, DATA_DIR } });
  for (let i = 0; i < 30; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch {} await sleep(300); }
  // 写一条演示
  await fetch(`http://127.0.0.1:${port}/api/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: 'GitHub', account: 'tom@example.com', password: 'Xk9$mQ2zLp7', category: '工作' }) });

  const edg = spawn(EDGE, [`--remote-debugging-port=${cdPort}`, '--headless=new', '--disable-gpu', '--disable-crash-reporter', '--noerrdialogs', '--no-sandbox', '--user-data-dir=' + join(DATA_DIR, '.edge-profile'), 'about:blank'], { stdio: 'ignore' });
  await sleep(2000);
  const list = await (await fetch(`http://127.0.0.1:${cdPort}/json`)).json();
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  let id = 0; const pending = {};
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) pending[m.id](m); };
  await new Promise((r) => ws.onopen = r);
  const send = (method, params = {}) => { id++; return new Promise((res) => { pending[id] = res; ws.send(JSON.stringify({ id, method, params })); }); };

  const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled') events.push('[console.' + m.params.type + '] ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
    if (m.method === 'Runtime.exceptionThrown') events.push('[exception] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 300));
    if (m.method === 'Log.entryAdded') events.push('[log] ' + m.params.entry.text.slice(0, 200));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  console.log('导航…');
  await send('Page.navigate', { url });
  await sleep(5000);
  console.log('== console/异常 ==');
  events.forEach((l) => console.log(l));
  if (!events.length) console.log('(无)');
  const dom = await send('Runtime.evaluate', { expression: 'document.body ? document.body.innerText.slice(0, 800) : "(无 body)"', returnByValue: true });
  console.log('== body.innerText ==');
  console.log(dom.result?.result?.value || '(空)');
  const mode = await send('Runtime.evaluate', { expression: '(window.currentMode || "?")', returnByValue: true });
  console.log('currentMode =', mode.result?.result?.value);
  const touch = await send('Runtime.evaluate', { expression: 'JSON.stringify({maxTouchPoints: navigator.maxTouchPoints, hasTouchStart: ("ontouchstart" in window), userAgent: navigator.userAgent.slice(0,60)})', returnByValue: true });
  console.log('touch 检测 =', touch.result?.result?.value);
  const settings = await send('Runtime.evaluate', { expression: 'JSON.stringify((window.loadSettings && loadSettings()) || "?")', returnByValue: true });
  console.log('settings =', settings.result?.result?.value);
  ws.close(); edg.kill(); srv.kill();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });