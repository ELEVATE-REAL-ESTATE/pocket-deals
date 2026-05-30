import { describe, it, expect } from "vitest";
import {
  underwrite,
  mortgagePayment,
  loanFromPayment,
  irr,
  schlReservePerDoor,
  schlConciergePerDoor,
  type DealInputs,
} from "../src/index.js";

/** Tolérance relative — les valeurs « golden » ont été calculées indépendamment
 *  (hors moteur) et arrondies ; on compare en relatif avec un plancher absolu. */
const approx = (actual: number, expected: number, rel = 1e-5): void =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * rel + 0.01);

/** Deal de référence = valeurs par défaut de l'analyseur (immeuble 12 portes, 2,4 M$). */
function defaultDeal(overrides: Partial<DealInputs> = {}): DealInputs {
  return {
    price: 2_400_000,
    units: 12,
    sqft: 11_000,
    closingPct: 2.5,
    capex: 0,
    grossRevenue: 312_000, // 288k loyers + 24k autres
    vacancyPct: 4,
    expenses: {
      taxes: 34_000,
      insurance: 11_000,
      energy: 22_000,
      water: 9_000,
      repairs: 18_000,
      caretaking: 9_000,
      mgmtPct: 5,
      reservePerDoor: 300,
      misc: 6_000,
    },
    program: { maxLTV: 0.85, minDCR: 1.2, maxAmort: 40, premium: 0.04 }, // SCHL MLI Standard
    rate: 5.25,
    amort: 40,
    premiumPct: 4.0,
    capMktPct: 5.0,
    hold: 5,
    rentGrowthPct: 3,
    expenseGrowthPct: 2.5,
    exitCapPct: 0, // 0 → utilise capMktPct
    sellingPct: 4,
    ...overrides,
  };
}

describe("primitives financières", () => {
  it("versement hypothécaire amorti", () => {
    approx(mortgagePayment(1_000_000, 0.06, 25), 6_443.014015);
  });
  it("versement à taux 0 = capital / nb de mois", () => {
    approx(mortgagePayment(1_000_000, 0, 25), 3_333.333333);
  });
  it("loanFromPayment est l'inverse de mortgagePayment", () => {
    const pmt = mortgagePayment(1_000_000, 0.06, 25);
    approx(loanFromPayment(pmt, 0.06, 25), 1_000_000, 1e-6);
  });
});

describe("barèmes SCHL", () => {
  it("conciergerie par palier d'unités", () => {
    expect(schlConciergePerDoor(12)).toBe(365);
    expect(schlConciergePerDoor(8)).toBe(330);
  });
  it("réserve : structure + composantes présentes", () => {
    expect(schlReservePerDoor({ units: 12, construction: "beton" })).toBe(300);
    expect(
      schlReservePerDoor({ units: 12, construction: "bois", hasAppliances: true, hasHeatPump: true }),
    ).toBe(450 + 110 + 250);
  });
});

describe("underwrite — golden (deal de référence)", () => {
  const r = underwrite(defaultDeal());

  it("revenus & dépenses", () => {
    approx(r.egi, 299_520);
    approx(r.opex, 127_576);
    approx(r.noi, 171_944);
    approx(r.expenseRatio, 0.408897);
  });

  it("évaluation", () => {
    approx(r.capRate, 0.071643);
    approx(r.impliedValue, 3_438_880);
    approx(r.pricePerDoor, 200_000);
    approx(r.pricePerSqft, 218.1818);
  });

  it("capacité d'emprunt (plafonnée par la valeur)", () => {
    approx(r.loanByLTV, 2_040_000);
    approx(r.loanByDCR, 2_393_518.85);
    approx(r.loanTaken, 2_040_000);
    expect(r.bindingConstraint).toBe("value");
    approx(r.premium, 81_600);
    approx(r.financedLoan, 2_121_600);
    approx(r.annualDebtService, 127_008.4);
  });

  it("rendement", () => {
    approx(r.equityInvested, 420_000);
    approx(r.downPaymentPct, 0.15);
    approx(r.dscr, 1.3538);
    approx(r.cashFlowYr1, 44_935.6);
    approx(r.cashOnCash, 0.10699);
  });

  it("détention & sortie", () => {
    expect(r.proforma).toHaveLength(5);
    approx(r.netSaleProceeds, 1_862_909.54);
    approx(r.totalDistributions, 2_147_478.55);
    approx(r.equityMultiple, 5.113044);
    expect(r.irr).not.toBeNull();
    approx(r.irr as number, 0.425159);
  });
});

