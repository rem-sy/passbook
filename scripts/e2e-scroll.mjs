// 诊断：v4.12.1 快捷面板内容超出时 .q-body 是否可滚（复现用户"下面内容完全不可见"）
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import http from 'node:http';

const PROJ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3993, CD = 3994;
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => { try { readFileSync(p); return true; } catch { return false; } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log('[scroll-e2e] ' + m);

const INJECT = `<script>
window.__TAURI__ = {
  core: { invoke: async () => null },
  event: { emit: () => {}, listen: async () => () => {} },
};
</script>`;

const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/__t.html';
  try {
    if (p === '/__t.html') {
      const html = readFileSync(join(PROJ, 'public/quick.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html.replace('<script src="theme.js">', INJECT + '\n<script src="theme.js">'));
      return;
    }
    const data = readFileSync(join(PROJ, 'public', p.replace(/^\//, '')));
    const mime = p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
}).listen(PORT);

const profile = join(PROJ, 'data', '.scroll-e2e-' + Date.now());
mkdirSync(profile, { recursive: true });
const edg = spawn(EDGE, [`--remote-debugging-port=${CD}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-sandbox', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
try {
  let list = null; for (let i = 0; i < 20 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${CD}/json`)).json(); } catch {} if (!list) await sleep(500); }
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.onopen = r);
  let id = 0; const pend = {};
  ws.onmessage = (raw) => { const m = JSON.parse(raw.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  // 模拟 gate 通过（绕过真实事件，直接操作 DOM）
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/__t.html` });
  await sleep(1200);
  await ev("document.getElementById('q-gate').classList.add('hidden'); document.getElementById('q-app').classList.remove('hidden')");

  // 注入 50 条搜索结果卡片
  await ev(`(function(){
    const arr = [];
    for (let i = 0; i < 50; i++) arr.push('<div class="q-item"><div class="q-it-main"><div class="q-it-owner">站点' + i + '</div><div class="q-it-account">u' + i + '@x.com</div></div><div class="q-btns"><button>账号</button><button class="q-copy-pw">密码</button></div></div>');
    document.getElementById('q-results').innerHTML = arr.join('');
    return 1;
  })()`);
  await sleep(300);

  const r1 = await ev(`(function(){
    const b = document.querySelector('.q-body');
    return JSON.stringify({ scrollH: b.scrollHeight, clientH: b.clientHeight, overflowY: getComputedStyle(b).overflowY, canScroll: b.scrollHeight > b.clientHeight });
  })()`);
  log('50 条结果时 .q-body: ' + r1);

  const r2 = await ev(`(function(){
    const b = document.querySelector('.q-body');
    b.scrollTop = 99999;
    const last = document.querySelectorAll('.q-item')[49];
    const r = last.getBoundingClientRect();
    const bb = b.getBoundingClientRect();
    return JSON.stringify({ scrollTop: Math.round(b.scrollTop), maxScroll: b.scrollHeight - b.clientHeight,
      cardTop: Math.round(r.top), cardBottom: Math.round(r.bottom),
      bodyTop: Math.round(bb.top), bodyBottom: Math.round(bb.bottom) });
  })()`);
  log('滚到底后坐标: ' + r2);
  {
    const v = JSON.parse(r2);
    const okScroll = v.scrollTop === v.maxScroll && v.maxScroll > 0;
    const okVisible = v.cardTop >= v.bodyTop && v.cardBottom <= v.bodyBottom;
    log((okScroll ? 'OK ' : 'FAIL ') + '面板可滚到底（scrollTop=' + v.scrollTop + '/' + v.maxScroll + '）');
    log((okVisible ? 'OK ' : 'FAIL ') + '滚到底末卡完整可见（card ' + v.cardTop + '~' + v.cardBottom + ' in body ' + v.bodyTop + '~' + v.bodyBottom + '）');
    if (!okScroll || !okVisible) process.exitCode = 1;
  }

  // AI Tab：30 条消息 → 无嵌套滚动（#ai-log 不独立滚），内容并入 .q-body 整体滚；滚到底末消息可见
  await ev("document.querySelector('.q-tabs [data-tab=ai]').click()");
  await ev(`(function(){
    const log = document.getElementById('ai-log');
    for (let i = 0; i < 30; i++) { const d = document.createElement('div'); d.className = 'ai-msg assistant'; d.textContent = '消息' + i + ' —— 这是一段比较长的测试文本'.repeat(3); log.appendChild(d); }
    return 1;
  })()`);
  await sleep(300);
  const r3 = await ev(`(function(){
    const b = document.querySelector('.q-body');
    const l = document.getElementById('ai-log');
    const last = l.querySelectorAll('.ai-msg')[29];
    b.scrollTop = 99999;
    const r = last.getBoundingClientRect();
    const bb = b.getBoundingClientRect();
    return JSON.stringify({
      logScrollH: l.scrollHeight, logClientH: l.clientHeight,
      bodyScrollH: b.scrollHeight, bodyClientH: b.clientHeight,
      msgTop: Math.round(r.top), msgBottom: Math.round(r.bottom),
      bodyTop: Math.round(bb.top), bodyBottom: Math.round(bb.bottom),
    });
  })()`);
  log('AI 30 条消息滚到底: ' + r3);
  {
    const v = JSON.parse(r3);
    const noNested = v.logClientH >= (v.logScrollH - 2); // clientH==scrollH 即无内部滚动
    const okWhole = v.bodyScrollH > v.bodyClientH;      // .q-body 承担整体滚动
    const okVisible = v.msgTop >= v.bodyTop && v.msgBottom <= v.bodyBottom;
    log((noNested ? 'OK ' : 'FAIL ') + 'AI 消息区无嵌套滚动（log ' + v.logClientH + '=' + v.logScrollH + '）');
    log((okWhole ? 'OK ' : 'FAIL ') + 'AI 内容并入面板整体滚动（body ' + v.bodyScrollH + '>' + v.bodyClientH + '）');
    log((okVisible ? 'OK ' : 'FAIL ') + 'AI 滚到底末消息可见（msg ' + v.msgTop + '~' + v.msgBottom + ' in body ' + v.bodyTop + '~' + v.bodyBottom + '）');
    if (!noNested || !okWhole || !okVisible) process.exitCode = 1;
  }

  rmSync(profile, { recursive: true, force: true });
} finally {
  srv.close();
  try { edg.kill(); } catch {}
  try { spawn('cmd', ['/c', 'taskkill /F /T /PID ' + edg.pid], { stdio: 'ignore' }); } catch {}
}
