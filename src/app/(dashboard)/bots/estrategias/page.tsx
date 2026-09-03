import { BookOpen, ChevronRight, Plus } from "lucide-react";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { EstrategiaDetalle } from "@/components/bots/estrategia-detalle";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { EMPTY_BASELINE, type Baseline } from "@/lib/bots/types";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  BIBLIOTECA,
  estrategiaPorSlug,
  type EstrategiaDeLaBiblioteca,
} from "@/lib/paper/strategy-library";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * El catálogo: las dieciocho estrategias que el simulador sabe operar.
 *
 * La pantalla contesta tres preguntas en este orden, que es el orden en que se
 * hacen: qué familias hay, qué hace cada estrategia y cuál me llevo. Por eso
 * cada ficha viene plegada -- dieciocho descripciones abiertas es un muro de
 * texto que nadie lee -- y por eso lo que se ve plegado son las dos cosas que
 * deciden si merece la pena abrirla: dónde opera y si alguien la ha medido.
 *
 * Va agrupada por familia y no por rentabilidad. Ordenarlas por lo que
 * ganaron sugeriría que se elige la de arriba, y no es así: una de HFT y una
 * de posición no compiten entre ellas, porque no se pagan con lo mismo ni
 * fallan por lo mismo. La familia es lo primero que hay que decidir.
 *
 * El alta de un bot ocurre en un `use server` de este mismo archivo. Podría
 * vivir en un `actions.ts` como el resto del módulo, y probablemente acabe
 * allí; está aquí porque es la única cosa que esta pantalla escribe y no la
 * usa nadie más.
 */

type Familia = EstrategiaDeLaBiblioteca["familia"];

const RUTA = "/bots/estrategias";

/**
 * Las familias, con lo que las distingue.
 *
 * El texto no dice cuánto dura cada operación -- eso ya lo dice la
 * temporalidad de cada ficha -- sino por qué gana y por dónde pierde, que es
 * lo que hace elegir. La lista está en orden de más rápida a más lenta.
 */
const FAMILIAS: { id: Familia; titulo: string; explicacion: string }[] = [
  {
    id: "HFT",
    titulo: "Alta frecuencia",
    explicacion:
      "Velas de un minuto y operaciones que duran lo que un café. Su enemigo no es equivocarse sino la comisión: con recorridos tan cortos, la tarifa se come la ventaja antes que ningún error de la estrategia.",
  },
  {
    id: "SCALPING",
    titulo: "Scalping",
    explicacion:
      "Velas de cinco minutos, operaciones de minutos a un par de horas. Muchas señales y poco recorrido cada una, así que o se acierta mucho o se corta muy rápido.",
  },
  {
    id: "INTRADIA",
    titulo: "Intradía",
    explicacion:
      "Velas de quince minutos y de una hora. Es donde caben los filtros de tendencia y de horario sin que el coste mande, y donde las horas del día todavía significan algo.",
  },
  {
    id: "SWING",
    titulo: "Swing",
    explicacion:
      "Velas diarias y posiciones de días o semanas. Casi toda la ganancia sale de un puñado de operaciones al año, así que lo que hay que garantizar es estar dentro cuando llegan.",
  },
  {
    id: "POSICION",
    titulo: "Posición",
    explicacion:
      "Velas diarias y meses dentro. No compiten en acertar sino en no estar dentro durante las caídas grandes; se juzgan contra comprar y no tocar nada, no contra las demás.",
  },
];

/**
 * Qué se le dice al usuario cuando el alta no sale.
 *
 * El problema viaja en la URL como un código y el texto se elige aquí, en vez
 * de mandar el mensaje ya escrito: una pantalla que pinta lo que venga en un
 * parámetro es una pantalla en la que cualquiera puede escribir, y con un
 * enlace bien puesto se le hace decir lo que uno quiera.
 */
const PROBLEMAS: Record<string, string> = {
  desconocida:
    "Esa estrategia no está en la biblioteca. Puede que se haya quitado desde que abriste la página.",
  reglas:
    "No se pudieron guardar las reglas. Si ya tienes una estrategia de backtest con ese mismo nombre, renómbrala y vuelve a intentarlo.",
  nombre:
    "Ya tienes un bot con ese nombre. Renombra el que tienes, o date de alta éste a mano desde «Nuevo bot».",
  alta: "No se pudo dar de alta el bot. Vuelve a intentarlo dentro de un momento.",
};

/**
 * La matrícula con la que un bot dice de qué estrategia salió.
 *
 * Se guarda en `magic_number`, que es literalmente eso -- la matrícula del bot
 * en la plataforma donde corre --, y aquí la plataforma es el simulador. Es lo
 * que permite que esta pantalla sepa cuáles ya te has llevado sin comparar
 * nombres, que el usuario puede cambiar. El prefijo evita confundirla con la
 * matrícula de un bot que corra de verdad en otro sitio.
 */
function matriculaDeLaBiblioteca(slug: string): string {
  return `biblioteca:${slug}`;
}

function slugDeLaMatricula(matricula: string | null): string | null {
  if (!matricula || !matricula.startsWith("biblioteca:")) return null;
  return matricula.slice("biblioteca:".length);
}

