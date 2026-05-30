/* ============================================================================
   ElevateDomain — bundle navigateur (PONT TEMPORAIRE · Phase 0)
   ----------------------------------------------------------------------------
   Transcription fidèle de @elevate/domain pour l'analyseur statique, le temps
   que apps/analyzer devienne une app Vite/Next (Phase 1) qui importe le paquet
   directement.

   NE PAS ÉDITER À LA MAIN. À régénérer via :
     pnpm --filter @elevate/domain build   (tsup → dist/index.global.js)
   puis copier ici. La parité avec le paquet TypeScript est garantie par les
   tests « golden » (packages/domain/test/underwrite.test.ts).
   ============================================================================ */
var ElevateDomain = (function () {
  // ---- Primitives financières (annualRate = fraction, ex. 0.0525) ----
  function mortgagePayment(principal, annualRate, years) {
    const n = years * 12; if (n <= 0) return 0;
    const r = annualRate / 12;
    return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  }
  function loanFromPayment(monthlyPayment, annualRate, years) {
    const n = years * 12; if (n <= 0) return 0;
    const r = annualRate / 12;
    return r === 0 ? monthlyPayment * n : (monthlyPayment * (1 - Math.pow(1 + r, -n))) / r;
  }
  function remainingBalance(principal, annualRate, years, monthsPaid) {
    const r = annualRate / 12, pmt = mortgagePayment(principal, annualRate, years);
    if (r === 0) return Math.max(0, principal - pmt * monthsPaid);
    return Math.max(0, principal * Math.pow(1 + r, monthsPaid) - (pmt * (Math.pow(1 + r, monthsPaid) - 1)) / r);
  }
  function irr(cashflows) {
    const npv = (rate) => cashflows.reduce((acc, c, t) => acc + c / Math.pow(1 + rate, t), 0);
    let lo = -0.9999, hi = 10; if (npv(lo) * npv(hi) > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, v = npv(mid);
      if (Math.abs(v) < 1e-6) return mid;
      (npv(lo) * v < 0) ? (hi = mid) : (lo = mid);
    }
    return (lo + hi) / 2;
  }

  // ---- Barèmes SCHL ----
  const SCHL_REPAIRS_PER_DOOR = 610;
  const SCHL_MGMT_PCT = 5;
  const SCHL_VACANCY_FLOOR = 0.03;
  const schlConciergePerDoor = (units) => (units >= 12 ? 365 : 330);
  const SCHL_RESERVE_STRUCT = { bois: 450, beton: 300 };
  const SCHL_RESERVE_COMPONENTS = { appliances: 110, heatpump: 250, elevatorBuilding: 2500 };
  function schlReservePerDoor(opts) {
    const units = Math.max(1, opts.units);
    let r = SCHL_RESERVE_STRUCT[opts.construction];
    if (opts.hasAppliances) r += SCHL_RESERVE_COMPONENTS.appliances;
    if (opts.hasHeatPump) r += SCHL_RESERVE_COMPONENTS.heatpump;
    if (opts.hasElevator) r += Math.round(SCHL_RESERVE_COMPONENTS.elevatorBuilding / units);
    return r;
  }

  // ---- Moteur d'underwriting (champs ...Pct en POURCENTAGE, ex. 5.25) ----
  const pc = (p) => p / 100;
  function underwrite(input) {
    const price = input.price, units = Math.max(1, input.units), sqft = input.sqft,
      capex = input.capex, x = input.expenses, program = input.program;
    const closing = pc(input.closingPct), vacancy = pc(input.vacancyPct), rate = pc(input.rate),
      premiumPct = pc(input.premiumPct), capMkt = pc(input.capMktPct), rentG = pc(input.rentGrowthPct),
      expG = pc(input.expenseGrowthPct), selling = pc(input.sellingPct);
    const exitCap = input.exitCapPct > 0 ? pc(input.exitCapPct) : capMkt;
    const amort = Math.min(input.amort, program.maxAmort);
    const hold = Math.max(1, Math.round(input.hold));

    const egi = input.grossRevenue * (1 - vacancy);
    const opex = x.taxes + x.insurance + x.energy + x.water + x.repairs + x.caretaking
      + egi * pc(x.mgmtPct) + units * x.reservePerDoor + x.misc;
    const noi = egi - opex;
    const expenseRatio = input.grossRevenue > 0 ? opex / input.grossRevenue : 0;

    const capRate = price > 0 ? noi / price : 0;
    const impliedValue = capMkt > 0 ? noi / capMkt : 0;
    const pricePerDoor = price / units;
    const pricePerSqft = sqft > 0 ? price / sqft : 0;

    const loanByLTV = price * program.maxLTV;
    const maxAnnualDebt = noi / program.minDCR;
    const loanByDCR = Math.max(0, loanFromPayment(maxAnnualDebt / 12, rate, amort));
    const loanTaken = Math.max(0, Math.min(loanByLTV, loanByDCR));
    const bindingConstraint = loanByDCR < loanByLTV ? "coverage" : "value";
    const premium = program.premium > 0 ? loanTaken * premiumPct : 0;
    const financedLoan = loanTaken + premium;
    const annualDebtService = mortgagePayment(financedLoan, rate, amort) * 12;

    const equityInvested = price - loanTaken + price * closing + capex;
    const downPaymentPct = price > 0 ? (price - loanTaken) / price : 0;
    const dscr = annualDebtService > 0 ? noi / annualDebtService : Infinity;
    const cashFlowYr1 = noi - annualDebtService;
    const cashOnCash = equityInvested > 0 ? cashFlowYr1 / equityInvested : 0;

    const proforma = []; const flows = [-equityInvested]; let netSaleProceeds = 0;
    for (let y = 1; y <= hold; y++) {
      const rev = egi * Math.pow(1 + rentG, y - 1);
      const exp = opex * Math.pow(1 + expG, y - 1);
      const yNoi = rev - exp, yCf = yNoi - annualDebtService;
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
    const totalCf = proforma.reduce((acc, p) => acc + p.cashFlow, 0);
    const totalDistributions = totalCf + netSaleProceeds;
    const equityMultiple = equityInvested > 0 ? totalDistributions / equityInvested : 0;

    return {
      egi, opex, noi, expenseRatio, capRate, capMkt, impliedValue, pricePerDoor, pricePerSqft,
      loanByLTV, loanByDCR, loanTaken, bindingConstraint, premium, financedLoan, annualDebtService,
      equityInvested, downPaymentPct, dscr, cashFlowYr1, cashOnCash, proforma, netSaleProceeds,
      totalDistributions, equityMultiple, irr: irr(flows),
    };
  }

  return {
    mortgagePayment, loanFromPayment, remainingBalance, irr, underwrite,
    SCHL_REPAIRS_PER_DOOR, SCHL_MGMT_PCT, SCHL_VACANCY_FLOOR, schlConciergePerDoor,
    SCHL_RESERVE_STRUCT, SCHL_RESERVE_COMPONENTS, schlReservePerDoor,
  };
})();
if (typeof window !== "undefined") window.ElevateDomain = ElevateDomain;
