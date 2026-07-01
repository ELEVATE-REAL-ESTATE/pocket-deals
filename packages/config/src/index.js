import { MARKET_RENTS } from "./market-rents.js";

/* ============================================================================
   @elevate/config — DONNÉES DE MARCHÉ (source unique pour les apps bundlées)
   ----------------------------------------------------------------------------
   Identique au contenu de `market-data.js` (racine), mais exporté en module ESM
   (`MARKET_DATA`) au lieu d'un global `window.MARKET_DATA`.

   ⚠️ Pendant la transition (Phase 1), DEUX copies coexistent :
     • racine `market-data.js`  → page statique `analyzer.html` (script classique)
     • ce fichier               → apps bundlées (import ESM)
   À la bascule (fin Tranche 2), supprimer la version racine et repointer la
   routine `refresh-market-data` vers CE fichier (voir REFRESH-MARKET.md).
   ============================================================================ */
export const MARKET_DATA = {

  meta: {
    lastUpdated: "2026-07-01",
    note: "Repères de marché — à valider avec un courtier hypothécaire / prêteur avant toute offre."
  },

  rates: {
    valetSeries: { policy: "V39079", prime: "V80691311", goc5yr: "BD.CDN.5YR.DQ.YLD" },
    valetUrl: "https://www.bankofcanada.ca/valet/observations/V39079,V80691311,BD.CDN.5YR.DQ.YLD/json?recent=30",
    cmbWidgetUrl: "https://www.thefinancials.com/Widget.aspx?pid=GREENBIR&wid=0375108050&mode=js&width=0",
    cmbLabel: "CMB 5-Year",
    cmbSource: "GreenBirch Capital / theFinancials",
    cmbSpread: 0.0035,
    fallback: { policy: 0.0225, prime: 0.0445, goc5yr: 0.0302 },
    fallbackAsOf: "2026-06-30",
    spreads: {
      "conv":    { base: "goc5yr", spread: 0.0215 },
      "mli-std": { base: "cmb5yr", spread: 0.0140 },
      "mli-sel": { base: "cmb5yr", spread: 0.0125 }
    },
    source: "Banque du Canada — API Valet (taux directeur V39079, préférentiel V80691311, oblig. 5 ans)"
  },

  programs: {
    asOf: "2025-Q4",
    source: "SCHL — MLI Standard & MLI Select 2025-2026 ; normes bancaires conventionnelles",
    items: {
      "conv":    { label:"Conventionnel (non assuré)",  maxLTV:0.75, minDCR:1.25, maxAmort:30, insured:false, pointsEligible:false,
                   hint:"Prêteur bancaire — jusqu’à 75 % RPV, RCD min 1,25, amort. 25–30 ans." },
      "mli-std": { label:"SCHL — MLI Standard (assuré)", maxLTV:0.85, minDCR:1.20, maxAmort:40, insured:true,  pointsEligible:false,
                   hint:"Assuré SCHL — jusqu’à 85 % RPV, RCD min 1,20, amort. jusqu’à 40 ans." },
      "mli-sel": { label:"SCHL — MLI Select (assuré)",   maxLTV:0.95, minDCR:1.10, maxAmort:50, insured:true,  pointsEligible:true,
                   hint:"Pointage (abordabilité, efficacité, accessibilité) — jusqu’à 95 % RPV, RCD min 1,10, amort. jusqu’à 50 ans." }
    },
    // Barème de prime SCHL — tarification AU RISQUE (en vigueur 14 juillet 2025).
    // prime = (base selon RPV + surcharge d'amortissement) × (1 − rabais pointage).
    // Valeurs approximatives (sources secondaires) — à affiner avec le tableau officiel SCHL / un prêteur.
    premiumSchedule: {
      asOf: "2025-07-14",
      source: "SCHL — tarification au risque (14 juillet 2025) ; LendCity, buildingsforsaletoronto — valeurs approximatives",
      // Prime de base : première bande dont le RPV du prêt est ≤ maxLTV
      baseByLTV: [
        { maxLTV: 0.65, premium: 0.0245 },
        { maxLTV: 0.75, premium: 0.0250 },
        { maxLTV: 0.80, premium: 0.0475 },
        { maxLTV: 0.85, premium: 0.0550 },
        { maxLTV: 0.90, premium: 0.0585 },
        { maxLTV: 0.95, premium: 0.0615 }
      ],
      amortSurchargePer5yr: 0.0025, // +0,25 % par tranche de 5 ans
      surchargeBaseYears: 25,       // au-delà de 25 ans
      pointsDiscounts: { "0": 0, "50": 0.10, "70": 0.20, "100": 0.30 } // MLI Select seulement
    }
  },

  schlExpenses: {
    asOf: "2026-06",
    source: "SCHL — barèmes de dépenses normalisées (mise à jour officielle du 8 juin 2026)",
    // PUPA = par porte par an ($/porte/an). Barèmes par type de construction
    // (et par taille pour le bois : < 12 logements vs 12 et plus).
    byConstruction: {
      bois:  { repairsPerDoor: 700,  salaryPerDoor: { lt12: 250, ge12: 400 }, mgmtPct: { lt12: 4.5, ge12: 5 } },
      beton: { repairsPerDoor: 1040, salaryPerDoor: { lt12: 670, ge12: 670 }, mgmtPct: { lt12: 5,   ge12: 5 } }
    },
    mgmtPct: 5,             // repli générique (% du RBE)
    vacancyFloor: 0.03,
    // Réserve de remplacement = somme des composantes présentes (aucune base structurale).
    // électro & thermopompe en $/porte ; ascenseur en $/ascenseur/mois (réparti sur les portes).
    reserveComponents: { appliances: 60, heatpump: 190, elevatorPerMonth: 315 },
    otherCostsPct: 1       // « Autres coûts » (publicité, permis, ordures, déneigement…) : 1 % du RBE — nouveau
  },

  construction: {
    "bois":  { label:"Brique et bois (ossature légère)" },
    "beton": { label:"Béton (structure de béton)" }
  },

  capRates: {
    asOf: "2025-Q4",
    source: "Colliers (Canada Cap Rate Report Q4 2025), CBRE, Cushman & Wakefield",
    regions: {
      "mtl-prime": { label:"Montréal — secteurs prime (centre, Plateau, Outremont)", baseCap:0.0425 },
      "mtl":       { label:"Montréal — île (général)",                                baseCap:0.0500 },
      "mtl-sec":   { label:"Montréal — secteurs secondaires / valeur ajoutée",        baseCap:0.0575 },
      "couronne":  { label:"Laval / Rive-Sud / Rive-Nord",                            baseCap:0.0550 },
      "quebec":    { label:"Ville de Québec",                                         baseCap:0.0550 },
      "gatineau":  { label:"Gatineau / Outaouais",                                    baseCap:0.0550 },
      "sherb-tr":  { label:"Sherbrooke / Trois-Rivières",                             baseCap:0.0600 },
      "region":    { label:"Régions (autres villes du Québec)",                       baseCap:0.0650 }
    },
    assetSpreads: {
      "multi":  { label:"Multilogement (5+ unités)",        spread:0.0000 },
      "small":  { label:"Petit locatif (2–4 logements)",    spread:0.0025 },
      "mixed":  { label:"Mixte (résidentiel + commercial)", spread:0.0050 },
      "indus":  { label:"Industriel",                       spread:0.0050 },
      "retail": { label:"Commercial / commerce de détail",  spread:0.0125 },
      "office": { label:"Bureau",                           spread:0.0200 },
      "senior": { label:"Résidence (RPA / étudiant)",       spread:0.0075 }
    }
  },

  /* -- Repères de VALORISATION multi-résidentiel à revenus, par bucket métro
        (mêmes clés que capRates.regions). $/pi² de bâtiment brut et $/porte.
        ⚠ Estimations INDICATIVES (fourchettes courtiers Colliers/CBRE/JLR/APCIQ,
        cohérentes avec les cap rates) — à valider avec ton marché et à affiner par l'agent.
        Le $/pi² vise l'immeuble à revenus, PAS le condo (qui est bien plus élevé). */
  valuation: {
    asOf: "2026-Q2",
    source: "Estimations indicatives — multi-résidentiel à revenus (Colliers/CBRE/JLR/APCIQ). À affiner.",
    byBucket: {
      "mtl-prime": { pricePerSqft: 400, pricePerDoor: 320000 },
      "mtl":       { pricePerSqft: 320, pricePerDoor: 255000 },
      "mtl-sec":   { pricePerSqft: 285, pricePerDoor: 215000 },
      "couronne":  { pricePerSqft: 295, pricePerDoor: 235000 },
      "quebec":    { pricePerSqft: 265, pricePerDoor: 200000 },
      "gatineau":  { pricePerSqft: 265, pricePerDoor: 205000 },
      "sherb-tr":  { pricePerSqft: 230, pricePerDoor: 175000 },
      "region":    { pricePerSqft: 195, pricePerDoor: 155000 }
    }
  },

  /* -- Loyers de marché SCHL par région détaillée (135 zones) + bucket de cap.
        Généré dans market-rents.js depuis l'Enquête sur les logements locatifs. */
  marketRents: MARKET_RENTS
};
