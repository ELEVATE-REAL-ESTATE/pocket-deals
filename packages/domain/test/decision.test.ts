import { describe, it, expect } from "vitest";
import {
  underwrite,
  evaluate,
  recommend,
  maxPurchasePrice,
  exitCapTable,
  rateTable,
  ratesFromDeltas,
  detectRedFlags,
  DEFAULT_EXIT_CAPS,
  type DealInputs,
  type InvestmentObjectives,
  type PremiumSchedule,
} from "../src/index.js";

const SCHEDULE: PremiumSchedule = {
  baseByLTV: [
    { maxLTV: 0.65, premium: 0.0245 },
    { maxLTV: 0.75, premium: 0.025 },
    { maxLTV: 0.8, premium: 0.0475 },
    { maxLTV: 0.85, premium: 0.055 },
    { maxLTV: 0.9, premium: 0.0585 },
    { maxLTV: 0.95, premium: 0.0615 },
  ],
  amortSurchargePer5yr: 0.0025,
  surchargeBaseYears: 25,
  pointsDiscounts: { "0": 0, "50": 0.1, "70": 0.2, "100": 0.3 },
};
const MLI_STD = { maxLTV: 0.85, minDCR: 1.2, maxAmort: 40, insured: true, pointsEligible: false };
const MLI_SEL = { maxLTV: 0.95, minDCR: 1.1, maxAmort: 50, insured: true, pointsEligible: true };

function deal(overrides: Partial<DealInputs> = {}): DealInputs {
  return {
    price: 2_400_000, units: 12, sqft: 11_000, closingPct: 2.5, capex: 0,
    grossRevenue: 312_000, vacancyPct: 4,
    expenses: { taxes: 34_000, insurance: 11_000, energy: 22_000, water: 9_000,
      repairs: 18_000, caretaking: 9_000, mgmtPct: 5, reservePerDoor: 300, misc: 6_000 },
    program: { ...MLI_STD }, rate: 5.25, amort: 40,
    premiumSchedule: SCHEDULE, mliPoints: 100,
    capMktPct: 5.0, hold: 5, rentGrowthPct: 3, expenseGrowthPct: 2.5, exitCapPct: 0, sellingPct: 4,
    ...overrides,
  };
}

/** Objectifs que le deal de référence atteint (verdict BUY). */
const LENIENT: InvestmentObjectives = {
  targetIRRPct: 12, minDSCR: 1.2, minCashOnCashPct: 6, minEquityMultiple: 1.8, targetHoldYears: 5,
};

// =====================================================================
// Feature 5 — pro forma enrichi
// =====================================================================
describe("pro forma — données annuelles investisseur (F5)", () => {
  const r = underwrite(deal());

  it("chaque année expose valeur, équité, cumul et TRI de période", () => {
    for (const row of r.proforma) {
      expect(row.propertyValue).toBeGreaterThan(0);
      // équité = valeur − solde du prêt
      expect(row.equity).toBeCloseTo(row.propertyValue - row.loanBalance, 2);
      expect(row.periodIRR).not.toBeNull();
    }
  });

  it("le cumul des flux est croissant", () => {
    for (let i = 1; i < r.proforma.length; i++) {
      expect(r.proforma[i]!.cumulativeCashFlow).toBeGreaterThan(r.proforma[i - 1]!.cumulativeCashFlow);
    }
  });

  it("la revente nette = valeur finale × (1 − frais) − solde", () => {
    const last = r.proforma[r.proforma.length - 1]!;
    expect(r.netSaleProceeds).toBeCloseTo(last.propertyValue * (1 - 0.04) - last.loanBalance, 2);
  });

  it("sources de rendement : capitalisation + prise de valeur cohérentes", () => {
    // somme du capital remboursé = solde initial − solde final
    const totalPaid = r.proforma.reduce((a, p) => a + p.principalPaid, 0);
    const lastBal = r.proforma[r.proforma.length - 1]!.loanBalance;
    expect(totalPaid).toBeCloseTo(r.financedLoan - lastBal, 2);
    // prise de valeur année y = valeur y − valeur y−1
    for (let i = 1; i < r.proforma.length; i++) {
      expect(r.proforma[i]!.appreciation).toBeCloseTo(
        r.proforma[i]!.propertyValue - r.proforma[i - 1]!.propertyValue,
        2,
      );
    }
    // deal en croissance → capitalisation et prise de valeur positives
    expect(r.proforma.every((p) => p.principalPaid > 0)).toBe(true);
    expect(r.proforma.every((p) => p.appreciation > 0)).toBe(true);
  });
});

