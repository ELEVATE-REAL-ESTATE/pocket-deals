import { describe, it, expect } from "vitest";
import {
  underwrite,
  mortgagePayment,
  loanFromPayment,
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
