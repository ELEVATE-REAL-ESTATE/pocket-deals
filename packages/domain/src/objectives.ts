/**
 * Objectifs d'investissement et moteur de décision (BUY / RENEGOTIATE / PASS).
 * Pur : compare un résultat d'underwriting à des objectifs et explique le POURQUOI.
 */
import type { UnderwritingResult } from "./types.js";

export interface InvestmentObjectives {
  /** TRI cible, en % (ex. 12). */
  targetIRRPct: number;
  /** RCD minimal (ex. 1.20). */
  minDSCR: number;
  /** Rendement comptant minimal, en % (ex. 6). */
  minCashOnCashPct: number;
  /** Multiple d'équité minimal (ex. 1.8). */
  minEquityMultiple: number;
  /** Période de détention cible (années). */
  targetHoldYears: number;
}

export type Verdict = "BUY" | "RENEGOTIATE" | "PASS";

/** Un critère évalué (pour expliquer la recommandation). */
export interface Reason {
  ok: boolean;
  label: string;
  detail: string;
}

export interface Recommendation {
  verdict: Verdict;
  reasons: Reason[];
  /** Nombre de critères de rendement atteints (0–4). */
  metCount: number;
}

const f1 = (n: number): string => n.toLocaleString("fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (n: number): string => n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number): string =>
  (n < 0 ? "-" : "+") + "$" + Math.abs(Math.round(n)).toLocaleString("fr-CA");

/**
 * Évalue un résultat d'underwriting contre les objectifs.
 * BUY : finançable, NOI positif et tous les seuils de rendement atteints.
 * PASS : NOI ≤ 0 (aucun prix ne sauve le deal).
 * RENEGOTIATE : finançable / revenu positif mais des seuils manquent (le prix est le levier).
 */
export function evaluate(result: UnderwritingResult, obj: InvestmentObjectives): Recommendation {
  const irrPct = result.irr === null ? null : result.irr * 100;
  const cocPct = result.cashOnCash * 100;

  const irrOk = irrPct !== null && irrPct >= obj.targetIRRPct;
  const dscrOk = result.dscr >= obj.minDSCR;
  const cocOk = cocPct >= obj.minCashOnCashPct;
  const emOk = result.equityMultiple >= obj.minEquityMultiple;
  const cfOk = result.cashFlowYr1 >= 0;

  const reasons: Reason[] = [
    {
      ok: irrOk,
      label: "TRI",
      detail:
        irrPct === null
          ? "non calculable (le capital n'est pas récupéré)"
          : !isFinite(irrPct)
            ? `≥ 1000 % (très élevé) — dépasse la cible ${f1(obj.targetIRRPct)} %`
            : `${f1(irrPct)} % vs cible ${f1(obj.targetIRRPct)} % (${irrPct >= obj.targetIRRPct ? "+" : ""}${f1(irrPct - obj.targetIRRPct)} pts)`,
    },
    {
      ok: dscrOk,
      label: "RCD",
      detail: `${isFinite(result.dscr) ? f2(result.dscr) : "∞"} vs min ${f2(obj.minDSCR)}`,
    },
    {
      ok: cocOk,
      label: "Rendement comptant",
      detail: `${f1(cocPct)} % vs min ${f1(obj.minCashOnCashPct)} %`,
    },
    {
      ok: emOk,
      label: "Multiple d'équité",
      detail: `${f2(result.equityMultiple)}× vs min ${f2(obj.minEquityMultiple)}×`,
    },
    {
      ok: cfOk,
      label: "Flux année 1",
      detail: `${money(result.cashFlowYr1)} (${cfOk ? "positif" : "négatif"})`,
    },
  ];

  const metCount = [irrOk, cocOk, emOk, cfOk].filter(Boolean).length;

  // BUY = TRI cible + finançable (RCD) + flux positif. Le rendement comptant et
  // le multiple sont INDICATIFS (affichés dans les raisons, mais ne bloquent pas).
  let verdict: Verdict;
  if (result.noi <= 0) {
    verdict = "PASS";
  } else if (irrOk && dscrOk && cfOk) {
    verdict = "BUY";
  } else {
    verdict = "RENEGOTIATE";
  }

  return { verdict, reasons, metCount };
}