describe("underwrite — variantes", () => {
  it("exitCapPct=0 équivaut à exitCapPct=capMktPct", () => {
    const a = underwrite(defaultDeal({ exitCapPct: 0 }));
    const b = underwrite(defaultDeal({ exitCapPct: 5.0 }));
    approx(a.netSaleProceeds, b.netSaleProceeds, 1e-9);
    approx(a.equityMultiple, b.equityMultiple, 1e-9);
  });

  it("un cap de sortie réaliste (6,5 %) réduit le multiple d'équité", () => {
    const r = underwrite(defaultDeal({ exitCapPct: 6.5 }));
    approx(r.netSaleProceeds, 963_971.88);
    approx(r.equityMultiple, 2.972716);
    expect(r.equityMultiple).toBeLessThan(5.113044);
  });
});

// Programmes de financement (valeurs de @elevate/config)
const CONV = { maxLTV: 0.75, minDCR: 1.25, maxAmort: 30, premium: 0 };
const MLI_STD = { maxLTV: 0.85, minDCR: 1.2, maxAmort: 40, premium: 0.04 };
const MLI_SEL = { maxLTV: 0.95, minDCR: 1.1, maxAmort: 50, premium: 0.045 };

// ---------------------------------------------------------------------------
// 1. Dimensionnement du prêt — le prêt retenu = min(prêt-valeur, prêt-couverture)
// ---------------------------------------------------------------------------
describe("dimensionnement du prêt — valeur vs couverture", () => {
  it("plafonné par la VALEUR quand la couverture est abondante (RPV mord en premier)", () => {
    const r = underwrite(defaultDeal({ program: MLI_STD, rate: 5.25 }));
    expect(r.bindingConstraint).toBe("value");
    expect(r.loanByLTV).toBeLessThan(r.loanByDCR);
    approx(r.loanTaken, r.loanByLTV);
    approx(r.loanTaken, 2_400_000 * 0.85); // = prix × RPV max
  });

  it("plafonné par la COUVERTURE quand le RCD mord en premier (taux élevé)", () => {
    const rate = 9;
    const r = underwrite(defaultDeal({ program: MLI_STD, rate }));
    expect(r.bindingConstraint).toBe("coverage");
    expect(r.loanByDCR).toBeLessThan(r.loanByLTV);
    approx(r.loanTaken, r.loanByDCR);
    // Invariant : le prêt-couverture est dimensionné pour RCD = minDCR sur le prêt de base
    const baseDebtService = mortgagePayment(r.loanByDCR, rate / 100, MLI_STD.maxAmort) * 12;
    approx(r.noi / baseDebtService, MLI_STD.minDCR);
  });

  it("la prime SCHL est capitalisée par-dessus le prêt de base", () => {
    const r = underwrite(defaultDeal({ program: MLI_STD }));
    approx(r.premium, r.loanTaken * MLI_STD.premium);
    approx(r.financedLoan, r.loanTaken + r.premium);
    // équité = prix − prêt de base (+ frais + capex) : la prime est financée, pas payée comptant
    approx(r.equityInvested, 2_400_000 - r.loanTaken + 2_400_000 * 0.025 + 0);
  });
});

