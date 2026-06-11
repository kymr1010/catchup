// 単語カード PWA の Service Worker
// - アプリシェル(HTML / JS / CSS / アイコン)をキャッシュしてオフライン起動を可能にする
// - 取得先 API(多くは別オリジン)や POST はキャッシュせずネットワークへ素通しする
const CACHE = "tango-cards-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // POST(結果送信)など GET 以外、および別オリジン(取得先 API)は素通し
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // 画面遷移はネットワーク優先(更新を反映)。失敗時はキャッシュした起点ページ
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() =>
          caches.match("./index.html").then((r) => r || caches.match("./")),
        ),
    );
    return;
  }

  // ビルド成果物(ハッシュ付きで不変)はキャッシュ優先
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
