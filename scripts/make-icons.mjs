/**
 * 生成 PWA 图标（纯 Node，零依赖）：rounded 背景 + 钥匙孔图形
 * 用法: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const off = y * (size * 4 + 1) + 1 + x * 4;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 图形绘制 ----------
function makePixelFn(size) {
  const s = size;
  const bg = [79, 110, 242];   // #4f6ef2
  const bg2 = [59, 82, 214];   // 渐变深
  const fg = [255, 255, 255];  // 白色钥匙孔

  const rr = s * 0.22;         // 圆角半径
  const cx = s / 2;
  const lockTop = s * 0.30;
  const lockBottom = s * 0.74;
  const lockW = s * 0.42;
  const arcR = s * 0.13;       // 锁环半径

  const inRoundedRect = (px, py, x0, y0, x1, y1, r) => {
    if (px < x0 || px > x1 || py < y0 || py > y1) return false;
    const dx = Math.max(x0 + r - px, px - (x1 - r), 0);
    const dy = Math.max(y0 + r - py, py - (y1 - r), 0);
    return dx * dx + dy * dy <= r * r;
  };
  const inArc = (px, py) => {
    const dx = px - cx;
    const dy = py - (lockTop + arcR);
    const d2 = dx * dx + dy * dy;
    return d2 >= (arcR * 0.55) ** 2 && d2 <= (arcR * 1.15) ** 2 && py >= lockTop - arcR && py <= lockTop + arcR * 0.7;
  };
  const inKeyhole = (px, py) => {
    const hx = cx, hy = (lockTop + lockBottom) / 2;
    const circleD = Math.hypot(px - hx, py - hy);
    if (circleD <= s * 0.045) return true;
    const slotW = s * 0.05;
    const slotTop = hy + s * 0.045;
    return px >= hx - slotW / 2 && px <= hx + slotW / 2 && py >= slotTop && py <= lockBottom - s * 0.06;
  };

  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    // 背景圆角矩形
    if (!inRoundedRect(px, py, 0, 0, s, s, rr)) return [0, 0, 0, 0];
    const t = py / s;
    let r = Math.round(bg[0] + (bg2[0] - bg[0]) * t);
    let g = Math.round(bg[1] + (bg2[1] - bg[1]) * t);
    let b = Math.round(bg[2] + (bg2[2] - bg[2]) * t);
    // 锁环
    if (inArc(px, py)) { r = fg[0]; g = fg[1]; b = fg[2]; }
    // 锁体
    if (inRoundedRect(px, py, cx - lockW / 2, lockTop, cx + lockW / 2, lockBottom, s * 0.08)) {
      r = fg[0]; g = fg[1]; b = fg[2];
    }
    // 钥匙孔
    if (inKeyhole(px, py)) {
      const kh = bg2;
      r = kh[0]; g = kh[1]; b = kh[2];
    }
    return [r, g, b, 255];
  };
}

for (const size of [16, 32, 48, 128, 192, 256, 512]) {
  const png = encodePng(size, makePixelFn(size));
  const name = size === 256 ? 'icon-256.png' : `icon-${size}.png`;
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`生成 icons/${name} (${png.length} 字节)`);
}

// ---------- ICO（Windows Tauri 需要）：内嵌 16/32/48/256 PNG ----------
function encodeIco(sizes) {
  const images = sizes.map((s) => ({ size: s, data: encodePng(s, makePixelFn(s)) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.size === 256 ? 0 : img.size; // width (0=256)
    e[1] = img.size === 256 ? 0 : img.size; // height
    e[2] = 0;  // colors
    e[3] = 0;  // reserved
    e.writeUInt16LE(1, 4);  // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += img.data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}
writeFileSync(join(OUT_DIR, 'icon.ico'), encodeIco([16, 32, 48, 256]));
console.log(`生成 icons/icon.ico`);
