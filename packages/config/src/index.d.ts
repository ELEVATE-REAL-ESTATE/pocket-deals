/** Déclarations de types pour @elevate/config (DX dans les apps TS). */

export interface RateSpread {
  base: "goc5yr" | "cmb5yr";
  spread: number;
}
export interface ProgramItem {
  label: string;
  maxLTV: number;
  minDCR: number;
  maxAmort: number;
  insured: boolean;
  pointsEligible: boolean;
  hint: string;
}

export interface PremiumScheduleBand {
  maxLTV: number;
  premium: number;
}
export interface PremiumSchedule {
  asOf: string;
  source: string;
  baseByLTV: PremiumScheduleBand[];
  amortSurchargePer5yr: number;
  surchargeBaseYears: number;
  pointsDiscounts: Record<string, number>;
}
export interface LabeledCap {
  label: string;
  baseCap: number;
}
export interface LabeledSpread {
  label: string;
  spread: number;
}

export interface RentSet {
  studio: number | null;
  br1: number | null;
  br2: number | null;
  br3: number | null;
}
export interface MarketRentRegion {
  label: string;
  group: string;
  capBucket: string;
  rents: RentSet;
}
export interface MarketRents {
  asOf: string;
  source: string;
  groups: string[];
  regions: Record<string, MarketRentRegion>;
}

export interface MarketData {
  meta: { lastUpdated: string; note: string };
  rates: {
    valetSeries: { policy: string; prime: string; goc5yr: string };
    valetUrl: string;
    cmbWidgetUrl: string;
    cmbLabel: string;
    cmbSource: string;
    cmbSpread: number;
    fallback: { policy: number; prime: number; goc5yr: number };
    fallbackAsOf: string;
    spreads: Record<string, RateSpread>;
    source: string;
  };
  programs: {
    asOf: string;
    source: string;
    items: Record<string, ProgramItem>;
    premiumSchedule: PremiumSchedule;
  };
  schlExpenses: {
    asOf: string;
    source: string;
    byConstruction: Record<"bois" | "beton", {
      repairsPerDoor: number;
      salaryPerDoor: { lt12: number; ge12: number };
      mgmtPct: { lt12: number; ge12: number };
    }>;
    mgmtPct: number;
    vacancyFloor: number;
    reserveComponents: { appliances: number; heatpump: number; elevatorPerMonth: number };
    otherCostsPct: number;
  };
  construction: Record<string, { label: string }>;
  capRates: {
    asOf: string;
    source: string;
    regions: Record<string, LabeledCap>;
    assetSpreads: Record<string, LabeledSpread>;
  };
  marketRents: MarketRents;
}

export declare const MARKET_DATA: MarketData;
