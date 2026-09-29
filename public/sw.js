const CACHE_NAME = "gestor-v2";

// Só arquivos estáticos (JS/CSS com hash e ícones) vão pro cache. Páginas e
// dados não são guardados: são privados de cada conta e mudam o tempo todo —
// a versão anterior guardava tudo, inclusive telas de outra sessão e dados velhos.
function ehEstatico(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || /\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$/.test(url.pathname))
  );
}

const PAGINA_OFFLINE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#ededed;font-family:system-ui,sans-serif;text-align:center;padding:24px}button{margin-top:16px;background:#10b981;color:#0a0a0a;border:0;border-radius:8px;padding:10px 16px;font-weight:600}</style></head><body><div><h1 style="font-size:18px">Sem conexão</h1><p style="color:#a3a3a3;font-size:14px">Verifique sua internet e tente de novo.</p><button onclick="location.reload()">Tentar de novo</button></div></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (ehEstatico(url)) {
    // cache-first: esses arquivos têm hash no nome e nunca mudam
    event.respondWith(
      caches.match(request).then(
        (cacheado) =>
          cacheado ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copia = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () => new Response(PAGINA_OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Gestor", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Gestor", {
      body: payload.body ?? "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      // reaproveita uma janela do app que já esteja aberta
      const qualquer = clients.find((c) => "navigate" in c);
      if (qualquer) return qualquer.navigate(url).then((c) => c && c.focus());
      return self.clients.openWindow(url);
    }),
  );
});
