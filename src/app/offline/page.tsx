import { WifiOff } from "lucide-react";

/**
 * Lo que se ve sin conexión, en lugar del dinosaurio del navegador.
 *
 * Es la única página que el service worker guarda, así que tiene que valerse
 * sola: sin sesión, sin base de datos, sin nada que pedir por red. Por eso no
 * usa las tarjetas del resto de la aplicación -- llevan estilos que llegan en
 * archivos que podrían no estar guardados -- y trae sus colores puestos.
 *
 * No ofrece «reintentar» con un botón que recarga: en el móvil, volver a
 * intentarlo es tirar de la pantalla hacia abajo, y un botón que hace lo mismo
 * pero peor sólo añade una cosa que puede fallar.
 */
export const metadata = {
  title: "Sin conexión",
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "2rem",
        textAlign: "center",
        background: "#0b1220",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <WifiOff size={28} color="#38bdf8" aria-hidden />
      <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Sin conexión</h1>
      <p style={{ maxWidth: "24rem", fontSize: "0.875rem", color: "#94a3b8", margin: 0 }}>
        Tus datos están a salvo en el servidor. Esta aplicación no guarda cifras en el teléfono a
        propósito: un P&amp;L de ayer enseñado como si fuera el de ahora es peor que no ver nada.
      </p>
      <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: 0 }}>
        Vuelve a cargar cuando tengas señal.
      </p>
    </main>
  );
}
