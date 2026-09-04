#!/usr/bin/env node
/**
 * 密码本配图截图脚本（CDP 协议，headless 无窗口）
 * 用法：
 *   node scripts/shot-cdp.mjs [port]          # 桌面版 -> public/guide/
 *   node scripts/shot-cdp.mjs [port] --mobile # 手机版 -> public/guide-mobile/
 * 依赖：Node ≥ 22（内置 WebSocket），Edge 已安装
 */
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
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

const DEMO = [
  { owner: 'GitHub', account: 'tom@example.com', password: 'Xk9$mQ2zLp7', category: '工作', url: 'https://github.com', note: '工作主力号', totp_secret: 'JBSWY3DPEHPK3PXP' },
  { owner: '微信', account: '13800138000', password: 'Wx#2024happy', category: '个人', note: '手机号注册' },
  { owner: '网银', account: '张三', password: 'Bank@2024#Safe', category: '财务', note: '工资卡' },
  { owner: '知乎', account: 'zhihu@x.com', password: 'Zhi#2024hu', category: '个人', note: '写作号' },
  { owner: '公司邮箱', account: 'zhang@corp.com', password: 'Corp!Mail88', category: '工作', url: 'https://mail.corp.com' },
  { owner: 'Steam', account: 'gamer_zs', password: 'G4me#Fun2024', category: '娱乐', note: '' },
];
// 1x1 蓝色 PNG：给「公司邮箱」挂一个附件演示（列表只显示名称/大小，1x1 足够）
const DEMO_ATTACH = {
  owner: '公司邮箱',
  name: '工牌照片.png',
  mime: 'image/png',
  dataB64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPhfz4AFmgIY/eOmIgAAAABJRU5ErkJggg==',
};
const SHOTS = [
  { hash: '#shot-bare',     name: 'main.png' },
  { hash: '#shot-manual',   name: 'manual.png' },
  { hash: '#shot-gen',      name: 'gen.png' },
  { hash: '#shot-phrase',   name: 'phrase.png' },
  { hash: '#shot-agent',    name: 'agent.png' },
  { hash: '#shot-settings', name: 'sync.png' },
  { hash: '#shot-import',   name: 'import.png' },
];

/* ---------- 工具 ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 带超时的 CDP send */
function cdpSend(ws, pending, id) {
  return async (method, params = {}) => {
    id++;
    const thisId = id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        delete pending[thisId];
        reject(new Error(`CDP ${method} 超时 (20s)`));
      }, 20000);
      pending[thisId] = (msg) => {
        clearTimeout(timer);
        resolve(msg);
      };
      ws.send(JSON.stringify({ id: thisId, method, params }));
    });
  };
}

/* ---------- 服务器 ---------- */
async function waitServer(port) {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) return; } catch {}
    await sleep(300);
  }
  throw new Error('服务器未就绪');
}

async function writeDemo(port) {
  let attachEntryId = null;
  for (const e of DEMO) {
    const r = await fetch(`http://127.0.0.1:${port}/api/entries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e),
    });
    if (e.owner === DEMO_ATTACH.owner) attachEntryId = (await r.json()).id;
  }
  // 附件演示（v2.4.0）：给指定条目挂一个小文件，卡片显示 📎 徽标
  if (attachEntryId) {
    await fetch(`http://127.0.0.1:${port}/api/attachments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: attachEntryId, name: DEMO_ATTACH.name, mime: DEMO_ATTACH.mime, dataB64: DEMO_ATTACH.dataB64 }),
    });
  }
  console.log(`已写入 ${DEMO.length} 条演示数据（1 条含 TOTP，1 条含附件）`);
}

