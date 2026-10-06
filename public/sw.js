/**
 * El service worker, deliberadamente casi vacío.
 *
 * En una aplicación con sesión y cifras de dinero, una caché mal puesta no es
 * una optimización: es un fallo de los caros. Guardar una página HTML
 * autenticada significa poder enseñarla después de cerrar sesión; guardar una
 * respuesta de la API significa enseñar un P&L de ayer como si fuera el de
 * ahora. Y el segundo no se nota -- el número parece bueno.
 *
 * Así que aquí sólo se guardan dos cosas, y las dos son inmutables:
 *
 *   1. Los archivos de `/_next/static/`, cuyo nombre lleva un hash del
 *      contenido: si cambia el contenido cambia el nombre, así que servir el
 *      guardado nunca puede ser servir algo viejo.
 *   2. Los iconos, que no cambian entre despliegues.
 *
 * Todo lo demás va a la red siempre. Sin conexión, una navegación cae en una
 * página que lo dice, en vez de en el dinosaurio del navegador -- que es lo
 * único que la caché aporta de verdad en una aplicación como esta.
 */

const VERSION = "v1";
const ESTATICOS = `estaticos-${VERSION}`;
const OFFLINE_URL = "/offline";

/** Lo mínimo para que la pantalla de «sin conexión» se vea sin red. */
const PRECARGA = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ESTATICOS);
      // `reload` fuerza a ignorar la caché HTTP: si no, el service worker
      // nuevo podría precargar la página vieja que el navegador ya tenía.
      await cache.addAll(PRECARGA.map((url) => new Request(url, { cache: "reload" })));
      // Sin esto, la versión nueva se queda esperando a que se cierren todas
      // las pestañas, y en el móvil eso puede ser nunca.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Fuera las cachés de versiones anteriores. Sin esto se acumulan, y en
      // un teléfono con poco espacio eso acaba siendo el problema.
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n !== ESTATICOS).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Sólo GET. Un POST guardado y reintentado sería una operación duplicada.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nada de otros dominios: Supabase y Coinbase se hablan directamente, y
  // meter una caché por medio es meterse en una conversación autenticada.
  if (url.origin !== self.location.origin) return;

  const esInmutable =
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");

  if (esInmutable) {
    event.respondWith(
      (async () => {
        const guardado = await caches.match(request);
        if (guardado) return guardado;

        const respuesta = await fetch(request);
        if (respuesta.ok) {
          const cache = await caches.open(ESTATICOS);
          cache.put(request, respuesta.clone());
        }
        return respuesta;
      })(),
    );
    return;
  }

  // Las navegaciones van a la red, y si no hay red se dice.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ??
            new Response("Sin conexión.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Todo lo demás -- API, datos, HTML parcial -- sin tocar: red y sólo red.
});

/**
 * Los avisos que llegan al teléfono.
 *
 * El aviso llega **vacío** y aquí se pregunta qué enseñar. Parece un rodeo y
 * no lo es: un aviso con el contenido dentro puede llegar veinte minutos tarde
 * y decir algo que ya no es cierto -- «la sincronización falló» cuando la
 * siguiente ya fue bien --. Preguntando al despertar, se enseña lo que hay.
 *
 * Un recordatorio que acaba de sonar viene con sus botones, «Hecho» y «En 1 h»,
 * y su propia etiqueta: dos recordatorios a la misma hora son dos avisos, no
 * uno que tapa al otro.
 *
 * Si la petición falla -- sin red justo en ese momento, o la sesión caducó --
 * se enseña un aviso genérico en vez de ninguno: el sistema operativo exige
 * mostrar algo tras despertar por un push, y no hacerlo hace que deje de
 * entregarlos.
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let titulo = "Vida";
      let cuerpo = "Tienes algo pendiente.";
      let href = "/activity";

      try {
        const res = await fetch("/api/push/pending", { credentials: "include" });
        if (res.ok) {
          const datos = await res.json();
          // Ya se leyó desde otro sitio: no se enseña nada nuevo.
          if (!datos.hay) return;

          if (Array.isArray(datos.avisos) && datos.avisos.length > 0) {
            await Promise.all(
              datos.avisos.slice(0, 3).map((aviso) =>
                self.registration.showNotification(aviso.title || "Recordatorio", {
                  body: aviso.body || "",
                  icon: "/icons/icon-192.png",
                  badge: "/icons/icon-192.png",
                  tag: aviso.tag || "vida-recordatorio",
                  renotify: true,
                  // Lo que necesitan los botones y el toque: qué disparo es y a dónde ir.
                  data: { href: aviso.href || "/tareas/recordatorios", recordatorio: aviso.recordatorio || null },
                  actions: (aviso.acciones || []).slice(0, 2).map((a) => ({ action: a.action, title: a.title })),
                }),
              ),
            );
            return;
          }

          titulo = datos.title || titulo;
          cuerpo = datos.body || cuerpo;
          href = datos.href || href;
        }
      } catch {
        // Se queda el genérico.
      }

      await self.registration.showNotification(titulo, {
        body: cuerpo,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        // Uno solo a la vez: cinco avisos apilados de la misma sincronización
        // que falla cada cinco minutos son cinco veces la misma noticia.
        tag: "vida-aviso",
        renotify: true,
        data: { href },
      });
    })(),
  );
});

/** Una ruta de la propia aplicación, nunca otra web (`//otro.sitio` tampoco). */
function rutaPropia(href) {
  return typeof href === "string" && /^\/(?!\/)/.test(href) ? href : "/activity";
}

/**
 * Al pulsar el aviso, a donde lleva (Actividad, o el recordatorio) --
 * reutilizando la pestaña si ya está abierta.
 *
 * Los botones de un recordatorio no abren nada: «Hecho» lo cierra y «En 1 h» lo
 * pospone desde aquí, con la sesión del teléfono. Si no se puede (sin red, o la
 * sesión caducó), se abre la aplicación en el recordatorio para hacerlo a mano.
 */
self.addEventListener("notificationclick", (event) => {
  const datos = event.notification.data || {};
  const destino = rutaPropia(datos.href);
  event.notification.close();

  const abrir = async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const cliente of abiertas) {
      if ("focus" in cliente) {
        await cliente.focus();
        if ("navigate" in cliente) await cliente.navigate(destino);
        return;
      }
    }
    await self.clients.openWindow(destino);
  };

  if ((event.action === "hecho" || event.action === "posponer") && datos.recordatorio) {
    event.waitUntil(
      (async () => {
        try {
          const res = await fetch("/api/recordatorios/accion", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: datos.recordatorio.id,
              fireAt: datos.recordatorio.fireAt,
              accion: event.action,
              minutos: 60,
            }),
          });
          if (!res.ok) await abrir();
        } catch {
          await abrir();
        }
      })(),
    );
    return;
  }

  event.waitUntil(abrir());
});
