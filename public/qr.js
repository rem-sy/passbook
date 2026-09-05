/* 密码本 QR 模块（v4.0.0）：解码（jsQR）+ 出码（qrcode-generator）
 * 纯函数（parseQrPayload/share card/PASSBOOK 编解码/otpauth 解析）不触 DOM，Node 可测。
 * scanFromVideo/scanFromImage/encodeQR 需要浏览器环境（video/canvas）。 */
window.PassQR = (function () {
  'use strict';

  /* ---------- 五级识别（纯） ---------- */
  // PASSBOOK:<base64(JSON)> 迁移载荷
  function packMigrate(entry) {
    const clean = { ...entry };
    delete clean.id; // 迁移载荷不含 id（新库自分配）
    const bytes = new TextEncoder().encode(JSON.stringify(clean));
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return 'PASSBOOK:' + btoa(bin);
  }
  function unpackMigrate(text) {
    try {
      const bin = atob(String(text).replace(/^PASSBOOK:/i, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const obj = JSON.parse(new TextDecoder().decode(bytes));
      return (obj && typeof obj === 'object' && ('owner' in obj || 'account' in obj)) ? obj : null;
    } catch { return null; }
  }

  // 分享卡片：密码本条目\n所属: x\n账户: x\n密码: x\nTOTP: 密钥\n备注: x（后两项可省）
  function buildShareCard(e) {
    let s = '密码本条目\n所属: ' + (e.owner || '') + '\n账户: ' + (e.account || '') + '\n密码: ' + (e.password || '');
    if (e.totp_secret) s += '\nTOTP: ' + e.totp_secret;
    if (e.note) s += '\n备注: ' + e.note;
    return s;
  }
  function parseShareCard(text) {
    const lines = String(text).split(/\r?\n/).map((l) => l.trim());
    if (!lines.length || lines[0] !== '密码本条目') return null;
    const out = {};
    let hits = 0;
    lines.slice(1).forEach((l) => {
      const m = l.match(/^(所属|账户|密码|TOTP|备注): ?(.*)$/);
      if (!m) return;
      hits++;
      const k = { '所属': 'owner', '账户': 'account', '密码': 'password', 'TOTP': 'totp_secret', '备注': 'note' }[m[1]];
      out[k] = m[2];
    });
    if (hits < 2 || !out.owner || !out.password) return null; // 至少 所属+密码
    return out;
  }

  // otpauth://totp/Label?secret=X&issuer=Y&period=30&digits=6
  function parseOtpauth(text) {
    const s = String(text);
    if (!/^otpauth:\/\//i.test(s)) return null;
    try {
      const u = new URL(s);
      const secret = (u.searchParams.get('secret') || '').replace(/\s+/g, '').toUpperCase();
      if (!secret) return null;
      return {
        secret,
        issuer: u.searchParams.get('issuer') || decodeURIComponent(u.pathname.split('/').pop() || '').split(':')[0].trim(),
        period: parseInt(u.searchParams.get('period') || '30', 10) || 30,
        digits: parseInt(u.searchParams.get('digits') || '6', 10) || 6,
      };
    } catch { return null; }
  }

  // 五级：PASSBOOK > 分享卡片 > otpauth > URL > 纯文本
  function parseQrPayload(text) {
    const s = String(text || '').trim();
    if (!s) return { level: 'empty', text: '' };
    if (/^PASSBOOK:/i.test(s)) {
      const e = unpackMigrate(s);
      if (e) return { level: 'migrate', entry: e };
    }
    const card = parseShareCard(s);
    if (card) return { level: 'share', entry: card };
    const oa = parseOtpauth(s);
    if (oa) return { level: 'otpauth', totp: oa, text: s };
    if (/^https?:\/\/\S+$/i.test(s)) return { level: 'url', url: s };
    return { level: 'text', text: s };
  }

  /* ---------- 解码（浏览器） ---------- */
  function decodeCanvas(canvas, ctx) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const fn = window.jsQR || (typeof jsQR !== 'undefined' ? jsQR : null);
    if (!fn) return null;
    const r = fn(img.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
    return r && r.data ? r.data : null;
  }
  // 图片/文件/dataURL → 文本（一次性）
  function scanFromImage(imgOrFile) {
    return new Promise((resolve, reject) => {
      const go = (imgEl) => {
        try {
          const c = document.createElement('canvas');
          const k = Math.min(1, 900 / Math.max(imgEl.width || 1, imgEl.height || 1)); // 限长防超大图卡顿
          c.width = Math.max(1, Math.round((imgEl.width || 1) * k));
          c.height = Math.max(1, Math.round((imgEl.height || 1) * k));
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(imgEl, 0, 0, c.width, c.height);
          resolve(decodeCanvas(c, ctx));
        } catch (e) { reject(e); }
      };
      if (imgOrFile instanceof Blob) {
        const url = URL.createObjectURL(imgOrFile);
        const im = new Image();
        im.onload = () => { go(im); URL.revokeObjectURL(url); };
        im.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        im.src = url;
      } else if (typeof imgOrFile === 'string') {
        const im = new Image();
        im.onload = () => go(im);
        im.onerror = () => resolve(null);
        im.src = imgOrFile;
      } else go(imgOrFile); // HTMLImageElement
    });
  }
  // 相机连续扫码；onResult 命中一次自动停；返回 {stop}
  function scanFromVideo(videoEl, onResult, onFail) {
    let stream = null, timer = null, stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (timer) { clearTimeout(timer); timer = null; }
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      if (videoEl) { try { videoEl.pause(); videoEl.srcObject = null; } catch { } }
    };
    const tick = async () => {
      if (stopped) return;
      try {
        const v = videoEl;
        if (v && v.readyState >= 2 && v.videoWidth) {
          const k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
          const c = document.createElement('canvas');
          c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const t = decodeCanvas(c, ctx);
          if (t) { stop(); onResult(t); return; }
        }
      } catch { /* 帧异常继续 */ }
      timer = setTimeout(tick, 180); // ≈5.5fps 节流
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) { stop(); return; }
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => { });
        tick();
      } catch (e) {
        stop();
        if (onFail) onFail(e); else throw e;
      }
    })();
    return { stop };
  }

  /* ---------- 出码（浏览器） ---------- */
  function encodeQR(text, sizePx) {
    const q = window.qrcode || (typeof qrcode !== 'undefined' ? qrcode : null);
    if (!q) throw new Error('qrcode lib missing');
    const utf8 = q.stringToBytesFuncs && q.stringToBytesFuncs['UTF-8'];
    if (utf8) q.stringToBytes = utf8;
    const gen = q(0, 'M'); // typeNumber 0=自动
    gen.addData(String(text), 'Byte');
    gen.make();
    const n = gen.getModuleCount();
    const quiet = 4; // 标准静区
    const scale = Math.max(2, Math.floor((sizePx || 320) / (n + quiet * 2)));
    const px = (n + quiet * 2) * scale;
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
      if (gen.isDark(r, col)) ctx.fillRect((col + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
    return { canvas: c, dataUrl: c.toDataURL('image/png'), modules: n, size: px };
  }

  return { packMigrate, unpackMigrate, buildShareCard, parseShareCard, parseOtpauth, parseQrPayload, scanFromImage, scanFromVideo, encodeQR };
})();
