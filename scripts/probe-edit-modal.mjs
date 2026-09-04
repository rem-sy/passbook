// 探针2：手机视口下「保存到密码本」vs「手动录入」输入框宽度（独立导航，避免 history 竞态）
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
const PROJ = 'D:/hobby/源码/密码本';
const DATA_DIR = join(PROJ, 'data');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 3947, cdPort = 3948;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(DATA_DIR, { recursive: true, force: true });
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.mjs', '--port', String(port), '--no-open'], { cwd: PROJ, stdio: 'ignore', env: { ...process.env, DATA_DIR } });
for (let i = 0; i < 30; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) break; } catch {} await sleep(300); }
await fetch(`http://127.0.0.1:${port}/api/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: 'GitHub', account: 't@e.com', password: 'Xk9$mQ2zLp7' }) });

const edg = spawn(EDGE, [`--remote-debugging-port=${cdPort}`, '--headless=new', '--disable-gpu', '--no-sandbox', '--user-data-dir=' + join(DATA_DIR, '.p'), 'about:blank'], { stdio: 'ignore' });
await sleep(2000);
const list = await (await fetch(`http://127.0.0.1:${cdPort}/json`)).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let id = 0; const pending = {};
ws.onmessage = (raw) => { const m = JSON.parse(raw.data.toString()); if (m.id && pending[m.id]) pending[m.id](m); };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending[i] = (m) => res(m); setTimeout(() => rej(new Error(method + ' timeout')), 15000); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
// 与 shot-cdp.mjs 手机模式完全一致的模拟参数
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Edg/120.0.0.0' });
async function probe(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result?.result?.value; }

async function reportInputs(label) {
  const data = await probe(`(function(){
    var out = { vw: window.innerWidth, mq: matchMedia('(max-width: 640px)').matches };
    var m = document.querySelector('.modal');
    out.modalW = m ? Math.round(m.getBoundingClientRect().width) : 0;
    out.modalClass = m ? m.className : '(未打开)';
    out.fields = Array.from(document.querySelectorAll('.modal .field input, .modal .field select')).map(function(el){
      var r = el.getBoundingClientRect();
      return { id: el.id || el.name || '?', w: Math.round(r.width) };
    });
    return JSON.stringify(out);
  })()`);
  const j = JSON.parse(data);
  console.log(`${label}: 视口=${j.vw}px 断点640命中=${j.mq} 弹窗宽=${j.modalW}px class="${j.modalClass}"`);
  for (const f of j.fields) console.log(`  ${f.id.padEnd(12)} 宽=${String(f.w).padStart(3)}px`);
}

// 流程A：生成 → 点「保存到密码本」
await send('Page.navigate', { url: `http://127.0.0.1:${port}/#shot-gen` });
await sleep(4500);
const saved = await probe("$('#btn-save-gen') ? ($('#btn-save-gen').click(), true) : false");
if (!saved) { // 兜底：直接等价调用
  await probe("openEditModal(null, 'Xk9#Test2026')");
}
await sleep(700);
console.log('=== A. 生成 → 保存到密码本（openEditModal，用户报告有问题）===');
await reportInputs('编辑弹窗');

// 流程B：全新导航 → 手动录入
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
await sleep(4000);
await probe('openManualAddModal()');
await sleep(600);
console.log('=== B. 手动录入（openManualAddModal，用户说没问题）===');
await reportInputs('手动录入');

ws.close(); edg.kill(); srv.kill();
console.log('探针完成');
