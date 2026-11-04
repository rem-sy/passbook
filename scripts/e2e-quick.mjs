// E2E 复现：快捷面板（quick.html）在 mock Tauri 桥下的渲染与交互
// 用途：回归 v4.11.1 的搜索卡片文字渲染 / 失焦行为 / 生成与导入链路
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import http from 'node:http';

const PROJ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3991, CD = 3992;
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => { try { readFileSync(p); return true; } catch { return false; } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log('[quick-e2e] ' + m);
let FAILED = 0;
const assert = (cond, name) => { log((cond ? 'OK ' : 'FAIL ') + name); if (!cond) FAILED++; };

/* ---------- mock 数据 ---------- */
const ITEMS = [
  { id: 1, owner: 'GitHub', account: 'tom@example.com', password: 'Xk9$mQ2zLp7', url: 'https://github.com', note: '工作主力号', category: '工作', totp_secret: 'JBSWY3DPEHPK3PXP', fav: 1 },
  { id: 2, owner: '微信', account: '13800138000', password: 'Wx#2024happy', url: '', note: '', category: '个人', totp_secret: '', fav: 0 },
  { id: 3, owner: '网银', account: '张三', password: 'Bank#Safe', url: '', note: '工资卡', category: '财务', totp_secret: '', fav: 1 },
];

// mock 注入：quick.js 需要的 __TAURI__（event.emit/listen + core.invoke）
const MOCK = `<script>
window.__ITEMS = ${JSON.stringify(ITEMS)};
window.__TAURI__ = {
  core: { invoke: async (cmd) => { window.__mockInvokes = (window.__mockInvokes||[]).concat(cmd); return null; } },
  event: {
    emit: (event, payload) => {
      if (event !== 'quick-request') return;
      const r = window.__mockHandle(payload);
      setTimeout(() => { (window.__respCbs || []).forEach((cb) => cb({ event: 'quick-response', payload: r })); }, 0);
    },
    listen: async (event, cb) => { if (event === 'quick-response') (window.__respCbs = window.__respCbs || []).push(cb); return () => {}; },
  },
};
window.__mockHandle = function (req) {
  const { id, action, payload } = req || {};
  if (action === 'gate') return { id, ok: true, data: { ready: true, available: true, needsPin: false, unlocked: true } };
  if (action === 'search') {
    // 镜像主窗 handleQuickAction 修复后的逻辑（含 PassSearch 包装解包；searchEntries 空查询返回 null）
    const q = String((payload || {}).q || '').trim();
    let items = window.__ITEMS;
    if (q && window.PassSearch) {
      const res = window.PassSearch.searchEntries(window.__ITEMS, q);
      items = (res || []).map((x) => x.entry);
    }
    return { id, ok: true, data: { items } };
  }
  if (action === 'save') return { id, ok: true, data: { imported: 1, skipped: 0 } };
  if (action === 'import') return { id, ok: true, data: { imported: (payload.rows || []).length, skipped: 0 } };
  if (action === 'unlock') return { id, ok: true, data: { ok: true } };
  return { id, ok: false, error: '未知操作 ' + action };
};
</script>`;

/* ---------- 静态服务器：/__quick.html = quick.html + mock 注入 ---------- */
const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/__quick.html') {
    const html = readFileSync(join(PROJ, 'public/quick.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html.replace('<script src="theme.js">', MOCK + '\n<script src="search.js"></script>\n<script src="theme.js">'));
    return;
  }
  if (p === '/') p = '/__quick.html';
  try {
    const file = join(PROJ, 'public', p.replace(/^\//, ''));
    const data = readFileSync(file);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
}).listen(PORT);

/* ---------- 端口守卫（同 e2e-import 教训） ---------- */
{
  const { execSync } = await import('node:child_process');
  let out = '';
  try { out = execSync(`netstat -ano | findstr ":${CD}" | findstr "LISTENING"`, { shell: 'cmd.exe' }).toString(); } catch {}
  for (const pid of [...new Set(out.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter(Boolean))]) {
    try {
      const cp = execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`, { shell: 'cmd.exe' }).toString();
      if (/remote-debugging-port/.test(cp) && /headless/.test(cp)) { log('清理残留 headless Edge PID ' + pid); execSync(`taskkill /F /T /PID ${pid}`, { shell: 'cmd.exe' }); }
    } catch {}
  }
}

try {
  const profile = join(PROJ, 'data', '.quick-e2e-' + Date.now());
  mkdirSync(profile, { recursive: true });
  const edg = spawn(EDGE, [`--remote-debugging-port=${CD}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-sandbox', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  let list = null; for (let i = 0; i < 20 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${CD}/json`)).json(); } catch {} if (!list) await sleep(500); }
  const page = list.find((t) => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.onopen = r);
  let id = 0; const pend = {};
  ws.onmessage = (raw) => { const m = JSON.parse(raw.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') log('[console.error] ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200));
    if (m.id && pend[m.id]) { clearTimeout(pend[m.id].t); pend[m.id].res(m); delete pend[m.id]; } };
  const send = (method, params = {}, to = 15000) => new Promise((res, rej) => { const i = ++id; const t = setTimeout(() => { delete pend[i]; rej(new Error('超时 ' + method)); }, to); pend[i] = { res, t }; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  log('打开 mock 快捷面板…');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/__quick.html` });
  await sleep(1800);

  assert(await ev("document.getElementById('q-app') && !document.getElementById('q-app').classList.contains('hidden')"), 'gate 通过进入面板');
  log('q-results 内容: ' + await ev("document.getElementById('q-results').innerHTML.slice(0, 300)"));
  const cards = await ev("document.querySelectorAll('.q-item').length");
  assert(cards === 3, '空搜索显示全部 3 张卡片（实际 ' + cards + '）');

  // —— 核心：卡片文字是否渲染 ——
  const firstCardText = await ev("document.querySelector('.q-item .q-it-owner') ? document.querySelector('.q-item .q-it-owner').innerText : '(no el)'");
  log('首卡 owner 文本: ' + JSON.stringify(firstCardText));
  const accText = await ev("document.querySelector('.q-item .q-it-account') ? document.querySelector('.q-item .q-it-account').innerText : '(no el)'");
  log('首卡 account 文本: ' + JSON.stringify(accText));
  assert(!!firstCardText && firstCardText.trim().length > 0, 'owner 文本非空');
  assert(!!accText && accText.trim().length > 0, 'account 文本非空');

  // —— 样式可见性：computed color / 尺寸 ——
  const styles = await ev("(function(){var el=document.querySelector('.q-item .q-it-owner');if(!el)return 'no-el';var c=getComputedStyle(el);var r=el.getBoundingClientRect();return JSON.stringify({color:c.color,fontSize:c.fontSize,height:r.height,width:r.width,visible:c.visibility,display:c.display,bg:getComputedStyle(document.body).backgroundColor});})()");
  log('首卡 owner 计算样式: ' + styles);

  // —— TOTP 按钮存在且 1s 后刷新 ——
  await sleep(1300);
  const totp = await ev("document.querySelector('[data-totp]') ? document.querySelector('[data-totp]').textContent : '(none)'");
  log('TOTP 显示: ' + JSON.stringify(totp));

  // —— 搜索过滤 ——
  await ev("var s=document.getElementById('q-search');s.value='微信';s.dispatchEvent(new Event('input'))");
  await sleep(500);
  const filtered = await ev("document.querySelectorAll('.q-item').length");
  assert(filtered === 1, '关键词过滤命中 1 条（实际 ' + filtered + '）');
  const filteredOwner = await ev("document.querySelector('.q-item .q-it-owner') ? document.querySelector('.q-item .q-it-owner').innerText.trim() : ''");
  assert(filteredOwner === '微信', '过滤后卡片文字非空且正确（实际 ' + JSON.stringify(filteredOwner) + '）——v4.11.1 空白卡片回归');
  await ev("var s=document.getElementById('q-search');s.value='';s.dispatchEvent(new Event('input'))");
  await sleep(500);

  // —— 生成器 ——
  await ev("document.querySelector('.q-tabs [data-tab=gen]').click()");
  await ev("document.getElementById('q-gen-go').click()");
  await sleep(300);
  const pw = await ev("document.getElementById('q-gen-pw').textContent");
  assert(pw && pw.length >= 12, '生成器出密码（' + (pw || '').length + ' 位）');
  await ev("document.getElementById('q-gen-save-btn').click()");
  await sleep(200);
  await ev("document.getElementById('q-save-owner').value='测试站'");
  await ev("document.getElementById('q-save-go').click()");
  await sleep(500);
  const saveMsg = await ev("document.getElementById('q-gen-msg').textContent");
  assert(/已存入/.test(saveMsg), '存入回执: ' + saveMsg);

  // —— 导入 ——
  await ev("document.querySelector('.q-tabs [data-tab=import]').click()");
  await ev("document.getElementById('q-import-text').value='新站,u9@x.com,Pw#123456'");
  await ev("document.getElementById('q-import-text').dispatchEvent(new Event('input'))");
  await sleep(600);
  const preview = await ev("document.getElementById('q-import-preview').textContent");
  assert(/解析出 1 条/.test(preview), '导入预览: ' + preview.split('\n')[0]);
  await ev("document.getElementById('q-import-go').click()");
  await sleep(500);
  const impMsg = await ev("document.getElementById('q-import-preview').textContent");
  assert(/导入完成/.test(impMsg), '导入回执: ' + impMsg);

  // —— 截图存证 ——
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(PROJ, 'data', 'quick-e2e.png'), Buffer.from(shot.result.data, 'base64'));
  log('截图: data/quick-e2e.png');

  try { edg.kill(); } catch {}
  try { spawn('cmd', ['/c', 'taskkill /F /T /PID ' + edg.pid], { stdio: 'ignore' }); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
} finally {
  srv.close();
}
log(FAILED ? ('失败 ' + FAILED + ' 项') : '全部通过');
process.exit(FAILED ? 1 : 0);