// ---------------------------------------------------------------------------
// 2. Programmes — Conventionnel vs MLI Standard vs MLI Select
// ---------------------------------------------------------------------------
describe("programmes — Conventionnel vs MLI Standard vs MLI Select", () => {
  // Sur ce deal à fort NOI, les trois sont plafonnés par la valeur → prêt = prix × RPV
  const conv = underwrite(defaultDeal({ program: CONV }));
  const std = underwrite(defaultDeal({ program: MLI_STD }));
  const sel = underwrite(defaultDeal({ program: MLI_SEL }));

  it("RPV croissant → prêt croissant (Conv 75 % < Standard 85 % < Select 95 %)", () => {
    expect(conv.bindingConstraint).toBe("value");
    expect(std.bindingConstraint).toBe("value");
    expect(sel.bindingConstraint).toBe("value");
    approx(conv.loanTaken, 2_400_000 * 0.75);
    approx(std.loanTaken, 2_400_000 * 0.85);
    approx(sel.loanTaken, 2_400_000 * 0.95);
    expect(conv.loanTaken).toBeLessThan(std.loanTaken);
    expect(std.loanTaken).toBeLessThan(sel.loanTaken);
  });

  it("prêt plus gros → équité requise plus faible", () => {
    expect(sel.equityInvested).toBeLessThan(std.equityInvested);
    expect(std.equityInvested).toBeLessThan(conv.equityInvested);
  });

  it("le conventionnel n'a pas de prime (financé = prêt de base)", () => {
    expect(conv.premium).toBe(0);
    approx(conv.financedLoan, conv.loanTaken);
  });

  it("le taux de prime appliqué vient de premiumPct (program.premium = simple gâche)", () => {
    // program.premium > 0 active l'assurance ; le TAUX réel vient du champ éditable
    // premiumPct. L'UI synchronise les deux à la sélection du programme.
    const r = underwrite(defaultDeal({ program: MLI_SEL, premiumPct: 4.5 }));
    approx(r.premium, r.loanTaken * 0.045);
  });

  it("l'amortissement est plafonné par program.maxAmort", () => {
    // Demander 60 ans sur MLI Select (max 50) = identique à 50 ans
    const at60 = underwrite(defaultDeal({ program: MLI_SEL, amort: 60 }));
    const at50 = underwrite(defaultDeal({ program: MLI_SEL, amort: 50 }));
    approx(at60.annualDebtService, at50.annualDebtService, 1e-9);
    approx(at60.loanByDCR, at50.loanByDCR, 1e-9);
  });
});

// ---------------------------------------------------------------------------
// 3. NOI — invariants : le financement n'affecte JAMAIS le NOI (non-levier)
// ---------------------------------------------------------------------------
describe("NOI — invariants (non-levier)", () => {
  it("NOI et cap rate indépendants du taux et du programme", () => {
    const a = underwrite(defaultDeal({ rate: 5.25, program: MLI_STD }));
    const b = underwrite(defaultDeal({ rate: 12, program: MLI_SEL }));
    approx(a.noi, b.noi, 1e-9);
    approx(a.egi, b.egi, 1e-9);
    approx(a.opex, b.opex, 1e-9);
    approx(a.capRate, b.capRate, 1e-9);
    approx(a.impliedValue, b.impliedValue, 1e-9);
  });

  it("le capex initial n'affecte pas le NOI (mais augmente l'équité)", () => {
    const base = underwrite(defaultDeal({ capex: 0 }));
    const withCapex = underwrite(defaultDeal({ capex: 500_000 }));
    approx(withCapex.noi, base.noi, 1e-9);
    approx(withCapex.equityInvested, base.equityInvested + 500_000, 1e-9);
  });

  it("vacance = 0 → RBE effectif = revenus bruts", () => {
    const r = underwrite(defaultDeal({ vacancyPct: 0 }));
    approx(r.egi, 312_000);
  });

  it("la gestion est un % du RBE effectif (pas un montant fixe)", () => {
    const m0 = underwrite(defaultDeal({ expenses: { ...defaultDeal().expenses, mgmtPct: 0 } }));
    const m10 = underwrite(defaultDeal({ expenses: { ...defaultDeal().expenses, mgmtPct: 10 } }));
    approx(m10.opex - m0.opex, m0.egi * 0.1); // écart d'opex = egi × 10 %
  });
});

