/**
 * Tables de sensibilité — réexécutent `underwrite` sur des scénarios.
 * F3 : sensibilité au cap de sortie (valeur, équité, TRI, multiple).
 * F4 : sensibilité au taux d'intérêt (service de dette, RCD, flux, TRI).
 */
import { underwrite } from "./underwrite.js";
import type { DealInputs } from "./types.js";

export interface ExitCapRow {
  exitCapPct: number;
  /** Valeur de revente brute (NOI prospectif ÷ cap). */
  propertyValue: number;
  /** Produit net de revente à l'équité. */
  netToEquity: number;
  irr: number | null;
  equityMultiple: number;
}

/** F3 — sensibilité au cap de sortie. */
export function exitCapTable(inputs: DealInputs, capsPct: number[]): ExitCapRow[] {
  return capsPct.map((cap) => {
    const r = underwrite({ ...inputs, exitCapPct: cap });
    const last = r.proforma[r.proforma.length - 1];
    return {
      exitCapPct: cap,
      propertyValue: last ? last.propertyValue : 0,
      netToEquity: r.netSaleProceeds,
      irr: r.irr,
      equityMultiple: r.equityMultiple,
    };
  });
}

export interface RateRow {
  ratePct: number;
  annualDebtService: number;
  dscr: number;
  cashFlowYr1: number;
  irr: number | null;
}

/** F4 — sensibilité au taux d'intérêt. */
export function rateTable(inputs: DealInputs, ratesPct: number[]): RateRow[] {
  return ratesPct.map((rate) => {
    const r = underwrite({ ...inputs, rate });
    return {
      ratePct: rate,
      annualDebtService: r.annualDebtService,
      dscr: r.dscr,
      cashFlowYr1: r.cashFlowYr1,
      irr: r.irr,
    };
  });
}

/** Scénarios par défaut. */
export const DEFAULT_EXIT_CAPS = [4.0, 4.25, 4.5, 4.75, 5.0, 5.25, 5.5, 5.75, 6.0];
/** Décalages de taux (en points de %) appliqués au taux courant. */
export const DEFAULT_RATE_DELTAS = [0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0];

/** Construit la liste de taux à tester à partir du taux courant + décalages. */
export function ratesFromDeltas(currentRatePct: number, deltas: number[] = DEFAULT_RATE_DELTAS): number[] {
  return deltas.map((d) => currentRatePct + d);
}
