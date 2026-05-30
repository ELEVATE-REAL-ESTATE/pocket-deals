/**
 * Primitives financières — fonctions pures.
 * `annualRate` est une FRACTION (ex. 0.0525 pour 5,25 %).
 */

/** Versement mensuel d'un prêt entièrement amorti. */
export function mortgagePayment(principal: number, annualRate: number, years: number): number {
  const n = years * 12;
  if (n <= 0) return 0;
  const r = annualRate / 12;
  return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Prêt maximal (valeur actuelle) qu'un versement mensuel donné peut porter. */
export function loanFromPayment(monthlyPayment: number, annualRate: number, years: number): number {
  const n = years * 12;
  if (n <= 0) return 0;
  const r = annualRate / 12;
  return r === 0 ? monthlyPayment * n : (monthlyPayment * (1 - Math.pow(1 + r, -n))) / r;
}

/** Solde restant après `monthsPaid` versements. */
export function remainingBalance(
  principal: number,
  annualRate: number,
  years: number,
  monthsPaid: number,
): number {
  const r = annualRate / 12;
  const pmt = mortgagePayment(principal, annualRate, years);
  if (r === 0) return Math.max(0, principal - pmt * monthsPaid);
  return Math.max(
    0,
    principal * Math.pow(1 + r, monthsPaid) - (pmt * (Math.pow(1 + r, monthsPaid) - 1)) / r,
  );
}

/**
 * Taux de rendement interne d'une série de flux annuels (cf[0] = mise initiale,
 * négative). Recherche par bissection. Renvoie null s'il n'y a pas de changement
 * de signe dans l'intervalle exploré.
 */
export function irr(cashflows: number[]): number | null {
  const npv = (rate: number): number =>
    cashflows.reduce((acc, c, t) => acc + c / Math.pow(1 + rate, t), 0);

  let lo = -0.9999;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 1e-6) return mid;
    if (npv(lo) * v < 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
