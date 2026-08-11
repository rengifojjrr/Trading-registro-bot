import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import type { MfeMaeResult } from "@/lib/analytics/mfe-mae";

/**
 * MFE/MAE for a closed trade -- how far price moved in your favor and
 * against you at any point while the trade was open, distinct from where
 * you actually entered/exited. Always labeled as an estimate over the
 * trade's peak size, excluding commissions -- never presented as the
 * trade's real P&L (see lib/analytics/mfe-mae.ts).
 */
export function MfeMaeStats({ mfeMae }: { mfeMae: MfeMaeResult }) {
  return (
    <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-2">
      <div>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="w-fit text-xs text-muted-foreground underline decoration-dotted">
              Máximo a favor (MFE)
            </p>
          </TooltipTrigger>
          <TooltipContent>
            Mejor precio alcanzado mientras la operación estuvo abierta -- estimado sobre el tamaño máximo, sin
            comisiones.
          </TooltipContent>
        </Tooltip>
        <p className="text-lg font-semibold tabular-nums text-positive">
          {formatSignedMoney(mfeMae.mfeAmount)}
          <span className="ml-1.5 text-sm font-normal text-muted-foreground">@ {formatMoney(mfeMae.mfePrice)}</span>
        </p>
      </div>
      <div>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="w-fit text-xs text-muted-foreground underline decoration-dotted">
              Máximo en contra (MAE)
            </p>
          </TooltipTrigger>
          <TooltipContent>
            Peor precio alcanzado mientras la operación estuvo abierta -- estimado sobre el tamaño máximo, sin
            comisiones.
          </TooltipContent>
        </Tooltip>
        <p className="text-lg font-semibold tabular-nums text-negative">
          {formatSignedMoney(mfeMae.maeAmount)}
          <span className="ml-1.5 text-sm font-normal text-muted-foreground">@ {formatMoney(mfeMae.maePrice)}</span>
        </p>
      </div>
    </div>
  );
}
