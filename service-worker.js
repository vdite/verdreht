const CACHE_NAME = "verdreht-v6-cache2";
const APP_FILES = [
  "./?_verdreht=6",
  "./index.html?_verdreht=6",
  "./styles.css?v=6",
  "./app.js?v=6",
  "./manifest.webmanifest",
  "./fonts/pt-sans-regular.ttf",
  "./fonts/pt-sans-bold.ttf",
  "./fonts/oswald-variable.ttf",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        if (event.request.mode === "navigate") return caches.match("./?_verdreht=6");
        return Response.error();
      }),
  );
});
