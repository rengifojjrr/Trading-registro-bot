/**
 * Lo que se escribe en el buscador, cuando no es texto.
 *
 * La búsqueda sólo entendía palabras. Pero la mitad de lo que uno busca en un
 * diario de trading no es una palabra: es «el 12 de agosto» o «la que perdí
 * quinientos». Escribir eso y no encontrar nada enseña que la búsqueda no vale,
 * y a partir de ahí no se vuelve a usar.
 *
 * Se reconocen dos cosas, y sólo dos: una **fecha** y una **cifra**. Lo demás
 * sigue siendo texto. La lista corta es deliberada -- un intérprete que intenta
 * adivinar demasiado acierta menos, y equivocarse aquí manda al usuario a una
 * pantalla que no pidió.
 *
 * Puro: interpreta, no busca.
 */

export type Interpretation =
  | { kind: "TEXTO" }
  | { kind: "FECHA"; date: string; label: string }
  | { kind: "CIFRA"; amount: number; label: string };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Interpreta lo escrito.
 *
 * El orden importa: la fecha se comprueba antes que la cifra, porque
 * «12/08/2026» tiene números dentro y sin comprobar la fecha primero se leería
 * como la cifra 12.
 */
export function interpret(raw: string, hoy: string): Interpretation {
  const texto = raw.trim().toLowerCase();
  if (texto === "") return { kind: "TEXTO" };

  const fecha = comoFecha(texto, hoy);
  if (fecha) return fecha;

  const cifra = comoCifra(texto);
  if (cifra) return cifra;

  return { kind: "TEXTO" };
}

/**
 * Fechas en las formas que se escriben de verdad.
 *
 * «hoy», «ayer», «12 de agosto», «12/08», «2026-08-12». El año se supone el de
 * la fecha de referencia cuando no se escribe: buscando «12 de agosto» en
 * agosto de 2026, nadie quiere el de 2019.
 */
function comoFecha(texto: string, hoy: string): Interpretation | null {
  if (texto === "hoy") return { kind: "FECHA", date: hoy, label: "hoy" };
  if (texto === "ayer") {
    return { kind: "FECHA", date: desplazar(hoy, -1), label: "ayer" };
  }
  if (texto === "anteayer") {
    return { kind: "FECHA", date: desplazar(hoy, -2), label: "anteayer" };
  }

  // 2026-08-12
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // 12/08 o 12/08/2026 (y con guiones)
  const barras = texto.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (barras) {
    const anio = barras[3] ? normalizarAnio(Number(barras[3])) : Number(hoy.slice(0, 4));
    return fechaValida(anio, Number(barras[2]), Number(barras[1]));
  }

  // 12 de agosto, 12 agosto, 12 de agosto de 2026
  const conMes = texto.match(/^(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)(?:\s+(?:de\s+)?(\d{4}))?$/);
  if (conMes) {
    const mes = MESES.findIndex((m) => m.startsWith(sinTildes(conMes[2])));
    if (mes >= 0) {
      const anio = conMes[3] ? Number(conMes[3]) : Number(hoy.slice(0, 4));
      return fechaValida(anio, mes + 1, Number(conMes[1]));
    }
  }

  return null;
}

/**
 * Cifras, con o sin signo.
 *
 * «-500» y «500» son búsquedas distintas: la primera pide pérdidas de esa
 * magnitud y la segunda cualquiera de las dos. Se conserva el signo y quien
 * busca decide qué hacer con él.
 *
 * Se descartan los números pequeños sin signo ni símbolo: «5» es mucho más
 * probable que sea parte de un nombre que una búsqueda por importe, y
 * secuestrar el texto ahí haría que buscar «top 5» dejara de funcionar.
 */
function comoCifra(texto: string): Interpretation | null {
  const limpio = texto.replace(/[$€\s]/g, "").replace(/,/g, ".");
  const m = limpio.match(/^([+-]?)(\d+(?:\.\d+)?)$/);
  if (!m) return null;

  const valor = Number(m[2]);
  if (!Number.isFinite(valor)) return null;

  const conSigno = m[1] !== "";
  const conSimbolo = /[$€]/.test(texto);
  if (!conSigno && !conSimbolo && valor < 100) return null;

  const amount = m[1] === "-" ? -valor : valor;
  return {
    kind: "CIFRA",
    amount,
    label: amount < 0 ? `pérdidas de ${Math.abs(amount)}` : `importes de ${amount}`,
  };
}

function fechaValida(anio: number, mes: number, dia: number): Interpretation | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (anio < 1970 || anio > 2200) return null;

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  // Un 31 de febrero se desborda a marzo: comprobarlo evita aceptar fechas
  // que no existen y llevar a un día que no es el que se escribió.
  if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;

  const iso = fecha.toISOString().slice(0, 10);
  return { kind: "FECHA", date: iso, label: `${dia} de ${MESES[mes - 1]} de ${anio}` };
}

/** «26» es 2026, no el año 26. Dos cifras se completan con el siglo actual. */
function normalizarAnio(n: number): number {
  return n < 100 ? 2000 + n : n;
}

function desplazar(iso: string, dias: number): string {
  const fecha = new Date(`${iso}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
