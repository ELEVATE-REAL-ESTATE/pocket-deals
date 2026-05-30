/**
 * Moteur d'underwriting — fonction pure, sans aucune dépendance UI/DOM.
 * Porté à l'identique depuis la logique `calc()` de l'analyseur historique,
 * verrouillé par les tests « golden » (voir test/underwrite.test.ts).
 */
import { mortgagePayment, loanFromPayment, remainingBalance, irr } from "./finance.js";
import type {
  DealInputs,
  FinancingProgram,
  PremiumSchedule,
  ProformaRow,
  UnderwritingResult,
} from "./types.js";

/** Convertit un pourcentage saisi (5.25) en fraction (0.0525). */
const pc = (p: number): number => p / 100;

/**
 * Taux de prime SCHL appliqué (fraction), selon la tarification au risque :
 *   prime = (base selon le RPV du prêt + surcharge d'amortissement) × (1 − rabais pointage).
 * Une surcharge manuelle (`overridePct`, en %) le remplace si fournie. 0 si non assuré.
 */
export function premiumRate(
  loanToValue: number,
  amortYears: number,
  program: FinancingProgram,
  schedule: PremiumSchedule,
  mliPoints: number,
  overridePct?: number,
): number {
  if (overridePct && overridePct > 0) return overridePct / 100;
  if (!program.insured) return 0;
  const band =
    schedule.baseByLTV.find((b) => loanToValue <= b.maxLTV) ??
    schedule.baseByLTV[schedule.baseByLTV.length - 1];
  const base = band ? band.premium : 0;
  const steps = Math.max(0, Math.ceil((amortYears - schedule.surchargeBaseYears) / 5));
  const surcharge = steps * schedule.amortSurchargePer5yr;
  const discount = program.pointsEligible ? (schedule.pointsDiscounts[String(mliPoints)] ?? 0) : 0;
  return (base + surcharge) * (1 - discount);
}

export function underwrite(input: DealInputs): UnderwritingResult {
  const { price, units: rawUnits, sqft, capex, expenses: x, program } = input;
  const units = Math.max(1, rawUnits);

  const closing = pc(input.closingPct);
  const vacancy = pc(input.vacancyPct);
  const rate = pc(input.rate);
  const capMkt = pc(input.capMktPct);
  const rentG = pc(input.rentGrowthPct);
  const expG = pc(input.expenseGrowthPct);
  const selling = pc(input.sellingPct);
  const exitCap = input.exitCapPct > 0 ? pc(input.exitCapPct) : capMkt;
  const amort = Math.min(input.amort, program.maxAmort);
  const hold = Math.max(1, Math.round(input.hold));

  // --- Revenus & dépenses ---
  const egi = input.grossRevenue * (1 - vacancy); // revenu brut effectif
  const opex =
    x.taxes +
    x.insurance +
    x.energy +
    x.water +
    x.repairs +
    x.caretaking +
    egi * pc(x.mgmtPct) +
    units * x.reservePerDoor +
    x.misc;
  const noi = egi - opex;
  const expenseRatio = input.grossRevenue > 0 ? opex / input.grossRevenue : 0;

  // --- Évaluation ---
  const capRate = price > 0 ? noi / price : 0;
  const impliedValue = capMkt > 0 ? noi / capMkt : 0;
  const pricePerDoor = price / units;
  const pricePerSqft = sqft > 0 ? price / sqft : 0;

  // --- Capacité d'emprunt : le moindre du prêt selon la valeur et la couverture ---
  const loanByLTV = price * program.maxLTV;
  const maxAnnualDebt = noi / program.minDCR;
  const loanByDCR = Math.max(0, loanFromPayment(maxAnnualDebt / 12, rate, amort));
  const loanTaken = Math.max(0, Math.min(loanByLTV, loanByDCR));
  const bindingConstraint: "value" | "coverage" = loanByDCR < loanByLTV ? "coverage" : "value";

  // Prime SCHL : calculée selon le RPV du prêt, l'amortissement et le pointage MLI Select.
  const ltvOfLoan = price > 0 ? loanTaken / price : 0;
  const premRate = premiumRate(
    ltvOfLoan,
    amort,
    program,
    input.premiumSchedule,
    input.mliPoints,
    input.premiumOverridePct,
  );
  const premium = loanTaken * premRate;
  const financedLoan = loanTaken + premium; // prime capitalisée
  const annualDebtService = mortgagePayment(financedLoan, rate, amort) * 12;

  const equityInvested = price - loanTaken + price * closing + capex;
  const downPaymentPct = price > 0 ? (price - loanTaken) / price : 0;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : Infinity;
  const cashFlowYr1 = noi - annualDebtService;
  const cashOnCash = equityInvested > 0 ? cashFlowYr1 / equityInvested : 0;

  // --- Pro forma sur la période de détention + revente ---
  const proforma: ProformaRow[] = [];
  const flows: number[] = [-equityInvested];
  let netSaleProceeds = 0;

  for (let y = 1; y <= hold; y++) {
    const rev = egi * Math.pow(1 + rentG, y - 1);
    const exp = opex * Math.pow(1 + expG, y - 1);
    const yNoi = rev - exp;
    const yCf = yNoi - annualDebtService;
    const bal = remainingBalance(financedLoan, rate, amort, y * 12);

    let flow = yCf;
    if (y === hold) {
      const fwdNoi = egi * Math.pow(1 + rentG, y) - opex * Math.pow(1 + expG, y);
      const grossSale = exitCap > 0 ? fwdNoi / exitCap : 0;
      netSaleProceeds = grossSale * (1 - selling) - bal;
      flow += netSaleProceeds;
    }
    proforma.push({ year: y, noi: yNoi, debtService: annualDebtService, cashFlow: yCf, loanBalance: bal });
    flows.push(flow);
  }

  const totalCf = proforma.reduce((acc, r) => acc + r.cashFlow, 0);
  const totalDistributions = totalCf + netSaleProceeds;
  const equityMultiple = equityInvested > 0 ? totalDistributions / equityInvested : 0;

  return {
    egi,
    opex,
    noi,
    expenseRatio,
    capRate,
    capMkt,
    impliedValue,
    pricePerDoor,
    pricePerSqft,
    loanByLTV,
    loanByDCR,
    loanTaken,
    bindingConstraint,
    premiumRate: premRate,
    premium,
    financedLoan,
    annualDebtService,
    equityInvested,
    downPaymentPct,
    dscr,
    cashFlowYr1,
    cashOnCash,
    proforma,
    netSaleProceeds,
    totalDistributions,
    equityMultiple,
    irr: irr(flows),
  };
}
