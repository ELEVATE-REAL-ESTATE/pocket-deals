/**
 * Décision d'acquisition complète : underwrite + objectifs + prix max + drapeaux.
 * Affine le verdict de `evaluate` avec le prix maximal (un RENEGOTIATE qui exige
 * un rabais irréaliste devient PASS). C'est l'entrée utilisée par l'app/le mémo.
 */
import { underwrite } from "./underwrite.js";
import { evaluate, type InvestmentObjectives, type Recommendation, type Reason } from "./objectives.js";
import { maxPurchasePrice, type MaxPriceResult } from "./solve.js";
import { detectRedFlags, type RedFlag } from "./redflags.js";
import type { DealInputs, UnderwritingResult } from "./types.js";

export interface DealDecision {
  result: UnderwritingResult;
  recommendation: Recommendation;
  maxPrice: MaxPriceResult;
  redFlags: RedFlag[];
}

const money = (n: number): string => "$" + Math.round(n).toLocaleString("fr-CA");

export function recommend(inputs: DealInputs, obj: InvestmentObjectives): DealDecision {
  const result = underwrite(inputs);
  const base = evaluate(result, obj);
  const maxPrice = maxPurchasePrice(inputs, obj);
  const redFlags = detectRedFlags(inputs, result, {
    objectives: obj,
    marginOfSafety: maxPrice.marginOfSafety,
  });

  let verdict = base.verdict;
  const reasons: Reason[] = [...base.reasons];

  if (verdict === "RENEGOTIATE") {
    if (!maxPrice.feasible) {
      verdict = "PASS";
      reasons.push({ ok: false, label: "Prix", detail: "aucun prix n'atteint les objectifs" });
    } else if (maxPrice.discountPct > 0.15) {
      verdict = "PASS";
      reasons.push({
        ok: false,
        label: "Prix",
        detail: `rabais requis ${(maxPrice.discountPct * 100).toFixed(0)} % — peu réaliste (max ${money(maxPrice.maxPrice)})`,
      });
    } else {
      reasons.push({
        ok: false,
        label: "Prix",
        detail: `atteint les objectifs sous ${money(maxPrice.maxPrice)} (rabais ${(maxPrice.discountPct * 100).toFixed(0)} %)`,
      });
    }
  } else if (verdict === "BUY" && maxPrice.marginOfSafety > 0) {
    reasons.push({
      ok: true,
      label: "Marge",
      detail: `prix max ${money(maxPrice.maxPrice)} — marge ${(maxPrice.marginOfSafety * 100).toFixed(0)} % sous le plafond`,
    });
  }

  return { result, recommendation: { verdict, reasons, metCount: base.metCount }, maxPrice, redFlags };
}
