/**
 * Barèmes de dépenses normalisées SCHL (Québec, mise à jour juin 2023).
 * Règles métier pures — réutilisées par l'Analyzer (normalisation) et le Radar
 * (scoring). Les chiffres restent éditables côté config/marché.
 */
import type { ConstructionType } from "./types.js";

/** Entretien & réparations normalisés ($/porte/an). */
export const SCHL_REPAIRS_PER_DOOR = 610;

/** Gestion normalisée (% du RBE) — fourchette SCHL 4–5 %. */
export const SCHL_MGMT_PCT = 5;

/** Plancher d'inoccupation normalisé (fraction). */
export const SCHL_VACANCY_FLOOR = 0.03;

/** Conciergerie normalisée ($/porte/an) — palier selon le nombre d'unités. */
export function schlConciergePerDoor(units: number): number {
  return units >= 12 ? 365 : 330;
}

/** Réserve structurale de base selon la construction ($/porte/an). */
export const SCHL_RESERVE_STRUCT: Record<ConstructionType, number> = {
  bois: 450,
  beton: 300,
};

/** Composantes de réserve ajoutées selon les équipements présents. */
export const SCHL_RESERVE_COMPONENTS = {
  appliances: 110, // cuisinière + réfrigérateur (~15 ans)
  heatpump: 250, // thermopompe / climatisation par logement
  elevatorBuilding: 2500, // ascenseur — charge annuelle au bâtiment
} as const;

export interface ReserveOptions {
  units: number;
  construction: ConstructionType;
  hasAppliances?: boolean;
  hasHeatPump?: boolean;
  hasElevator?: boolean;
}

/**
 * Réserve de remplacement normalisée ($/porte/an) = structure (selon
 * construction) + composantes présentes. L'ascenseur est une charge au
 * bâtiment, répartie sur les portes.
 */
export function schlReservePerDoor(opts: ReserveOptions): number {
  const units = Math.max(1, opts.units);
  let r = SCHL_RESERVE_STRUCT[opts.construction];
  if (opts.hasAppliances) r += SCHL_RESERVE_COMPONENTS.appliances;
  if (opts.hasHeatPump) r += SCHL_RESERVE_COMPONENTS.heatpump;
  if (opts.hasElevator) r += Math.round(SCHL_RESERVE_COMPONENTS.elevatorBuilding / units);
  return r;
}
