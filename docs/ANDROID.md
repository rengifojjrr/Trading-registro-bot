# La aplicación en el móvil

Dos cosas distintas que la gente confunde: **la dirección fija** y **el APK**.
La primera resuelve el 90% del problema y no hace falta instalar nada.

---

## 1. La dirección fija (esto es lo que estabas buscando)

Vercel da **dos clases de dirección** a cada proyecto, y es fácil coger la
equivocada:

| Cuál | Aspecto | Cambia |
|---|---|---|
| **De producción** | `tu-proyecto.vercel.app` | **Nunca.** Siempre apunta al último despliegue. |
| De despliegue | `tu-proyecto-a1b2c3d4-tuequipo.vercel.app` | En cada despliegue. |

Si cada vez que cambias algo tienes que ir a Vercel a por un enlace nuevo, es
que estás copiando la segunda: es la que sale destacada en la pantalla del
despliegue recién hecho, y es la que casi todo el mundo copia.

**Dónde está la buena:** en Vercel, entra al proyecto y mira **Settings →
Domains**. La de arriba, sin hash, es la de producción. También la ves en la
página del proyecto bajo el título, marcada como *Production*.

Esa dirección ya funciona hoy y ya apunta al último despliegue. No hay nada que
cambiar en el código: es cómo funciona Vercel desde siempre.

> **Si quieres una más corta**, en esa misma pantalla puedes añadir un dominio
> propio (`registro.tudominio.com`). El APK apuntaría ahí y tampoco habría que
> reconstruirlo nunca.

### Ponla también en la variable de entorno

En Vercel → Settings → Environment Variables:

```
NEXT_PUBLIC_APP_URL = https://tu-proyecto.vercel.app
```

No cambia el comportamiento del día a día; sirve para que los enlaces que la
aplicación genera apunten siempre al mismo sitio.

---

## 2. Instalar sin APK (treinta segundos, sin herramientas)

El sitio ya es una aplicación instalable. Desde el móvil:

1. Abre la dirección de producción en **Chrome**.
2. Menú (⋮) → **Añadir a pantalla de inicio** / *Instalar aplicación*.

Sale un icono como cualquier otra aplicación, se abre sin barra de direcciones
y **siempre muestra la última versión**, porque carga del servidor.

Para la mayoría de los casos esto es todo. El APK sólo aporta poder pasar el
archivo a otro teléfono e instalarlo sin abrir el navegador.

---

## 3. El APK

### Qué es y qué no

El APK **no lleva la aplicación dentro**: es una envoltura que abre la
dirección de producción a pantalla completa (un *Trusted Web Activity*). Eso
significa que:

- Se construye **una vez** y no se vuelve a tocar.
- Cada despliegue en Vercel se ve en el teléfono sin reinstalar nada.
- Si cambias el nombre o el icono de la aplicación, entonces sí hay que
  reconstruirlo — son de las pocas cosas que van dentro del archivo.

### Paso 1 · Generar la clave de firma (una vez en la vida)

```bash
./scripts/android-keystore.sh
```

Te pide una contraseña y escribe tres cosas: el almacén de claves, su versión
en base64 para GitHub, y la huella para Vercel.

> **Esta clave no se puede perder ni cambiar.** Android identifica una
> aplicación por su firma: un APK firmado con otra clave no es una
> actualización de este, es otra aplicación, y para instalarla hay que
> desinstalar la anterior. Guarda el archivo donde guardes lo que no se puede
> volver a generar. El repositorio lo ignora a propósito.

### Paso 2 · Los secretos en GitHub

En **Settings → Secrets and variables → Actions**:

| Secreto | Qué es |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | El bloque largo que imprime el script |
| `ANDROID_KEYSTORE_PASSWORD` | La contraseña que pusiste |
| `ANDROID_KEY_PASSWORD` | La misma |
| `ANDROID_KEY_ALIAS` | `registro` |

### Paso 3 · La huella en Vercel

En **Settings → Environment Variables**:

```
ANDROID_CERT_FINGERPRINTS = AB:CD:EF:...   (la que imprime el script)
ANDROID_PACKAGE_NAME      = app.registro.trading
```

Y vuelve a desplegar.

Esto es lo que hace que Android se fíe: sin ello el APK funciona igual, pero se
abre **con la barra de direcciones del navegador encima**, que es lo que hace
que no parezca una aplicación. La aplicación sirve esa confirmación en
`/.well-known/assetlinks.json`, leyéndola de la variable — así rotar la clave
es cambiar una variable, no desplegar código.

### Paso 4 · Construir

En GitHub → **Actions → APK de Android → Run workflow**, y pon la dirección de
producción (la fija, sin hash).

A los pocos minutos, el APK está en los artefactos de la ejecución. Descárgalo,
pásalo al teléfono y ábrelo. Android pedirá permiso para instalar de fuera de
Play Store: es normal para una aplicación privada que no está publicada.

---

## Qué se guarda en el teléfono

Casi nada, y a propósito. El *service worker* sólo guarda dos cosas, las dos
inmutables: los archivos de `/_next/static/` (llevan un hash del contenido en
el nombre, así que servir el guardado nunca puede ser servir algo viejo) y los
iconos.

**Ninguna página con sesión y ninguna respuesta de la API se guarda nunca.**
Guardar una página autenticada significaría poder verla después de cerrar
sesión; guardar una respuesta de la API significaría enseñar un P&L de ayer
como si fuera el de ahora — y ese no se nota, porque el número parece bueno.

Sin conexión sale una pantalla que lo dice, en lugar del dinosaurio del
navegador. Es lo único que la caché aporta de verdad en una aplicación como
esta.

---

## Si algo no sale

**No aparece «Instalar aplicación» en Chrome.**
Comprueba que estas dos direcciones responden `200` sin haber iniciado sesión:

```bash
curl -I https://tu-proyecto.vercel.app/manifest.webmanifest
curl -I https://tu-proyecto.vercel.app/sw.js
```

Si redirigen a `/login`, falta añadirlas a `PUBLIC_PATH_PREFIXES` en
`src/lib/supabase/middleware.ts`.

**El APK abre con la barra de direcciones.**
Falta `ANDROID_CERT_FINGERPRINTS` en Vercel, o no coincide con la clave con la
que se firmó. Compruébalo:

```bash
curl https://tu-proyecto.vercel.app/.well-known/assetlinks.json
```

Si devuelve `[]`, la variable no está puesta. Android además cachea esto un
rato: desinstala y vuelve a instalar el APK después de desplegar.

**Cambié el icono y el APK sigue con el viejo.**
El icono va dentro del archivo. Vuelve a ejecutar el flujo de Actions.
