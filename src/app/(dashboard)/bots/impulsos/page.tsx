import { ImpulseForm } from "@/components/bots/impulse-form";
import { ImpulseList } from "@/components/bots/impulse-list";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildPortfolio } from "@/lib/bots/queries";
import { formatSignedMoney, pnlTone } from "@/lib/format";

/**
 * El diario de impulsos.
 *
 * El componente más peligroso del sistema no es un bot: es quien lo vigila.
 * Aquí se apunta lo que pide el cuerpo y, a los siete días, sale la cifra de
 * cuánto habría costado hacerle caso.
 */
export default async function ImpulsesPage() {
  const p = await buildPortfolio();
  const { context } = p;
  const r = p.impulseReport;
  const bots = p.bots.filter((v) => v.bot.phase !== "RETIRADO").map((v) => ({ id: v.bot.id, name: v.bot.name }));

  return (
    <>
      <PageHeader
        title="Diario de impulsos"
        description="Lo que querías hacer, apuntado antes de hacerlo. A los siete días se mira qué habría costado."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          size="lg"
          label="Multas que no pagaste"
          value={formatSignedMoney(r.avoided, { currency: context.currency })}
          tone={Number(r.avoided) > 0 ? "positive" : "neutral"}
          sub={`${r.botWasRight} ${r.botWasRight === 1 ? "vez" : "veces"} tenía razón el bot`}
          description="Suma de lo que el bot ganó en la semana siguiente a un impulso de apagarlo, cerrar o reducir que no ejecutaste."
        />
        <StatTile
          size="lg"
          label="Cuando tenías razón"
          value={formatSignedMoney(`-${r.missed}`, { currency: context.currency })}
          tone={Number(r.missed) > 0 ? "negative" : "neutral"}
          sub={`${r.youWereRight} ${r.youWereRight === 1 ? "vez" : "veces"}`}
          description="Suma de lo que el bot perdió en la semana siguiente a un impulso que no ejecutaste: haber cedido habría ahorrado ese dinero."
        />
        <StatTile
          size="lg"
          label="Balance de no ceder"
          value={formatSignedMoney(r.balance, { currency: context.currency })}
          tone={pnlTone(r.balance)}
          description="Multas que no pagaste menos las veces que tenías razón. Positivo: dejar en paz a los bots te sale a cuenta."
        />
        <StatTile
          size="lg"
          label="Impulsos"
          value={r.total}
          sub={`${r.pending} en espera · ${r.executed} ejecutado${r.executed === 1 ? "" : "s"}`}
          description="Todos los apuntados. Los ejecutados no se evalúan: ahí no hay contrafactual, hay lo que pasó."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Me pica</CardTitle>
        </CardHeader>
        <CardContent>
          <ImpulseForm bots={bots} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Los apuntados</CardTitle>
        </CardHeader>
        <CardContent>
          <ImpulseList evaluations={p.impulses} currency={context.currency} timezone={context.timezone} />
        </CardContent>
      </Card>
    </>
  );
}
