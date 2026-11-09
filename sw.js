// Venüs Ada Sitesi — uygulama kabuğu (çevrimdışı açılış için). Veriler her zaman sunucudan gelir.
const KABUK = "venusada-v3";
const DOSYALAR = ["./", "./index.html", "./yonetim.html", "./stil.css?v=3", "./ortak.js?v=3", "./sakin.js?v=3", "./yonetim.js?v=3", "./config.js", "./ikon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(KABUK).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== KABUK).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const k = r.clone(); caches.open(KABUK).then((c) => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request)));
});
