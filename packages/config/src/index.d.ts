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
    repairsPerDoor: number;
    conciergePerDoor: { ge12: number; lt12: number };
    mgmtPct: number;
    vacancyFloor: number;
    reserveStructPerDoor: { bois: number; beton: number };
    reserveComponents: { appliances: number; heatpump: number; elevatorBuilding: number };
  };
  construction: Record<string, { label: string }>;
  capRates: {
    asOf: string;
    source: string;
    regions: Record<string, LabeledCap>;
    assetSpreads: Record<string, LabeledSpread>;
  };
}

export declare const MARKET_DATA: MarketData;
