/**
 * Valorisation (value-add) : compare les loyers actuels aux loyers de marché
 * SCHL et calcule le scénario STABILISÉ (au marché) — NOI, valeur et upside.
 * Qualifie un deal à loyers sous le marché comme « occasion de valorisation »,
 * même si sa performance actuelle est faible. Réutilise `underwrite`.
 */
import { underwrite } from "./underwrite.js";
import type { DealInputs, MarketRentSet, UnderwritingResult } from "./types.js";

export interface ValueAddResult {
  /** Un mix d'unités exploitable est-il fourni ? */
  hasMix: boolean;
  units: number;
  /** Loyer total mensuel actuel (du mix). */
  currentRentMonthly: number;
  /** Loyer total mensuel aux loyers de marché SCHL. */
  marketRentMonthly: number;
  /** Écart mensuel (marché − actuel). */
  rentGapMonthly: number;
  /** Écart relatif : marché / actuel − 1. */
  rentGapPct: number;
  /** Underwriting aux loyers actuels (= underwrite(inputs)). */
  current: UnderwritingResult;
  /** Underwriting aux loyers de marché (stabilisé). */
  stabilized: UnderwritingResult;
  /** Hausse de valeur (valeur stabilisée − actuelle, au cap marché). */
  upsideValue: number;
  /** Hausse de NOI (stabilisé − actuel). */
  noiLift: number;
  /** Écart de loyer significatif (≥ 8 %) → potentiel de valorisation. */
  isOpportunity: boolean;
}

const TYPES = ["studio", "br1", "br2", "br3"] as const;

export function valueAdd(inputs: DealInputs, market: MarketRentSet): ValueAddResult {
  const current = underwrite(inputs);
  const mix = inputs.unitMix;

  let curMonthly = 0;
  let mktMonthly = 0;
  let units = 0;
  let hasMix = false;

  if (mix) {
    for (const t of TYPES) {
      const m = mix[t];
      if (!m || m.count <= 0) continue;
      hasMix = true;
      units += m.count;
      curMonthly += m.count * m.rent;
      const mr = market[t];
      // Si pas de loyer de marché pour ce type, on garde le loyer actuel (prudent).
      mktMonthly += m.count * (mr != null && mr > 0 ? mr : m.rent);
    }
  }

  if (!hasMix) {
    return {
      hasMix: false, units: 0,
      currentRentMonthly: 0, marketRentMonthly: 0, rentGapMonthly: 0, rentGapPct: 0,
      current, stabilized: current, upsideValue: 0, noiLift: 0, isOpportunity: false,
    };
  }

  // Revenu « autre » = brut total − loyers actuels du mix (stationnement, etc.)
  const otherIncome = Math.max(0, inputs.grossRevenue - curMonthly * 12);
  const stabilized = underwrite({ ...inputs, grossRevenue: mktMonthly * 12 + otherIncome });

  const rentGapMonthly = mktMonthly - curMonthly;
  const rentGapPct = curMonthly > 0 ? mktMonthly / curMonthly - 1 : 0;

  return {
    hasMix: true,
    units,
    currentRentMonthly: curMonthly,
    marketRentMonthly: mktMonthly,
    rentGapMonthly,
    rentGapPct,
    current,
    stabilized,
    upsideValue: stabilized.impliedValue - current.impliedValue,
    noiLift: stabilized.noi - current.noi,
    isOpportunity: rentGapPct >= 0.08,
  };
}
