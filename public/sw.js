/* 密码本 · Service Worker：离线可用（PWA） */
const CACHE_NAME = 'passbook-v75';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './generator.js',
  './passphrase.js',
  './watchtower.js',
  './totp.js',
  './autolock.js',
  './biometric.js',
  './theme.js',
  './search.js',
  './presets.js',
  './backup.js',
  './db-crypto.js',
  './agent-core.js',
  './agent-config.js',
  './lib/sql-wasm.js',
  './lib/sql-wasm.wasm',
  './lib/jsQR.js',
  './lib/qrcode-generator.js',
  './qr.js',
  './importer.js',
  './notes.js',
  './filehub.js',
  './lib/jszip.min.js',
  './lib/docx-preview.min.js',
  './lib/xlsx.full.min.js',
  './lib/pdfjs/pdf.min.mjs',
  './lib/pdfjs/pdf.worker.min.mjs',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './guide/main.png',
  './guide/manual.png',
  './guide/gen.png',
  './guide/phrase.png',
  './guide/agent.png',
  './guide/sync.png',
  './guide/import.png',
  './guide/notes.png',
  './guide/files.png',
  './guide-mobile/main.png',
  './guide-mobile/manual.png',
  './guide-mobile/gen.png',
  './guide-mobile/phrase.png',
  './guide-mobile/agent.png',
  './guide-mobile/sync.png',
  './guide-mobile/import.png',
  './guide-mobile/notes.png',
  './guide-mobile/files.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API 请求不走缓存（本机存储模式下不存在 API）
  if (url.pathname.startsWith('/api/')) return;
  // 跨域请求不处理
  if (url.origin !== location.origin) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
      return res;
    }))
  );
});
