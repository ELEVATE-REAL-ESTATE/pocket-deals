/**
 * Underwriting inversé : prix d'achat maximal pour atteindre les objectifs.
 * Recherche par bissection sur le prix (les rendements décroissent quand le prix
 * monte → seuil unique). Réutilise `underwrite` et `evaluate` — aucune logique
 * financière dupliquée.
 */
import { underwrite } from "./underwrite.js";
import { evaluate, type InvestmentObjectives } from "./objectives.js";
import type { DealInputs } from "./types.js";

export interface MaxPriceResult {
  askingPrice: number;
  /** Prix le plus élevé atteignant TOUS les objectifs (verdict BUY). */
  maxPrice: number;
  /** Prix d'offre recommandé : sous le plafond pour garder une marge. */
  recommendedPrice: number;
  /** Rabais requis sur le prix demandé (0 si le deal passe au prix demandé). */
  discountNeeded: number;
  discountPct: number;
  /** Marge de sécurité = (maxPrice − demandé) / demandé. Positive = du jeu. */
  marginOfSafety: number;
  negotiationRange: { low: number; high: number };
  meetsAtAsking: boolean;
  /** Un prix > 0 atteint-il les objectifs ? (false si NOI ≤ 0, etc.) */
  feasible: boolean;
}

/** Le deal atteint-il tous les objectifs (verdict BUY) à ce prix ? */
function meetsObjectives(inputs: DealInputs, obj: InvestmentObjectives, price: number): boolean {
  return evaluate(underwrite({ ...inputs, price }), obj).verdict === "BUY";
}

export function maxPurchasePrice(inputs: DealInputs, obj: InvestmentObjectives): MaxPriceResult {
  const askingPrice = inputs.price;
  // Borne basse saine : à un prix dérisoire, les rendements sont si élevés que le
  // TRI n'est plus calculable (NPV positif au-delà de 1000 %). On ne sonde donc
  // pas sous ~10 % du prix demandé (un deal exigeant >90 % de rabais = non viable).
  const lo0 = Math.max(10_000, askingPrice * 0.1);
  const hi0 = Math.max(askingPrice * 3, askingPrice + 1, 100);

  let maxPrice: number;
  if (!meetsObjectives(inputs, obj, lo0)) {
    maxPrice = 0; // aucun prix ne fonctionne (ex. NOI ≤ 0)
  } else if (meetsObjectives(inputs, obj, hi0)) {
    maxPrice = hi0; // objectifs atteints même très haut
  } else {
    // BUY vrai pour price ≤ maxPrice → on cherche la frontière
    let lo = lo0;
    let hi = hi0;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (meetsObjectives(inputs, obj, mid)) lo = mid;
      else hi = mid;
    }
    maxPrice = lo;
  }

  const feasible = maxPrice > lo0;
  const recommendedPrice = feasible ? maxPrice * 0.97 : 0;
  const discountNeeded = Math.max(0, askingPrice - maxPrice);
  const discountPct = askingPrice > 0 ? discountNeeded / askingPrice : 0;
  const marginOfSafety = askingPrice > 0 ? (maxPrice - askingPrice) / askingPrice : 0;

  return {
    askingPrice,
    maxPrice,
    recommendedPrice,
    discountNeeded,
    discountPct,
    marginOfSafety,
    negotiationRange: { low: feasible ? maxPrice * 0.93 : 0, high: maxPrice },
    meetsAtAsking: maxPrice >= askingPrice,
    feasible,
  };
}