// ---------------------------------------------------------------------------
// 4. DSCR — cas limites
// ---------------------------------------------------------------------------
describe("DSCR — cas limites", () => {
  it("service de dette nul (achat comptant) → DSCR = ∞", () => {
    const allCash = { maxLTV: 0, minDCR: 1.2, maxAmort: 40, premium: 0 };
    const r = underwrite(defaultDeal({ program: allCash }));
    expect(r.loanTaken).toBe(0);
    expect(r.annualDebtService).toBe(0);
    expect(r.dscr).toBe(Infinity);
    approx(r.cashFlowYr1, r.noi); // flux = NOI (aucune dette)
    approx(r.equityInvested, 2_400_000 + 2_400_000 * 0.025); // tout comptant : prix + frais
  });

  it("taux d'intérêt plus élevé → DSCR plus faible", () => {
    const lo = underwrite(defaultDeal({ rate: 5.25 }));
    const hi = underwrite(defaultDeal({ rate: 9 }));
    expect(hi.dscr).toBeLessThan(lo.dscr);
  });

  it("financement agressif + taux élevé → flux négatif et DSCR < 1", () => {
    const aggressive = { maxLTV: 0.95, minDCR: 0.5, maxAmort: 25, premium: 0 };
    const r = underwrite(defaultDeal({ program: aggressive, rate: 12 }));
    expect(r.bindingConstraint).toBe("value");
    expect(r.cashFlowYr1).toBeLessThan(0);
    expect(r.cashOnCash).toBeLessThan(0);
    expect(r.dscr).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// 5. IRR — cas limites
// ---------------------------------------------------------------------------
describe("IRR — cas limites", () => {
  it("null quand pas de changement de signe", () => {
    expect(irr([-100, -50, -50])).toBeNull(); // que des sorties
    expect(irr([100, 50, 50])).toBeNull(); // que des entrées
  });

  it("propriété définitoire : NPV au taux IRR ≈ 0", () => {
    const cf = [-1000, 300, 400, 500];
    const rate = irr(cf);
    expect(rate).not.toBeNull();
    const npv = cf.reduce((acc, c, t) => acc + c / Math.pow(1 + (rate as number), t), 0);
    expect(Math.abs(npv)).toBeLessThan(1e-3);
  });

  it("monotonie : cap de sortie plus bas (revente plus chère) → IRR plus élevé", () => {
    const low = underwrite(defaultDeal({ exitCapPct: 5.0 }));
    const high = underwrite(defaultDeal({ exitCapPct: 6.5 }));
    expect(low.irr as number).toBeGreaterThan(high.irr as number);
  });
});

// ---------------------------------------------------------------------------
// 6. Gardes — division par zéro / valeurs dégénérées
// ---------------------------------------------------------------------------
describe("gardes (price=0, NOI≤0, équité=0)", () => {
  it("price = 0 ne lève pas et neutralise les ratios au prix", () => {
    const r = underwrite(defaultDeal({ price: 0, capex: 0 }));
    expect(r.capRate).toBe(0);
    expect(r.loanByLTV).toBe(0);
    expect(r.downPaymentPct).toBe(0);
    expect(r.pricePerDoor).toBe(0);
    expect(Number.isFinite(r.cashOnCash)).toBe(true); // équité 0 → garde, pas NaN/∞
  });

  it("NOI ≤ 0 → aucun prêt-couverture, prêt retenu = 0 (plafonné par couverture)", () => {
    const r = underwrite(defaultDeal({ expenses: { ...defaultDeal().expenses, misc: 400_000 } }));
    expect(r.noi).toBeLessThan(0);
    expect(r.capRate).toBeLessThan(0);
    expect(r.loanByDCR).toBe(0);
    expect(r.loanTaken).toBe(0);
    expect(r.bindingConstraint).toBe("coverage");
  });

  it("équité = 0 (financement 100 %) → cash-on-cash neutralisé à 0", () => {
    const fullLeverage = { maxLTV: 1.0, minDCR: 0.5, maxAmort: 40, premium: 0 };
    const r = underwrite(defaultDeal({ program: fullLeverage, closingPct: 0, capex: 0 }));
    approx(r.loanTaken, 2_400_000);
    expect(r.equityInvested).toBe(0);
    expect(r.cashOnCash).toBe(0); // garde equityInvested > 0
  });
});
