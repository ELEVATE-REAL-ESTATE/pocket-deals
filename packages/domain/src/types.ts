/**
 * Modèles métier de l'underwriting Elevate.
 *
 * Convention : tous les champs suffixés `Pct` (et `rate`) sont exprimés en
 * POURCENTAGE tel que saisi dans l'UI (ex. 5.25 = 5,25 %). Les valeurs
 * monétaires sont en dollars. Le moteur fait la conversion en interne.
 */

export type ConstructionType = "bois" | "beton";

/** Paramètres d'un programme de financement (conventionnel / SCHL). */
export interface FinancingProgram {
  /** Ratio prêt-valeur maximal (fraction, ex. 0.85). */
  maxLTV: number;
  /** Ratio de couverture de dette minimal (ex. 1.20). */
  minDCR: number;
  /** Amortissement maximal autorisé (années). */
  maxAmort: number;
  /** Taux de prime SCHL appliqué au prêt de base (fraction, 0 si conventionnel). */
  premium: number;
}

/** Dépenses d'exploitation, ventilées par catégorie. */
export interface ExpenseInputs {
  taxes: number;
  insurance: number;
  energy: number;
  water: number;
  repairs: number;
  caretaking: number;
  /** Gestion, en % du revenu brut effectif (RBE). */
  mgmtPct: number;
  /** Réserve de remplacement, en $/porte/an. */
  reservePerDoor: number;
  misc: number;
}

/** Toutes les entrées nécessaires pour underwriter un deal. */
export interface DealInputs {
  price: number;
  units: number;
  sqft: number;
  /** Frais d'acquisition, en % du prix. */
  closingPct: number;
  capex: number;

  /** Revenus bruts annuels (loyers + autres). */
  grossRevenue: number;
  /** Inoccupation & mauvaises créances, en %. */
  vacancyPct: number;
  expenses: ExpenseInputs;

  program: FinancingProgram;
  /** Taux d'intérêt annuel, en % (ex. 5.25). */
  rate: number;
  /** Amortissement demandé (années) — plafonné par program.maxAmort. */
  amort: number;
  /** Prime SCHL appliquée, en % (ex. 4.0). */
  premiumPct: number;

  /** Cap de marché suggéré, en % (ex. 5.0) — sert à la valeur implicite et à la sortie. */
  capMktPct: number;

  /** Période de détention (années). */
  hold: number;
  /** Croissance annuelle des loyers, en %. */
  rentGrowthPct: number;
  /** Croissance annuelle des dépenses, en %. */
  expenseGrowthPct: number;
  /** Cap de sortie, en %. Si <= 0, on utilise capMktPct. */
  exitCapPct: number;
  /** Frais de vente à la sortie, en % du prix de vente brut. */
  sellingPct: number;
}

/** Une année du pro forma. */
export interface ProformaRow {
  year: number;
  noi: number;
  debtService: number;
  cashFlow: number;
  loanBalance: number;
}

/** Résultat complet de l'underwriting. */
export interface UnderwritingResult {
  // Revenus & dépenses
  egi: number;
  opex: number;
  noi: number;
  expenseRatio: number;

  // Évaluation
  capRate: number;
  capMkt: number;
  impliedValue: number;
  pricePerDoor: number;
  pricePerSqft: number;

  // Capacité d'emprunt
  loanByLTV: number;
  loanByDCR: number;
  loanTaken: number;
  bindingConstraint: "value" | "coverage";
  premium: number;
  financedLoan: number;
  annualDebtService: number;
  equityInvested: number;
  downPaymentPct: number;

  // Rendement
  dscr: number;
  cashFlowYr1: number;
  cashOnCash: number;

  // Détention & sortie
  proforma: ProformaRow[];
  netSaleProceeds: number;
  totalDistributions: number;
  equityMultiple: number;
  /** Taux de rendement interne (fraction) ; null si non calculable. */
  irr: number | null;
}