// =====================================================================
// Feature 1 — objectifs & verdict
// =====================================================================
describe("evaluate — verdict BUY/RENEGOTIATE/PASS (F1)", () => {
  it("BUY quand tous les seuils sont atteints", () => {
    const rec = evaluate(underwrite(deal()), LENIENT);
    expect(rec.verdict).toBe("BUY");
    expect(rec.metCount).toBe(4);
    expect(rec.reasons.every((x) => x.ok)).toBe(true);
  });

  it("RENEGOTIATE quand un seuil de rendement manque (RCD min relevé)", () => {
    const rec = evaluate(underwrite(deal()), { ...LENIENT, minDSCR: 1.5 });
    expect(rec.verdict).toBe("RENEGOTIATE");
    expect(rec.reasons.find((x) => x.label === "RCD")!.ok).toBe(false);
  });

  it("RENEGOTIATE quand le TRI est sous la cible", () => {
    const rec = evaluate(underwrite(deal()), { ...LENIENT, targetIRRPct: 60 });
    expect(rec.verdict).toBe("RENEGOTIATE");
    expect(rec.reasons.find((x) => x.label === "TRI")!.ok).toBe(false);
  });

  it("PASS quand le NOI est ≤ 0 (aucun prix ne sauve le deal)", () => {
    const rec = evaluate(underwrite(deal({ expenses: { ...deal().expenses, misc: 400_000 } })), LENIENT);
    expect(rec.verdict).toBe("PASS");
  });
});

// =====================================================================
// Feature 2 — prix d'achat maximal
// =====================================================================
describe("maxPurchasePrice — underwriting inversé (F2)", () => {
  it("au prix demandé qui passe : marge positive, aucun rabais requis", () => {
    const m = maxPurchasePrice(deal(), LENIENT);
    expect(m.feasible).toBe(true);
    expect(m.meetsAtAsking).toBe(true);
    expect(m.maxPrice).toBeGreaterThan(m.askingPrice);
    expect(m.marginOfSafety).toBeGreaterThan(0);
    expect(m.discountNeeded).toBe(0);
  });

  it("objectifs plus stricts → prix max sous le demandé, rabais requis", () => {
    const m = maxPurchasePrice(deal(), { ...LENIENT, minDSCR: 1.45 });
    expect(m.maxPrice).toBeLessThan(m.askingPrice);
    expect(m.discountNeeded).toBeGreaterThan(0);
    expect(m.marginOfSafety).toBeLessThan(0);
    expect(m.meetsAtAsking).toBe(false);
  });

  it("le prix max est bien la frontière (passe au max, échoue au-dessus)", () => {
    const m = maxPurchasePrice(deal(), { ...LENIENT, minDSCR: 1.45 });
    expect(evaluate(underwrite(deal({ price: m.maxPrice })), { ...LENIENT, minDSCR: 1.45 }).verdict).toBe("BUY");
    expect(evaluate(underwrite(deal({ price: m.maxPrice * 1.05 })), { ...LENIENT, minDSCR: 1.45 }).verdict).not.toBe("BUY");
  });

  it("des objectifs plus stricts donnent un prix max plus bas (monotonie)", () => {
    const a = maxPurchasePrice(deal(), LENIENT).maxPrice;
    const b = maxPurchasePrice(deal(), { ...LENIENT, minDSCR: 1.45 }).maxPrice;
    expect(b).toBeLessThan(a);
  });

  it("NOI ≤ 0 → non faisable, prix max 0", () => {
    const m = maxPurchasePrice(deal({ expenses: { ...deal().expenses, misc: 400_000 } }), LENIENT);
    expect(m.feasible).toBe(false);
    expect(m.maxPrice).toBe(0);
  });
});

// =====================================================================
// Features 3 & 4 — sensibilité
// =====================================================================
describe("sensibilité cap de sortie (F3)", () => {
  const rows = exitCapTable(deal(), DEFAULT_EXIT_CAPS);
  it("un cap dans l'ordre croissant → valeur, TRI et multiple décroissants", () => {
    expect(rows).toHaveLength(DEFAULT_EXIT_CAPS.length);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.propertyValue).toBeLessThan(rows[i - 1]!.propertyValue);
      expect(rows[i]!.equityMultiple).toBeLessThan(rows[i - 1]!.equityMultiple);
      expect(rows[i]!.irr as number).toBeLessThan(rows[i - 1]!.irr as number);
    }
  });
});

describe("sensibilité taux d'intérêt (F4)", () => {
  const rows = rateTable(deal(), ratesFromDeltas(5.25));
  // Direction d'ensemble : le moteur RE-DIMENSIONNE le prêt à chaque taux ; une
  // fois que la couverture (RCD) plafonne le prêt, le service de dette cesse de
  // croître. On vérifie donc le sens global (premier vs dernier), pas chaque pas.
  it("taux plus élevé → service de dette ↑, RCD ↓, flux ↓, TRI ↓ (global)", () => {
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    expect(last.annualDebtService).toBeGreaterThan(first.annualDebtService);
    expect(last.dscr).toBeLessThan(first.dscr);
    expect(last.cashFlowYr1).toBeLessThan(first.cashFlowYr1);
    expect(last.irr as number).toBeLessThan(first.irr as number);
  });
});

