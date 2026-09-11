#!/usr/bin/env node
/**
 * 密码本配图截图脚本（CDP 协议，headless 无窗口）
 * 用法：
 *   node scripts/shot-cdp.mjs [port]          # 桌面版 -> public/guide/
 *   node scripts/shot-cdp.mjs [port] --mobile # 手机版 -> public/guide-mobile/
 * 依赖：Node ≥ 22（内置 WebSocket），Edge 已安装
 */
import { existsSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
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
  // v4.4.0：随手记/文件仓页（本地功能——深链走「应用内演示注入」分支，见 app.js injectShotDemo）
  { hash: '#shot-notes',    name: 'notes.png', local: true },
  { hash: '#shot-files',    name: 'files.png', local: true },
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
  // 收藏演示（v2.7.0）：GitHub 与网银打星标（置顶 + 星标样式）
  const all = await (await fetch(`http://127.0.0.1:${port}/api/entries`)).json();
  const list = Array.isArray(all) ? all : (all.entries || all.data || []);
  for (const e of list.filter((e) => ['GitHub', '网银'].includes(e.owner))) {
    await fetch(`http://127.0.0.1:${port}/api/entries/${e.id}/fav`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fav: 1 }),
    });
  }
  console.log(`已写入 ${DEMO.length} 条演示数据（1 条含 TOTP，1 条含附件，2 条收藏）`);
}

