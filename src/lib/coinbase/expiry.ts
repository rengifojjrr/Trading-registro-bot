/**
 * Cuánto le queda a un contrato antes de vencer.
 *
 * Un futuro con vencimiento no es una posición que puedas dejar abierta y ya:
 * llega un día y se liquida sola, al precio que haya, decidas tú o no. La
 * aplicación guardaba `contract_expiry` desde el primer día y no lo miraba
 * nadie, así que la primera noticia habría sido la liquidación.
 *
 * Puro para poder probar los umbrales sin esperar a diciembre.
 */

export type ExpiryUrgency = "lejos" | "cerca" | "inminente" | "vencido";

export interface ExpiryStatus {
  urgency: ExpiryUrgency;
  daysLeft: number | null;
  message: string | null;
}

/** Dos semanas para empezar a mirarlo; tres días para que estorbe. */
const NEAR_DAYS = 14;
const IMMINENT_DAYS = 3;

export function evaluateExpiry(params: {
  productId: string;
  /** `contract_expiry` de Coinbase. Nulo en perpetuos, que nunca vencen. */
  contractExpiry: string | null;
  now?: Date;
}): ExpiryStatus {
  const { productId, contractExpiry } = params;
  if (!contractExpiry) return { urgency: "lejos", daysLeft: null, message: null };

  const expiry = new Date(contractExpiry);
  if (Number.isNaN(expiry.getTime())) {
    return { urgency: "lejos", daysLeft: null, message: null };
  }

  const now = params.now ?? new Date();
  const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);

  if (daysLeft < 0) {
    return {
      urgency: "vencido",
      daysLeft,
      message: `${productId} venció hace ${Math.abs(daysLeft)} día(s). Coinbase lo habrá liquidado al precio de referencia; si aquí sigue apareciendo una posición abierta, es de esta aplicación, no tuya.`,
    };
  }

  if (daysLeft <= IMMINENT_DAYS) {
    return {
      urgency: "inminente",
      daysLeft,
      message: `${productId} vence en ${daysLeft} día(s). Al vencer se liquida solo al precio que haya en ese momento, cierres tú o no.`,
    };
  }

  if (daysLeft <= NEAR_DAYS) {
    return {
      urgency: "cerca",
      daysLeft,
      message: `${productId} vence en ${daysLeft} días. Si piensas seguir con la posición, tendrás que pasarla al contrato siguiente.`,
    };
  }

  return { urgency: "lejos", daysLeft, message: null };
}
