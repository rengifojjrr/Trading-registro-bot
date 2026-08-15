"use client";

/**
 * Last-resort boundary: catches a failure in the root layout itself, which
 * the per-route error.tsx cannot. Without it, that class of error rendered
 * a blank white page with no way back.
 *
 * It replaces the whole document, so it has to bring its own <html>/<body>
 * and cannot rely on the app's stylesheet being present -- hence the inline
 * styles rather than Tailwind classes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "hsl(222, 47%, 6%)",
          color: "hsl(210, 40%, 96%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            La aplicación no pudo cargarse
          </h1>
          <p style={{ fontSize: "0.875rem", color: "hsl(215, 20%, 65%)", lineHeight: 1.6 }}>
            Ocurrió un error antes de que se pudiera dibujar la página. Tus datos no se han visto
            afectados: esta pantalla solo significa que la interfaz falló al arrancar.
          </p>
          {/* The digest is what makes a report actionable in the deployment
              logs; the message itself may be minified in production. */}
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "hsl(215, 20%, 45%)", marginTop: "0.75rem" }}>
              Referencia del error: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "none",
              backgroundColor: "hsl(199, 89%, 48%)",
              color: "hsl(222, 47%, 6%)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
