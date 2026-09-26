/* 快扫侠 Service Worker（v3.0 起）
   作用：发送到桌面/主屏的安装版自动更新——主文档(index.html)每次联网打开都走网络取最新版，
   只有图标等静态资源走缓存；离线时回落到最近一次缓存的完整版本。
   用户数据（IndexedDB / localStorage）不经 Service Worker，更新与缓存清理均不会触碰。
   发新版注意：改动 sw.js 本身（如 CACHE 版本号）浏览器会自动重装；若替换了图标等
   静态资源，请同步把 CACHE 升为 saomiao-v<新版本号>，activate 时会自动清掉旧缓存。 */
const CACHE = 'saomiao-v3.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k.indexOf('saomiao-') === 0).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;   // 谷歌字体等跨域资源直连，不代理
  const accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || accept.indexOf('text/html') !== -1) {
    /* 主文档：网络优先——联网必得最新版，这就是"打开即自动更新"；
       网络失败（离线）时回落缓存，保证安装版无网也能用 */
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        return (await cache.match(req)) || (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  /* 其余同源静态资源：缓存优先，未命中才联网并回填 */
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (err) { return Response.error(); }
  })());
});
