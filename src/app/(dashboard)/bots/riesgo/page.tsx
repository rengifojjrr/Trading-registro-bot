import Link from "next/link";

import { BlockBars } from "@/components/bots/block-bars";
import { CorrelationGrid } from "@/components/bots/correlation-grid";
import { KillSwitchLadder } from "@/components/bots/kill-switch-ladder";
import { PortfolioSettingsForm } from "@/components/bots/portfolio-settings-form";
import { PageHeader } from "@/components/layout/page-header";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildPortfolio } from "@/lib/bots/queries";

/**
 * El riesgo del portfolio entero.
 *
 * Los semáforos vigilan bot a bot; esto vigila que no se tuerza todo a la
 * vez: la escalera de emergencia, el reparto en bloques y las correlaciones.
 * Abajo, plegados, los umbrales: se cambian en enero, no un martes.
 */
export default async function PortfolioRiskPage() {
  const p = await buildPortfolio();
  const { context } = p;

  return (
    <>
      <PageHeader
        title="Riesgo del portfolio"
        description="La escalera de emergencia, el reparto 40/40/20 y cuánto se parecen los bots entre sí."
      />

      {context.accountSize === null ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          Falta el tamaño de la cuenta, así que el drawdown no se puede medir en porcentaje y la escalera no se
          activa.{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Ponerlo en Configuración
          </Link>
          .
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Kill-switch</CardTitle>
        </CardHeader>
        <CardContent>
          <KillSwitchLadder reading={p.killSwitch} drawdownMoney={p.drawdown.drawdownMoney} currency={context.currency} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bloques</CardTitle>
          </CardHeader>
          <CardContent>
            <BlockBars allocation={p.allocation} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Correlaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <CorrelationGrid matrix={p.correlation} names={p.names} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <CollapsibleSection title="Umbrales del portfolio" subtitle="Bloques, escalera y puertas. Se revisan en enero.">
            <PortfolioSettingsForm settings={context.settings} />
          </CollapsibleSection>
        </CardContent>
      </Card>
    </>
  );
}