/* ---------- CDP 单张截图 ---------- */
async function cdpScreenshot(baseUrl, cdPort, shot, mobile) {
  const url = mobile ? baseUrl : baseUrl + '/';
  const list = await (await fetch(`http://127.0.0.1:${cdPort}/json`)).json();
  const wsUrl = list[0]?.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error('CDP 未就绪');

  const ws = new WebSocket(wsUrl);
  const pending = {};
  let id = 0;

  ws.onmessage = (raw) => {
    const msg = JSON.parse(raw.data.toString());
    if (msg.id && pending[msg.id]) pending[msg.id](msg);
  };
  await new Promise((r) => ws.onopen = r);

  const send = cdpSend(ws, pending, id);

  await send('Page.enable');
  await send('Runtime.enable');
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
      screenWidth: 390, screenHeight: 844,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Edg/120.0.0.0',
    });
  } else {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1040, height: 800, deviceScaleFactor: 1, mobile: false,
      screenWidth: 1040, screenHeight: 800,
    });
  }
  console.log(`    导航到主页…`);
  if (mobile) {
    // 手机默认本机存储（IndexedDB 空库），先注入 server 模式再加载
    await send('Page.navigate', { url });
    await sleep(1500);
    await send('Runtime.evaluate', {
      expression: "(function(){var s={};try{s=JSON.parse(localStorage.getItem('passbook-settings')||'{}')}catch(e){}s.storageMode='server';localStorage.setItem('passbook-settings',JSON.stringify(s));location.reload();})()",
    });
  } else {
    await send('Page.navigate', { url });
  }
  // 等待列表就绪（最多 15 秒）
  const rows = await waitListReady(ws, send);
  if (rows < 0) {
    console.warn('    列表就绪超时，按固定等待继续');
    await sleep(5000);
  } else {
    console.log(`    -> 列表 ${rows} 条`);
  }
  // 按 shot 类型手动触发对应界面
  await sleep(600);
  if (shot.hash === '#shot-bare') {
    // 什么都不做，直接截主列表
  } else if (shot.hash === '#shot-manual') {
    await send('Runtime.evaluate', { expression: 'openManualAddModal()' });
  } else if (shot.hash === '#shot-gen') {
    await send('Runtime.evaluate', { expression: "$('#btn-gen-open').click()" });
    await sleep(400);
    await send('Runtime.evaluate', { expression: "$('#btn-generate').click()" });
  } else if (shot.hash === '#shot-phrase') {
    // 密码短语模式（v2.3.0）：切到短语标签并生成
    await send('Runtime.evaluate', { expression: "$('#btn-gen-open').click()" });
    await sleep(400);
    await send('Runtime.evaluate', { expression: "document.querySelector('.gen-tab[data-genmode=phrase]').click()" });
    await sleep(300);
    await send('Runtime.evaluate', { expression: "$('#btn-generate').click()" });
  } else if (shot.hash === '#shot-agent') {
    await send('Runtime.evaluate', { expression: "$('#btn-agent').click()" });
  } else if (shot.hash === '#shot-settings') {
    // 备份快照区仅「本机存储」模式渲染：改写 passbook-settings 切 local 模式重载，
    // 打开设置后先点一次「立即备份」让列表有内容，再滚到备份区截取
    await send('Runtime.evaluate', {
      expression: "(function(){var s={};try{s=JSON.parse(localStorage.getItem('passbook-settings')||'{}')}catch(e){}s.storageMode='local';localStorage.setItem('passbook-settings',JSON.stringify(s));location.reload();})()",
    });
    await sleep(4500);
    await send('Runtime.evaluate', { expression: 'openSettingsModal()' });
    await sleep(700);
    await send('Runtime.evaluate', { expression: "$('#btn-backup-now')?.click()" });
    await sleep(1500);
    await send('Runtime.evaluate', { expression: "document.querySelector('#backup-list')?.scrollIntoView({block:'center'})" });
    await sleep(500);
    // 分支自检：确认备份区已渲染且列表非空
    const check = await send('Runtime.evaluate', {
      expression: "(function(){var l=document.querySelectorAll('#backup-list .backup-item').length;return l+'/'+(document.querySelector('#backup-list')?1:0)})()",
      returnByValue: true,
    });
    console.log(`    备份区自检(条数/存在): ${check.result?.result?.value}`);
    // 恢复 server 模式，避免影响后续截图
    await send('Runtime.evaluate', {
      expression: "(function(){var s={};try{s=JSON.parse(localStorage.getItem('passbook-settings')||'{}')}catch(e){}s.storageMode='server';localStorage.setItem('passbook-settings',JSON.stringify(s));})()",
    });
  } else if (shot.hash === '#shot-import') {
    await send('Runtime.evaluate', { expression: 'openImportModal()' });
  }
  await sleep(2000);
  // 截图（失败重试一次）
  let resp = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      resp = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      break;
    } catch (e) {
      console.warn(`    截图尝试 ${attempt + 1} 失败: ${e.message}，重试…`);
      await sleep(2000);
    }
  }
  ws.close();
  const b64 = resp?.result?.data;
  if (!b64) throw new Error('截图响应为空');
  return Buffer.from(b64, 'base64');
}

/** 轮询等待列表行就绪 */
async function waitListReady(ws, send) {
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const r = await send('Runtime.evaluate', {
        expression: "document.querySelectorAll('.entry').length",
        returnByValue: true,
      });
      const n = r.result?.result?.value;
      if (typeof n === 'number' && n >= 1) return n;
      // 也检查一下是否初始化为空页面（0 条也可以）
      if (typeof n === 'number' && i >= 8) return n;
    } catch { /* 继续等 */ }
  }
  return -1;
}

/* ---------- 主流程 ---------- */
async function main() {
  const args = process.argv.slice(2);
  const mobile = args.includes('--mobile');
  const port = Number(args.find((a) => !a.startsWith('--'))) || 3955;
  const cdPort = port + 1;
  const baseUrl = `http://127.0.0.1:${port}`;
  const OUT_DIR = join(PROJ, 'public', mobile ? 'guide-mobile' : 'guide');

  if (!EDGE) { console.error('找不到 msedge.exe'); process.exit(1); }

  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

  console.log(`启动服务器 (${mobile ? '手机版' : '桌面版'})…`);
  const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.mjs', '--port', String(port), '--no-open'], {
    cwd: PROJ, stdio: 'ignore', env: { ...process.env, DATA_DIR },
  });
  await waitServer(port);
  await writeDemo(port);

  console.log('启动 Edge headless…');
  const edgArgs = [
    `--remote-debugging-port=${cdPort}`,
    '--headless=new', '--disable-gpu', '--disable-crash-reporter', '--noerrdialogs',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-sandbox',
    '--user-data-dir=' + join(DATA_DIR, '.edge-profile'),
    'about:blank',
  ];
  const edg = spawn(EDGE, edgArgs, { stdio: 'ignore' });
  await sleep(2000);

  mkdirSync(OUT_DIR, { recursive: true });
  for (const shot of SHOTS) {
    try {
      console.log(`  截取 ${shot.name} …`);
      const png = await cdpScreenshot(baseUrl, cdPort, shot, mobile);
      writeFileSync(join(OUT_DIR, shot.name), png);
      console.log(`    -> ${(png.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.error(`  失败 ${shot.name}: ${e.message}`);
    }
  }

  edg.kill();
  srv.kill();
  console.log('完成');
}

main().catch((e) => { console.error(e); process.exit(1); });