/* ---------- CDP 单张截图 ---------- */
async function cdpScreenshot(baseUrl, cdPort, shot, mobile) {
  const url = mobile ? baseUrl : baseUrl + '/';
  const list = await (await fetch(`http://127.0.0.1:${cdPort}/json`)).json();
  // Edge 更新后 /json 可能带出多个目标：必须挑 type=page 的真实页面（list[0] 曾连到
  // 非页面目标——导航/求值"正常"但永不渲染、无帧）
  const page = list.find((t) => t.type === 'page') || list[0];
  console.log(`    CDP 目标 ${list.length} 个，用 type=${page.type} url=${(page.url || '').slice(0, 40)}`);
  const wsUrl = page?.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error('CDP 未就绪');

  const ws = new WebSocket(wsUrl);
  const pending = {};
  let id = 0;

  let frameCb = null; // v4.5.1：screencast 推帧回调（captureScreenshot 在本机 headless 上不可靠）
  ws.onmessage = (raw) => {
    const msg = JSON.parse(raw.data.toString());
    if (msg.method && String(msg.method).includes('screencast') && !frameCb) console.log('    [事件] ' + msg.method);
    if (msg.method === 'Page.screencastFrame' && frameCb) {
      const cb = frameCb; frameCb = null;
      ws.send(JSON.stringify({ id: 900001 + (id++), method: 'Page.screencastFrameAck', params: { sessionId: msg.params.sessionId } }));
      cb(msg.params);
    }
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
  if (shot.local) {
    // hash-only 导航不会重载（boot/演示注入不执行）；且同 profile 下 Service Worker
    // 旧缓存会拦截旧版 index/app.js（新代码不生效）。顺序：回应用主页 → 清 SW+缓存 →
    // 回空白 → 全量加载深链 URL
    await send('Page.navigate', { url });
    await sleep(1500);
    await send('Runtime.evaluate', {
      expression: "(async function(){try{var rs=await navigator.serviceWorker.getRegistrations();for(var r of rs)await r.unregister();var ks=await caches.keys();for(var k of ks)await caches.delete(k);}catch(e){}return 1})()",
      awaitPromise: true,
    });
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(400);
  }
  if (mobile && !shot.local) {
    // 手机默认本机存储（IndexedDB 空库），先注入 server 模式再加载
    // （#shot-notes/#shot-files 为本地功能，由 app.js 深链分支强制本地模式 + 演示注入）
    await send('Page.navigate', { url });
    await sleep(1500);
    await send('Runtime.evaluate', {
      expression: "(function(){var s={};try{s=JSON.parse(localStorage.getItem('passbook-settings')||'{}')}catch(e){}s.storageMode='server';localStorage.setItem('passbook-settings',JSON.stringify(s));location.reload();})()",
    });
  } else {
    // 桌面：带上深链 hash（#shot-notes/#shot-files 需要 hash 触发应用内分支；
    // 其余 shot 为 hash-only 导航不重载，行为不变，靠 evaluate 触发界面）
    await send('Page.navigate', { url: url + shot.hash });
  }
  // 等待列表就绪（最多 15 秒；#shot-notes/#shot-files 本地分支无密码列表，放行为 0）
  const rows = shot.local ? 0 : await waitListReady(ws, send);
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
  } else if (shot.local) {
    // 随手记/文件仓：app.js #shot- 深链已强制本地模式 + 演示注入 + 切页；
    // 本地库初始化（sql.js）+ 演示注入较慢，轮询等页面真正可见（最多 12 秒）
    let visible = 0;
    for (let i = 0; i < 24 && !visible; i++) {
      await sleep(500);
      const check = await send('Runtime.evaluate', {
        expression: `(function(){var v=document.querySelector('#view-${shot.hash === '#shot-notes' ? 'notes' : 'files'}');return v&&!v.classList.contains('hidden')?1:0})()`,
        returnByValue: true,
      });
      visible = check.result?.result?.value || 0;
    }
    console.log(`    本地页自检(可见=1): ${visible}`);
    await sleep(1200); // 渲染稳定后再截
  }
  await sleep(2000);
  // v4.5.1：优先 captureScreenshot（保留 deviceScaleFactor 3x 分辨率）。
  // 注意：之前"无限挂起"的真正元凶是 spawn 参数里的 --disable-gpu——Edge 更新后
  // 新版 headless 加它会令合成器完全不出帧（导航/求值正常，唯独截不出图）。
  // screencast 推帧作为兜底（1x 分辨率，帧质量略低但永不挂）。
  try {
    const resp = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }, 12000);
    const b64 = resp?.result?.data;
    if (!b64) throw new Error('截图响应为空');
    ws.close();
    return Buffer.from(b64, 'base64');
  } catch (e) {
    console.warn(`    captureScreenshot 失败（${e.message}），回退 screencast…`);
  }
  const params = await new Promise((resolve, reject) => {
    const t = setTimeout(() => { frameCb = null; reject(new Error('screencast 15s 无帧')); }, 15000);
    frameCb = (p) => { clearTimeout(t); resolve(p); };
    ws.send(JSON.stringify({ id: 900001 + (id++), method: 'Page.startScreencast', params: { format: 'png', everyNthFrame: 1 } }));
  });
  try { ws.send(JSON.stringify({ id: 900001 + (id++), method: 'Page.stopScreencast' })); } catch { /* 忽略 */ }
  ws.close();
  if (!params.data) throw new Error('screencast 帧为空');
  return Buffer.from(params.data, 'base64');
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
  // v4.5.1：每轮独立 profile（时间戳目录）——固定 profile 时上轮僵尸 Edge（data 目录被清后
  // 其 profile 已失效）会接管新窗口，导致 CDP 导航/截图全部超时；独立目录保证每次都是新进程。
  // 清理只杀本脚本 spawn 的 PID 树（taskkill /T），绝不按映像名杀 Edge。
  const PROFILE_DIR = join(DATA_DIR, '.edge-profile-' + Date.now());

  console.log(`启动服务器 (${mobile ? '手机版' : '桌面版'})…`);
  const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.mjs', '--port', String(port), '--no-open'], {
    cwd: PROJ, stdio: 'ignore', env: { ...process.env, DATA_DIR },
  });
  await waitServer(port);
  await writeDemo(port);

  // v4.5.1：调试端口被占用（多半是上轮失败残留的僵尸 headless Edge）会导致
  // 新 Edge 绑不上端口、脚本连到坏实例上全部超时——启动前精准清理（只匹配
  // remote-debugging-port 特征进程，绝不碰正常 Edge）后仍被占则明确报错。
  {
    const { execSync } = await import('node:child_process');
    const out = (() => { try { return execSync(`netstat -ano | findstr ":${cdPort}" | findstr "LISTENING"`, { shell: "cmd.exe" }).toString(); } catch { return ""; } })(); // 无监听=端口空闲
    const pids = [...new Set(out.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter(Boolean))];
    for (const pid of pids) {
      try {
        // 用 PowerShell 查命令行（wmic 在新 Windows 上已移除，查询失败会被静默放过）
        const cp = execSync(
          `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
          { shell: 'cmd.exe' },
        ).toString();
        if (/remote-debugging-port/.test(cp) && /headless/.test(cp)) {
          console.log(`  清理残留僵尸 headless Edge PID ${pid}…`);
          execSync(`taskkill /F /T /PID ${pid}`, { shell: 'cmd.exe' });
        } else { console.warn(`  端口 ${cdPort} 被非脚本进程 PID ${pid} 占用，请换端口运行`); process.exit(1); }
      } catch (e) { console.warn(`  端口 ${cdPort} 占用进程核查失败（${e.message.slice(0, 60)}），请换端口运行`); process.exit(1); }
    }
  }

  console.log('启动 Edge headless…');
  const edgArgs = [
    `--remote-debugging-port=${cdPort}`,
    '--headless=new', '--disable-crash-reporter', '--noerrdialogs', // v4.5.1：去掉 --disable-gpu——Edge 更新后新版 headless 加它会完全不出帧（截图全灭）
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-sandbox',
    '--user-data-dir=' + PROFILE_DIR,
    'about:blank',
  ];
  const edg = spawn(EDGE, edgArgs, { stdio: 'ignore' });
  await sleep(2000);

  mkdirSync(OUT_DIR, { recursive: true });
  try {
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
  } finally {
    // 失败/异常退出也必须清理自己 spawn 的进程树（v4.5.1 教训：半途挂掉的
    // headless Edge 残留占用调试端口，导致下一轮整体超时）。只按 PID 杀树。
    edg.kill();
    srv.kill();
    if (process.platform === 'win32') {
      // 同步执行——spawn 异步任务可能在进程退出前没跑完（僵尸残留教训）
      try { execSync(`taskkill /F /T /PID ${edg.pid}`, { stdio: 'ignore', shell: 'cmd.exe' }); } catch {}
      try { execSync(`taskkill /F /T /PID ${srv.pid}`, { stdio: 'ignore', shell: 'cmd.exe' }); } catch {}
    }
  }
  console.log('完成');
}

main().catch((e) => { console.error(e); process.exit(1); });