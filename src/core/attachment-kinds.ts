/**
 * Lo que un adjunto es, sin nada de servidor.
 *
 * Vive aparte de `core/attachments.ts` porque el componente que los pinta es
 * de cliente y necesita estos nombres: importarlos del módulo de servidor
 * arrastraría al navegador `server-only`, el cliente de Supabase y la sesión
 * del usuario, y el compilador lo corta -- con razón.
 *
 * Las ranuras existen porque en el calendario de contenido «Videos» y «Listo»
 * no son lo mismo: uno es el material grabado y otro la versión que se
 * publica. En los demás módulos un adjunto es un adjunto y sólo se usa la
 * primera.
 */

export const ATTACHMENT_SLOTS = ["ADJUNTO", "MONTAJE", "FINAL"] as const;
export type AttachmentSlot = (typeof ATTACHMENT_SLOTS)[number];

export const SLOT_LABELS: Record<AttachmentSlot, string> = {
  ADJUNTO: "Adjunto",
  MONTAJE: "Montaje",
  FINAL: "Versión final",
};

export interface AttachmentRow {
  id: string;
  slot: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  /** Firmada y de corta vida: el cubo es privado. */
  url: string | null;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
