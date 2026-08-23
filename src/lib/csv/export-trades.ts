import type { TradeTableRow } from "@/lib/analytics/queries";

/**
 * Las operaciones, en CSV, tal y como se ven en la tabla.
 *
 * La única salida que había era la copia de seguridad: un volcado JSON de la
 * base de datos entera, pensado para restaurar, no para mirar. Sacar tus
 * propias operaciones a una hoja de cálculo -- para cruzarlas con otra cosa,
 * para dárselas a alguien, para hacer una cuenta que la aplicación no hace --
 * no se podía.
 *
 * Se exporta lo que está filtrado en pantalla, no todo. Si acabas de mirar
 * agosto y le das a exportar, lo que esperas es agosto.
 *
 * Puro y sin base de datos, para poder probar el formato -- que es donde
 * están los fallos de un CSV -- sin montar nada.
 */

interface Columna {
  cabecera: string;
  valor: (t: TradeTableRow) => string;
}

/**
 * Fechas en ISO y números con punto decimal, sin separador de miles y sin
 * símbolo de moneda.
 *
 * Es lo contrario de lo que se enseña en pantalla, y a propósito: un CSV no
 * lo lee una persona, lo lee una hoja de cálculo. «1.234,56 $» entra como
 * texto en cualquier programa con la configuración regional equivocada, y
 * entonces no se puede ni sumar la columna.
 */
const COLUMNAS: Columna[] = [
  { cabecera: "id", valor: (t) => t.id },
  { cabecera: "producto", valor: (t) => t.product_id },
  { cabecera: "direccion", valor: (t) => t.direction },
  { cabecera: "estado", valor: (t) => t.status },
  { cabecera: "abierta_en", valor: (t) => t.opened_at },
  { cabecera: "cerrada_en", valor: (t) => t.closed_at ?? "" },
  { cabecera: "duracion_segundos", valor: (t) => t.duration_seconds?.toString() ?? "" },
  { cabecera: "contratos_entrada", valor: (t) => t.total_entry_qty ?? "" },
  { cabecera: "contratos_salida", valor: (t) => t.total_exit_qty ?? "" },
  { cabecera: "tamano_maximo", valor: (t) => t.max_size ?? "" },
  { cabecera: "precio_medio_entrada", valor: (t) => t.entry_wap ?? "" },
  { cabecera: "precio_medio_salida", valor: (t) => t.exit_wap ?? "" },
  { cabecera: "valor_nocional", valor: (t) => t.notional_value ?? "" },
  { cabecera: "comisiones", valor: (t) => t.total_commissions ?? "" },
  { cabecera: "resultado_bruto", valor: (t) => t.gross_pnl ?? "" },
  { cabecera: "resultado_neto", valor: (t) => t.net_pnl ?? "" },
  { cabecera: "rentabilidad_pct", valor: (t) => t.return_pct ?? "" },
  { cabecera: "entradas", valor: (t) => t.entries_count?.toString() ?? "" },
  { cabecera: "salidas", valor: (t) => t.exits_count?.toString() ?? "" },
  { cabecera: "sesion", valor: (t) => t.session_effective ?? "" },
  { cabecera: "origen", valor: (t) => t.source },
  { cabecera: "ajustada_a_mano", valor: (t) => (t.is_manually_adjusted ? "si" : "no") },
];

/**
 * Entrecomilla lo que lo necesita, y sólo eso.
 *
 * El identificador de producto lleva guiones y las fechas llevan dos puntos:
 * nada de eso rompe un CSV. Lo que sí rompe son las comas, los saltos de
 * línea y las comillas, que es exactamente lo que se escapa aquí.
 */
function celda(valor: string): string {
  if (!/[",\n\r]/.test(valor)) return valor;
  return `"${valor.replaceAll('"', '""')}"`;
}

export function tradesToCsv(trades: TradeTableRow[]): string {
  const lineas = [COLUMNAS.map((c) => c.cabecera).join(",")];

  for (const trade of trades) {
    lineas.push(COLUMNAS.map((c) => celda(c.valor(trade))).join(","));
  }

  // Terminación CRLF y BOM los pone quien sirve el archivo, no esto: aquí lo
  // que importa es que el contenido sea correcto.
  return lineas.join("\n");
}

/** Un nombre que diga qué hay dentro cuando lo encuentres en Descargas. */
export function csvFilename(params: { from?: string | null; to?: string | null }): string {
  const trozo = [params.from, params.to].filter(Boolean).join("_a_");
  return trozo ? `operaciones_${trozo}.csv` : "operaciones.csv";
}
