/**
 * 下载 sql.js (浏览器内运行 SQLite 的 WASM 库) 到 public/lib/
 * 用法: node scripts/download-sqljs.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'lib');
mkdirSync(OUT, { recursive: true });

const VERSION = process.env.SQLJS_VERSION || '1.12.0';
const BASE = `https://cdn.jsdelivr.net/npm/sql.js@${VERSION}/dist/`;
const files = ['sql-wasm.js', 'sql-wasm.wasm'];

for (const f of files) {
  const url = BASE + f;
  process.stdout.write(`下载 ${url} ... `);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(join(OUT, f), buf);
  console.log(`OK (${buf.length} 字节)`);
}
console.log('完成。');
