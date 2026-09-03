const CACHE_VERSION = "bottlebound-shell-v5";
const APP_SHELL = [
  "/index.html",
  // Effect-status SVGs are bundled inline in the app entry.
  "/assets/app.js",
  "/assets/style.css",
  "/manifest.webmanifest",
  "/icon.svg",
  "/sw.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    requestUrl.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    caches
      .match(
        event.request.mode === "navigate" ? "/index.html" : requestUrl.pathname,
      )
      .then((cached) => {
        if (cached && !cached.redirected) {
          return cached;
        }

        return fetch(event.request).catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("/index.html").then((fallback) => {
              if (fallback && !fallback.redirected) {
                return fallback;
              }
              throw new Error("The app shell is not available offline.");
            });
          }
          throw new Error("The requested resource is not available offline.");
        });
      }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CHECK_APP_SHELL" || !event.ports[0]) {
    return;
  }

  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const matches = await Promise.all(
        APP_SHELL.map((url) => cache.match(url)),
      );
      event.ports[0].postMessage({
        type: "APP_SHELL_STATUS",
        ready: matches.every(Boolean),
        cacheVersion: CACHE_VERSION,
      });
    }),
  );
});
