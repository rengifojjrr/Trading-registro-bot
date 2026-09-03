"use client";

import { Play, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { encenderCuenta } from "@/app/(dashboard)/bots/simulador/actions";
import { BotCapitalControl } from "@/components/bots/bot-capital-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatDateTime, formatMoney, formatNumber, formatPercent, formatSignedMoney, pnlColorClass } from "@/lib/format";

/**
 * La posición que un bot tiene abierta ahora mismo, tal y como se enseña.
 *
 * Los precios llegan ya como números: la conversión desde las cadenas que
 * devuelve Postgres para las columnas `numeric` se hace en el servidor, de una
 * vez, en lugar de repartir `Number(...)` por el JSX.
 */
export interface PosicionEnPantalla {
  lado: "LARGO" | "CORTO";
  size: number;
  precioEntrada: number;
  stop: number | null;
  objetivo: number | null;
  horaEntrada: string;
}

/** Un bot en el simulador. Una fila de la tabla. */
export interface FilaSimulador {
  botId: string;
  nombre: string;
  /** `bots.familia_operativa`: HFT, SCALPING, INTRADIA, SWING o POSICION. */
  familia: string | null;
  mercado: string;
  temporalidad: string;
  /** `null` cuando el bot todavía no tiene cuenta de papel abierta. */
  capital: number | null;
  equity: number | null;
  /** Patrimonio menos capital: lo que la estrategia ha hecho, ingresos aparte. */
  pnl: number | null;
  pnlPct: number | null;
  encendido: boolean;
  operaciones: number;
  posicion: PosicionEnPantalla | null;
  ultimoTick: string | null;
  /**
   * Por qué el ciclo se saltaría este bot, si es que se lo salta. Se calcula
   * en el servidor con las mismas funciones que usa el ciclo, para que la
   * pantalla no invente su propia versión de «este no puede operar».
   */
  problema: string | null;
}

/**
 * Las cuatro familias, en el idioma de la interfaz.
 *
 * La columna de la base guarda la clave en mayúsculas por el check de la
 * tabla; esto es sólo cómo se lee. Lo que no esté en el mapa se enseña tal
 * cual en vez de desaparecer: un valor inesperado en la base tiene que
 * poderse ver para poder arreglarlo.
 */
const FAMILIA_ETIQUETA: Record<string, string> = {
  HFT: "HFT",
  SCALPING: "Scalping",
  INTRADIA: "Intradía",
  SWING: "Swing",
  POSICION: "Posición",
};

/**
 * Los bots operando con dinero ficticio, uno por fila.
 *
 * Cada fila es una cuenta de papel: se enciende, se apaga y se le presta o se
 * le quita capital sin salir de la tabla. En pantalla estrecha se convierte en
 * tarjetas, igual que `BotTable`: nueve columnas en un móvil son un arrastre
 * horizontal que nadie hace.
 */
export function SimuladorPanel({
  filas,
  moneda,
  zona,
  capitalPorDefecto,
}: {
  filas: FilaSimulador[];
  moneda: string;
  zona: string;
  /** `paper_settings.capital_por_defecto`: lo que se propone al abrir una cuenta. */
  capitalPorDefecto: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <BarraDeCiclo />

      <ul className="flex flex-col gap-2 lg:hidden">
        {filas.map((f) => (
          <li key={f.botId} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <Link href={`/bots/${f.botId}` as Route} className="text-sm font-semibold text-foreground hover:underline">
                  {f.nombre}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Familia familia={f.familia} />
                  <span className="text-xs text-muted-foreground">
                    {f.mercado} · {f.temporalidad}
                  </span>
                </div>
              </div>
              <Interruptor fila={f} />
            </div>

            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Capital</dt>
                <dd className="tabular-nums text-foreground">
                  <BotCapitalControl
                    botId={f.botId}
                    nombre={f.nombre}
                    capital={f.capital}
                    moneda={moneda}
                    sugerido={capitalPorDefecto}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Patrimonio</dt>
                <dd className="tabular-nums text-foreground">
                  {f.equity === null ? "--" : formatMoney(f.equity, { currency: moneda, compact: true })}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">P&L</dt>
                <dd className={`tabular-nums ${pnlColorClass(f.pnl)}`}>
                  {f.pnl === null ? "--" : formatSignedMoney(f.pnl, { currency: moneda, compact: true })}
                  {f.pnlPct === null ? null : (
                    <span className="ml-1 text-muted-foreground">{formatPercent(f.pnlPct, 1)}</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{f.operaciones === 1 ? "1 operación" : `${f.operaciones} operaciones`}</span>
              <Posicion posicion={f.posicion} moneda={moneda} zona={zona} />
            </div>

            <Problema texto={f.problema} />
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left font-medium">Bot</th>
              <th className="py-2 pr-3 text-left font-medium">Familia</th>
              <th className="py-2 pr-3 text-center font-medium">Encendido</th>
              <th className="py-2 pr-3 text-right font-medium">Capital</th>
              <th className="py-2 pr-3 text-right font-medium">Patrimonio</th>
              <th className="py-2 pr-3 text-right font-medium">P&L</th>
              <th className="py-2 pr-3 text-right font-medium">Ops.</th>
              <th className="py-2 text-left font-medium">Posición</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.botId} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="py-2 pr-3">
                  <Link href={`/bots/${f.botId}` as Route} className="font-medium text-foreground hover:underline">
                    {f.nombre}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {f.mercado} · {f.temporalidad}
                  </div>
                  <Problema texto={f.problema} />
                </td>
                <td className="py-2 pr-3">
                  <Familia familia={f.familia} />
                </td>
                <td className="py-2 pr-3">
                  <div className="flex justify-center">
                    <Interruptor fila={f} />
                  </div>
                </td>
                <td className="py-2 pr-3 text-right">
                  <div className="flex justify-end">
                    <BotCapitalControl
                      botId={f.botId}
                      nombre={f.nombre}
                      capital={f.capital}
                      moneda={moneda}
                      sugerido={capitalPorDefecto}
                    />
                  </div>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                  {f.equity === null ? "--" : formatMoney(f.equity, { currency: moneda })}
                </td>
                <td className={`py-2 pr-3 text-right tabular-nums ${pnlColorClass(f.pnl)}`}>
                  {f.pnl === null ? "--" : formatSignedMoney(f.pnl, { currency: moneda })}
                  {f.pnlPct === null ? null : (
                    <div className="text-xs font-normal text-muted-foreground">{formatPercent(f.pnlPct, 1)}</div>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{f.operaciones}</td>
                <td className="py-2 text-left">
                  <Posicion posicion={f.posicion} moneda={moneda} zona={zona} />
                  {f.ultimoTick ? (
                    <div className="text-xs text-muted-foreground">Visto {formatDateTime(f.ultimoTick, zona)}</div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Familia({ familia }: { familia: string | null }) {
  if (!familia) return <span className="text-xs text-muted-foreground">--</span>;
  return <Badge variant="outline">{FAMILIA_ETIQUETA[familia] ?? familia}</Badge>;
}

function Problema({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p className="mt-1 flex items-start gap-1 text-xs text-warning">
      <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
      {texto}
    </p>
  );
}

function Posicion({
  posicion,
  moneda,
  zona,
}: {
  posicion: PosicionEnPantalla | null;
  moneda: string;
  zona: string;
}) {
  if (!posicion) return <span className="text-xs text-muted-foreground">Sin posición</span>;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={posicion.lado === "LARGO" ? "positive" : "negative"}>{posicion.lado}</Badge>
        <span className="text-xs tabular-nums text-foreground">
          {formatNumber(posicion.size, 6)} a {formatMoney(posicion.precioEntrada, { currency: moneda })}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        Desde {formatDateTime(posicion.horaEntrada, zona)}
        {posicion.stop === null ? "" : ` · stop ${formatMoney(posicion.stop, { currency: moneda, compact: true })}`}
        {posicion.objetivo === null
          ? ""
          : ` · objetivo ${formatMoney(posicion.objetivo, { currency: moneda, compact: true })}`}
      </span>
    </div>
  );
}

/**
 * El interruptor de una cuenta.
 *
 * Apagar con una posición abierta la cierra a mercado, y eso se pregunta
 * antes: es la única acción de esta pantalla que mueve dinero de golpe sin que
 * lo haya decidido la estrategia.
 */
function Interruptor({ fila }: { fila: FilaSimulador }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function cambiar(siguiente: boolean) {
    if (!siguiente && fila.posicion) {
      const seguro = window.confirm(
        `«${fila.nombre}» tiene una posición abierta. Al apagarlo se cierra a mercado ahora mismo, con motivo «apagado». ¿Seguir?`,
      );
      if (!seguro) return;
    }

    iniciar(async () => {
      const r = await encenderCuenta({ botId: fila.botId, encendido: siguiente });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(siguiente ? `«${fila.nombre}» encendido.` : `«${fila.nombre}» apagado.`);
      router.refresh();
    });
  }

  return (
    <Switch
      checked={fila.encendido}
      // Sin cuenta no hay nada que encender: el capital es lo que la abre.
      disabled={pendiente || fila.capital === null}
      onCheckedChange={cambiar}
      aria-label={`${fila.encendido ? "Apagar" : "Encender"} ${fila.nombre}`}
    />
  );
}

/** Lo que devuelve `POST /api/paper/tick`, de lo que aquí se usa. */
interface ResumenTick {
  cuentas: number;
  abiertas: number;
  cerradas: number;
  omitidas: number;
  errores: number;
}

function leerResumen(cuerpo: unknown): ResumenTick | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const c = cuerpo as Record<string, unknown>;
  if (typeof c.cuentas !== "number") return null;
  const numero = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    cuentas: c.cuentas,
    abiertas: numero(c.abiertas),
    cerradas: numero(c.cerradas),
    omitidas: numero(c.omitidas),
    errores: numero(c.errores),
  };
}

function leerError(cuerpo: unknown): string | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const c = cuerpo as Record<string, unknown>;
  return typeof c.error === "string" ? c.error : null;
}

/**
 * El botón de evaluar ahora.
 *
 * El ciclo lo dispara un cron cada cinco minutos; esto es para no esperarlos
 * cuando acabas de encender un bot. Va por `POST /api/paper/tick` -- la ruta
 * que ya existe y que sin secreto sólo corre los bots de quien la llama -- en
 * vez de por una acción de servidor propia, para que el cron y el botón pasen
 * exactamente por el mismo código.
 */
function BarraDeCiclo() {
  const router = useRouter();
  const [corriendo, setCorriendo] = useState(false);

  async function correr() {
    setCorriendo(true);
    try {
      const respuesta = await fetch("/api/paper/tick", { method: "POST" });
      const cuerpo: unknown = await respuesta.json();

      if (!respuesta.ok) {
        toast.error(leerError(cuerpo) ?? "No se pudo correr el ciclo.");
        return;
      }

      const resumen = leerResumen(cuerpo);
      if (!resumen) {
        toast.error("El ciclo respondió algo que no se entiende.");
        return;
      }

      if (resumen.cuentas === 0) {
        toast.info("No hay ningún bot encendido.");
        return;
      }

      toast.success(
        `${resumen.cuentas} ${resumen.cuentas === 1 ? "cuenta mirada" : "cuentas miradas"}: ${resumen.abiertas} abierta(s), ${resumen.cerradas} cerrada(s), ${resumen.omitidas} sin evaluar.`,
        resumen.errores > 0
          ? { description: `${resumen.errores} con error. Mira el registro del servidor.` }
          : undefined,
      );
      router.refresh();
    } catch {
      // Un fallo de red aquí no rompe nada: el ciclo es idempotente por vela y
      // el cron volverá a pasar. Lo único que hace falta es no dejar el botón
      // girando para siempre.
      toast.error("No se pudo hablar con el servidor.");
    } finally {
      setCorriendo(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        El ciclo corre solo cada cinco minutos y evalúa una vela de cada bot encendido. Una vela ya evaluada no
        se repite, así que pulsarlo dos veces seguidas no abre dos posiciones.
      </p>
      <Button size="sm" variant="outline" onClick={correr} disabled={corriendo}>
        <Play className="size-4" aria-hidden />
        {corriendo ? "Corriendo…" : "Correr un ciclo ahora"}
      </Button>
    </div>
  );
}