// =====================================================================
// Feature 9 — drapeaux rouges
// =====================================================================
describe("detectRedFlags (F9)", () => {
  const has = (flags: { id: string }[], id: string) => flags.some((f) => f.id === id);

  it("compression de cap : sortie 5 % < entrée 7,2 % (deal par défaut)", () => {
    const flags = detectRedFlags(deal(), underwrite(deal()));
    expect(has(flags, "cap-compression")).toBe(true);
    const f = flags.find((x) => x.id === "cap-compression")!;
    expect(f.why.length).toBeGreaterThan(0);
    expect(f.mitigation.length).toBeGreaterThan(0);
  });

  it("flux négatif + levier élevé sur financement agressif", () => {
    const d = deal({ program: { maxLTV: 0.95, minDCR: 0.5, maxAmort: 25, insured: false, pointsEligible: false }, rate: 12 });
    const flags = detectRedFlags(d, underwrite(d));
    expect(has(flags, "negative-cf")).toBe(true);
  });

  it("ratio de dépenses trop bas", () => {
    const d = deal({ expenses: { ...deal().expenses, energy: 0, repairs: 0, caretaking: 0, misc: 0, mgmtPct: 0, reservePerDoor: 0, water: 0 } });
    const flags = detectRedFlags(d, underwrite(d));
    expect(has(flags, "opex-low")).toBe(true);
  });

  it("inoccupation faible et croissance des loyers agressive", () => {
    const d = deal({ vacancyPct: 1, rentGrowthPct: 5 });
    const flags = detectRedFlags(d, underwrite(d));
    expect(has(flags, "low-vacancy")).toBe(true);
    expect(has(flags, "aggressive-rent-growth")).toBe(true);
  });

  it("marge mince signalée quand fournie", () => {
    const flags = detectRedFlags(deal(), underwrite(deal()), { marginOfSafety: -0.05 });
    const f = flags.find((x) => x.id === "thin-margin")!;
    expect(f.severity).toBe("danger");
  });
});

// =====================================================================
// recommend — composition + affinage du verdict
// =====================================================================
describe("recommend — décision complète (F1+F2+F9)", () => {
  it("BUY : ajoute la marge et liste les drapeaux", () => {
    const d = recommend(deal(), LENIENT);
    expect(d.recommendation.verdict).toBe("BUY");
    expect(d.maxPrice.marginOfSafety).toBeGreaterThan(0);
    expect(d.recommendation.reasons.some((x) => x.label === "Marge")).toBe(true);
    expect(d.redFlags.some((f) => f.id === "cap-compression")).toBe(true);
  });

  it("RENEGOTIATE : rabais modéré → reste négociable", () => {
    const d = recommend(deal(), { ...LENIENT, minDSCR: 1.4 });
    expect(d.recommendation.verdict).toBe("RENEGOTIATE");
    expect(d.recommendation.reasons.some((x) => x.label === "Prix")).toBe(true);
  });

  it("PASS : rabais requis irréaliste (cible de TRI extrême)", () => {
    const d = recommend(deal(), { ...LENIENT, targetIRRPct: 120 });
    expect(d.recommendation.verdict).toBe("PASS");
  });

  it("PASS : NOI ≤ 0", () => {
    const d = recommend(deal({ expenses: { ...deal().expenses, misc: 400_000 } }), LENIENT);
    expect(d.recommendation.verdict).toBe("PASS");
  });

  // Régression : un prix BAS doit ENCOURAGER l'achat (TRI trop élevé ≠ échec).
  it("un prix très bas → BUY (TRI surpuissant traité comme +∞, pas comme échec)", () => {
    for (const price of [5, 50, 500, 500_000]) {
      const d = recommend(deal({ price }), LENIENT);
      expect(d.recommendation.verdict).toBe("BUY");
    }
  });

  it("monotonie du verdict : plus le prix monte, moins c'est un BUY", () => {
    const cheap = recommend(deal({ price: 1_000_000 }), LENIENT).recommendation.verdict;
    const dear = recommend(deal({ price: 6_000_000 }), LENIENT).recommendation.verdict;
    const rank = { BUY: 2, RENEGOTIATE: 1, PASS: 0 };
    expect(rank[cheap]).toBeGreaterThanOrEqual(rank[dear]);
    expect(cheap).toBe("BUY"); // 1 M$ pour ce NOI = excellent
  });
});
