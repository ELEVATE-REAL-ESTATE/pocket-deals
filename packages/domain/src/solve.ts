/**
 * Underwriting inversé : quel prix payer ?
 *  • Prix recommandé = prix le plus élevé qui ATTEINT le TRI cible (et reste
 *    finançable au RCD min). C'est le vrai plafond de ce qu'on paie.
 *  • Plafond finançable = prix le plus élevé où le RCD min tient encore.
 * Le rendement comptant et le multiple ne plafonnent PAS le prix (indicatifs).
 * Réutilise `underwrite` — aucune logique financière dupliquée.
 */
import { underwrite } from "./underwrite.js";
import type { InvestmentObjectives } from "./objectives.js";
import type { DealInputs } from "./types.js";

export interface MaxPriceResult {
  askingPrice: number;
  /** Prix le plus élevé qui atteint le TRI cible (et le RCD min). */
  recommendedPrice: number;
  /** Plafond finançable absolu : prix le plus élevé où le RCD min tient. */
  maxPrice: number;
  /** Rabais requis sur le prix demandé pour atteindre le TRI cible. */
  discountNeeded: number;
  discountPct: number;
  /** Marge = (prix recommandé − demandé) / demandé. Positive = on peut payer le demandé. */
  marginOfSafety: number;
  negotiationRange: { low: number; high: number };
  meetsAtAsking: boolean;
  feasible: boolean;
}

/** Plus haut prix où `predicate` reste vrai (les rendements décroissent avec le prix). */
function solveMax(inputs: DealInputs, predicate: (p: number) => boolean): number {
  const lo0 = 1000;
  const hi0 = Math.max(inputs.price * 3, 100_000_000);
  if (!predicate(lo0)) return 0;
  if (predicate(hi0)) return hi0;
  let lo = lo0;
  let hi = hi0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (predicate(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function maxPurchasePrice(inputs: DealInputs, obj: InvestmentObjectives): MaxPriceResult {
  const askingPrice = inputs.price;

  const financeable = (p: number): boolean => {
    const r = underwrite({ ...inputs, price: p });
    return r.noi > 0 && r.dscr >= obj.minDSCR;
  };
  const hitsTarget = (p: number): boolean => {
    const r = underwrite({ ...inputs, price: p });
    return r.noi > 0 && r.dscr >= obj.minDSCR && r.irr !== null && r.irr * 100 >= obj.targetIRRPct;
  };

  const recommendedPrice = solveMax(inputs, hitsTarget); // TRI + RCD
  const maxPrice = solveMax(inputs, financeable); // RCD seul
  const feasible = recommendedPrice > 1000;

  const discountNeeded = Math.max(0, askingPrice - recommendedPrice);
  const discountPct = askingPrice > 0 ? discountNeeded / askingPrice : 0;
  const marginOfSafety = askingPrice > 0 ? (recommendedPrice - askingPrice) / askingPrice : 0;

  return {
    askingPrice,
    recommendedPrice,
    maxPrice,
    discountNeeded,
    discountPct,
    marginOfSafety,
    negotiationRange: { low: feasible ? recommendedPrice * 0.95 : 0, high: recommendedPrice },
    meetsAtAsking: recommendedPrice >= askingPrice,
    feasible,
  };
}