export default async function EstrategiasPage({
  searchParams,
}: {
  searchParams: Promise<{ problema?: string }>;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const { problema } = await searchParams;

  const { data: filas } = await supabase
    .from("bots")
    .select("id, name, magic_number")
    .eq("user_id", user.id);

  // Qué estrategias ya te has llevado. Con más de un bot de la misma se queda
  // el primero: el enlace es un atajo para ir a verlo, no un inventario.
  const yaCreados = new Map<string, { id: string; name: string }>();
  for (const fila of filas ?? []) {
    const slug = slugDeLaMatricula(fila.magic_number);
    if (slug && !yaCreados.has(slug)) yaCreados.set(slug, { id: fila.id, name: fila.name });
  }

  // Contado y no escrito a mano: el día que una estrategia se mida, la frase
  // de abajo tiene que cambiar sola. Un número a mano en un texto sobre no
  // inventarse números duraría exactamente hasta la siguiente medición.
  const sinMedir = BIBLIOTECA.filter((e) => e.medido === null).length;

  /**
   * Dar de alta un bot que opere estas reglas.
   *
   * Escribe dos filas: las reglas en `backtest_strategies`, que es de donde
   * las lee el simulador, y el bot que las apunta. En ese orden, porque el bot
   * necesita el identificador de las reglas; si el segundo paso falla, el
   * primero se deshace para no dejar estrategias huérfanas que luego aparecen
   * en el desplegable de todos los formularios.
   *
   * Nace en F1 y con el tamaño a cero. De la biblioteca al dinero se sube fase
   * a fase, y un bot que apareciera ya operando se saltaría entera la parte
   * del método que sirve para algo.
   */
  async function crearBotDesdeLaBiblioteca(formData: FormData) {
    "use server";

    const usuario = await requireUser();
    const slug = String(formData.get("slug") ?? "").trim();
    const estrategia = estrategiaPorSlug(slug);
    if (!estrategia) redirect(`${RUTA}?problema=desconocida`);

    const cliente = await createClient();
    const matricula = matriculaDeLaBiblioteca(slug);

    // Si ya existe, esto no es un error: es que se pulsó dos veces, o que se
    // llegó con el botón de atrás. Se lleva al bot que ya hay.
    const { data: existente } = await cliente
      .from("bots")
      .select("id")
      .eq("user_id", usuario.id)
      .eq("magic_number", matricula)
      .limit(1)
      .maybeSingle();
    if (existente) redirect(`/bots/${existente.id}`);

    const { data: reglas, error: errorReglas } = await cliente
      .from("backtest_strategies")
      .insert({
        user_id: usuario.id,
        name: estrategia.nombre,
        product_id: estrategia.mercado,
        rules: estrategia.reglas as unknown as Json,
        is_active: true,
      })
      .select("id")
      .single();
    if (errorReglas || !reglas) redirect(`${RUTA}?problema=reglas`);

    // Lo medido pasa a ser lo prometido: es contra esto contra lo que el
    // semáforo comparará lo que haga en papel. Sin medición se queda en
    // blanco, que es lo honesto -- un bot sin promesa no es lo mismo que uno
    // que prometió cero.
    const baseline: Baseline = estrategia.medido
      ? {
          ...EMPTY_BASELINE,
          profitFactor: estrategia.medido.profitFactor,
          maxDrawdownPct: estrategia.medido.ddPct,
          trades: estrategia.medido.trades,
          source: "BACKTEST",
          note: `De la biblioteca. Medido sobre ${estrategia.medido.ventana}.`,
        }
      : { ...EMPTY_BASELINE };

    const { data: bot, error: errorBot } = await cliente
      .from("bots")
      .insert({
        user_id: usuario.id,
        name: estrategia.nombre,
        market: estrategia.mercado,
        timeframe: estrategia.temporalidad,
        style: estrategia.estilo,
        block: estrategia.bloque,
        phase: "F1",
        sizing_pct: 0,
        magic_number: matricula,
        hypothesis: estrategia.hipotesis,
        descripcion_larga: estrategia.descripcion,
        familia_operativa: estrategia.familia,
        backtest_strategy_id: reglas.id,
        baseline: baseline as unknown as Json,
        notes:
          `${estrategia.procedencia}\n\n` +
          `Dado de alta desde la biblioteca de estrategias (${slug}). Las reglas se copiaron ` +
          `a «Estrategias de backtest» el día del alta: si mañana se corrige una condición en la ` +
          `biblioteca, este bot se queda con la copia de hoy.`,
      })
      .select("id")
      .single();

    if (errorBot || !bot) {
      await cliente
        .from("backtest_strategies")
        .delete()
        .eq("id", reglas.id)
        .eq("user_id", usuario.id);
      redirect(`${RUTA}?problema=${errorBot?.code === "23505" ? "nombre" : "alta"}`);
    }

    // Por dónde entró, igual que cualquier otro bot: el historial de fases es
    // lo que permite revisar la decisión meses después.
    await cliente.from("bot_phase_history").insert({
      user_id: usuario.id,
      bot_id: bot.id,
      from_phase: null,
      to_phase: "F1",
      reason: `Alta desde la biblioteca de estrategias (${slug}).`,
    });

    await recordAudit({
      userId: usuario.id,
      action: "BOT_CREATED",
      entityType: "bot",
      entityId: bot.id,
      metadata: { name: estrategia.nombre, phase: "F1", biblioteca: slug },
    });

    revalidatePath("/bots");
    revalidatePath("/bots/cantera");
    revalidatePath(RUTA);
    redirect(`/bots/${bot.id}`);
  }

  return (
    <>
      <PageHeader
        title="Estrategias"
        description="Las reglas que el simulador sabe operar, con lo que se sabe de cada una. De aquí sale cada bot de papel."
      />

      {problema && PROBLEMAS[problema] ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          {PROBLEMAS[problema]}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <BookOpen className="size-4 text-muted-foreground" aria-hidden />
            Cómo leer esta página
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Cada ficha cuenta tres cosas distintas y conviene no confundirlas:{" "}
            <span className="text-foreground">la hipótesis</span> es por qué debería funcionar,{" "}
            <span className="text-foreground">las reglas</span> son lo que el ordenador va a hacer
            de verdad, y <span className="text-foreground">las cifras</span> son lo que dio cuando
            alguien la midió. {sinMedir} de las {BIBLIOTECA.length} no tienen cifras, y lo dicen: en
            la biblioteca no se inventan números.
          </p>
          <p>
            Llevarse una crea un bot en F1, con el tamaño a cero y sin tocar dinero. La cuenta de
            papel se le abre y se enciende en{" "}
            <Link href="/bots/simulador" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
              el simulador
            </Link>
            ; de ahí a producción se sube fase a fase, que es todo el método. Lo que se lleva es una
            copia de las reglas: si mañana se corrige una condición aquí, el bot que ya existe se
            queda con la de hoy.
          </p>
        </CardContent>
      </Card>

      {FAMILIAS.map((familia) => {
        const deLaFamilia = BIBLIOTECA.filter((e) => e.familia === familia.id);
        if (deLaFamilia.length === 0) return null;

        return (
          <section key={familia.id} className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base font-semibold text-foreground">
                {familia.titulo}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {deLaFamilia.length} estrategia{deLaFamilia.length === 1 ? "" : "s"}
                </span>
              </h2>
              <p className="max-w-3xl text-sm text-muted-foreground">{familia.explicacion}</p>
            </div>

            <div className="flex flex-col gap-2">
              {deLaFamilia.map((estrategia) => (
                <FichaPlegable
                  key={estrategia.slug}
                  estrategia={estrategia}
                  bot={yaCreados.get(estrategia.slug) ?? null}
                  crear={crearBotDesdeLaBiblioteca}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

/**
 * Una estrategia plegada.
 *
 * Lo que se ve sin abrir es lo que decide si abrirla: el nombre, dónde opera y
 * si tiene cifras. El resumen no lleva la hipótesis porque son dos líneas y
 * convertiría una lista de dieciocho en un scroll; la hipótesis es lo primero
 * que hay dentro.
 */
function FichaPlegable({
  estrategia,
  bot,
  crear,
}: {
  estrategia: EstrategiaDeLaBiblioteca;
  bot: { id: string; name: string } | null;
  crear: (formData: FormData) => Promise<void>;
}) {
  const { medido } = estrategia;

  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-secondary/40">
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="text-sm font-medium text-foreground">{estrategia.nombre}</span>
        <span className="text-xs text-muted-foreground">
          {estrategia.mercado} · {estrategia.temporalidad}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {bot ? <Badge variant="default">Ya tienes un bot</Badge> : null}
          {medido ? (
            <Badge variant={medido.profitFactor >= 1 ? "positive" : "negative"}>
              {formatPercent(medido.pnlPct)} · factor {formatNumber(medido.profitFactor, 2)}
            </Badge>
          ) : (
            <Badge variant="outline">Sin medir</Badge>
          )}
        </span>
      </summary>

      <div className="border-t border-border px-3 py-4">
        <EstrategiaDetalle
          estrategia={estrategia}
          accion={
            bot ? (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/bots/${bot.id}` as Route}>Ver «{bot.name}»</Link>
                </Button>
                <span className="text-xs text-muted-foreground">
                  Ya tienes un bot con estas reglas. Se puede crear otro a mano desde «Nuevo bot»,
                  pero dos bots iguales no enseñan el doble: enseñan lo mismo dos veces.
                </span>
              </>
            ) : (
              <>
                <form action={crear}>
                  <input type="hidden" name="slug" value={estrategia.slug} />
                  <Button type="submit" size="sm">
                    <Plus className="size-4" aria-hidden />
                    Crear un bot con esta estrategia
                  </Button>
                </form>
                <span className="text-xs text-muted-foreground">
                  Entra en la cantera en F1 y con el tamaño a cero. La cuenta de papel se le abre
                  en el simulador.
                </span>
              </>
            )
          }
        />
      </div>
    </details>
  );
}
