#!/usr/bin/env node
/**
 * 密码本应用图标渲染脚本（CDP headless）
 * 将 assets/icon.svg 渲染为各尺寸 PNG：
 *   - 桌面版 icons/icon-{16,32,48,128,192,256,512}.png
 *   - Android mipmap-*dpi/ic_launcher.png
 * 用法：node scripts/icon-render.mjs
 */
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJ = join(__dirname, '..');
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => { try { existsSync(p); return true; } catch { return false; } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const svg = readFileSync(join(PROJ, 'assets', 'icon.svg'), 'utf8');
const ICON_HTML = (svgText) => `
<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}
svg{width:100%;height:100%;display:block}
</style></head><body>${svgText}</body></html>`;

const CDP_PORT = 9233;

async function main() {
  if (!EDGE) { console.error('找不到 msedge.exe'); process.exit(1); }
  const edg = spawn(EDGE, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new', '--disable-gpu', '--disable-crash-reporter', '--noerrdialogs',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-sandbox',
    '--disable-dev-shm-usage',
    '--user-data-dir=' + join(PROJ, 'data', '.icon-edge'),
    'about:blank',
  ], { stdio: 'ignore' });
  await sleep(2500);

  let list = [];
  for (let i = 0; i < 20; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); if (list.length) break; } catch {}
    await sleep(300);
  }
  const wsUrl = list[0]?.webSocketDebuggerUrl;
  if (!wsUrl) { edg.kill(); throw new Error('CDP 未就绪'); }

  const ws = new WebSocket(wsUrl);
  const pending = {};
  let id = 0;
  ws.onmessage = (raw) => {
    const msg = JSON.parse(raw.data.toString());
    if (msg.id && pending[msg.id]) pending[msg.id](msg);
  };
  await new Promise((r) => ws.onopen = r);

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const thisId = ++id;
    const timer = setTimeout(() => { delete pending[thisId]; reject(new Error(`CDP ${method} 超时`)); }, 25000);
    pending[thisId] = (msg) => { clearTimeout(timer); resolve(msg); };
    ws.send(JSON.stringify({ id: thisId, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1024, deviceScaleFactor: 1, mobile: false, screenWidth: 1024, screenHeight: 1024 });
  // 加载图标页面并等待 load 事件
  const nav = send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(ICON_HTML(svg)) });
  await new Promise((r) => setTimeout(r, 300));
  await nav;
  // 等待 SVG 就绪
  for (let i = 0; i < 20; i++) {
    const r = await send('Runtime.evaluate', {
      expression: "document.querySelector('svg') && document.querySelector('svg').getBoundingClientRect().width",
      returnByValue: true,
    });
    const w = r?.result?.result?.value;
    if (typeof w === 'number' && w > 0) break;
    await sleep(250);
  }
  await sleep(400);

  const capture = async (size) => {
    await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false, screenWidth: size, screenHeight: size });
    await sleep(400);
    let resp = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        resp = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, omitBackground: true });
        if (resp?.result?.data) return Buffer.from(resp.result.data, 'base64');
      } catch (e) { console.warn(`    截图重试 ${attempt + 1}: ${e.message}`); await sleep(1000); }
    }
    throw new Error(`截图失败 ${size}`);
  };

  const sizes = [16, 32, 48, 128, 192, 256, 512];
  const mkdir = (p) => mkdirSync(p, { recursive: true });
  mkdir(join(PROJ, 'src-tauri', 'icons'));
  for (const size of sizes) {
    const buf = await capture(size);
    writeFileSync(join(PROJ, 'src-tauri', 'icons', `icon-${size}.png`), buf);
    console.log(`  icon-${size}.png 生成`);
  }

  // Android mipmap 各密度
  const androidRes = join(PROJ, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');
  const mips = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [dpi, size] of Object.entries(mips)) {
    const buf = await capture(size);
    const dir = join(androidRes, `mipmap-${dpi}`);
    mkdir(dir);
    writeFileSync(join(dir, 'ic_launcher.png'), buf);
    console.log(`  mipmap-${dpi}/ic_launcher.png 生成 (${size})`);
  }

  ws.close();
  edg.kill();
  console.log('完成');
}

main().catch((e) => { console.error(e); process.exit(1); });
