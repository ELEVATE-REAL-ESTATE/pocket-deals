/**
 * Barèmes de dépenses normalisées SCHL (Québec, mise à jour officielle du 8 juin 2026).
 * Règles métier pures — partagées par l'Analyzer (normalisation) et le Radar (scoring).
 * Les chiffres restent éditables côté config/marché.
 */
import type { ConstructionType } from "./types.js";

/** Plancher d'inoccupation normalisé (fraction). */
export const SCHL_VACANCY_FLOOR = 0.03;

/** « Autres coûts » normalisés (publicité, permis, ordures, déneigement…) — % du RBE. */
export const SCHL_OTHER_COSTS_PCT = 1;

interface ConstructionScale {
  /** Entretien & réparations ($/porte/an). */
  repairsPerDoor: number;
  /** Conciergerie / salaire ($/porte/an), par palier d'unités. */
  salaryPerDoor: { lt12: number; ge12: number };
  /** Gestion (% du RBE), par palier d'unités. */
  mgmtPct: { lt12: number; ge12: number };
}

/** Barèmes par type de construction (et par taille pour le bois). */
export const SCHL_BY_CONSTRUCTION: Record<ConstructionType, ConstructionScale> = {
  bois: { repairsPerDoor: 700, salaryPerDoor: { lt12: 250, ge12: 400 }, mgmtPct: { lt12: 4.5, ge12: 5 } },
  beton: { repairsPerDoor: 1040, salaryPerDoor: { lt12: 670, ge12: 670 }, mgmtPct: { lt12: 5, ge12: 5 } },
};

/** Entretien & réparations normalisés ($/porte/an) selon la construction. */
export function schlRepairsPerDoor(construction: ConstructionType = "bois"): number {
  return SCHL_BY_CONSTRUCTION[construction].repairsPerDoor;
}

/** Conciergerie / salaire normalisé ($/porte/an) — selon la construction et la taille. */
export function schlConciergePerDoor(units: number, construction: ConstructionType = "bois"): number {
  const s = SCHL_BY_CONSTRUCTION[construction].salaryPerDoor;
  return units >= 12 ? s.ge12 : s.lt12;
}

/** Gestion normalisée (% du RBE) — selon la construction et la taille. */
export function schlMgmtPct(units: number, construction: ConstructionType = "bois"): number {
  const m = SCHL_BY_CONSTRUCTION[construction].mgmtPct;
  return units >= 12 ? m.ge12 : m.lt12;
}

/** Composantes de réserve ajoutées selon les équipements présents. */
export const SCHL_RESERVE_COMPONENTS = {
  appliances: 60, // électroménagers fournis ($/porte/an)
  heatpump: 190, // thermopompe / climatisation ($/porte/an)
  elevatorPerMonth: 315, // ascenseur ($/ascenseur/mois, réparti sur les portes)
} as const;

export interface ReserveOptions {
  units: number;
  construction?: ConstructionType;
  hasAppliances?: boolean;
  hasHeatPump?: boolean;
  hasElevator?: boolean;
}

/**
 * Réserve de remplacement normalisée ($/porte/an) = somme des composantes présentes
 * (aucune base structurale, norme 2026-06). L'ascenseur est une charge mensuelle au
 * bâtiment, répartie sur les portes.
 */
export function schlReservePerDoor(opts: ReserveOptions): number {
  const units = Math.max(1, opts.units);
  let r = 0;
  if (opts.hasAppliances) r += SCHL_RESERVE_COMPONENTS.appliances;
  if (opts.hasHeatPump) r += SCHL_RESERVE_COMPONENTS.heatpump;
  if (opts.hasElevator) r += Math.round((SCHL_RESERVE_COMPONENTS.elevatorPerMonth * 12) / units);
  return r;
}
