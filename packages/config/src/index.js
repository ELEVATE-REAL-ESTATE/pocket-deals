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
    lastUpdated: "2026-05-29",
    note: "Repères de marché — à valider avec un courtier hypothécaire / prêteur avant toute offre."
  },

  rates: {
    valetSeries: { policy: "V39079", prime: "V80691311", goc5yr: "BD.CDN.5YR.DQ.YLD" },
    valetUrl: "https://www.bankofcanada.ca/valet/observations/V39079,V80691311,BD.CDN.5YR.DQ.YLD/json?recent=30",
    cmbWidgetUrl: "https://www.thefinancials.com/Widget.aspx?pid=GREENBIR&wid=0375108050&mode=js&width=0",
    cmbLabel: "CMB 5-Year",
    cmbSource: "GreenBirch Capital / theFinancials",
    cmbSpread: 0.0035,
    fallback: { policy: 0.0225, prime: 0.0445, goc5yr: 0.0310 },
    fallbackAsOf: "2026-05-28",
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
      "conv":    { label:"Conventionnel (non assuré)",  maxLTV:0.75, minDCR:1.25, maxAmort:30, premium:0,
                   hint:"Prêteur bancaire — jusqu’à 75 % RPV, RCD min 1,25, amort. 25–30 ans." },
      "mli-std": { label:"SCHL — MLI Standard (assuré)", maxLTV:0.85, minDCR:1.20, maxAmort:40, premium:0.040,
                   hint:"Assuré SCHL — jusqu’à 85 % RPV, RCD min 1,20, amort. jusqu’à 40 ans." },
      "mli-sel": { label:"SCHL — MLI Select (assuré)",   maxLTV:0.95, minDCR:1.10, maxAmort:50, premium:0.045,
                   hint:"Pointage (abordabilité, efficacité, accessibilité) — jusqu’à 95 % RPV, RCD min 1,10, amort. jusqu’à 50 ans." }
    }
  },

  schlExpenses: {
    asOf: "2023-06",
    source: "SCHL / CORPIQ — barèmes de dépenses normalisées (mise à jour juin 2023)",
    repairsPerDoor: 610,
    conciergePerDoor: { ge12: 365, lt12: 330 },
    mgmtPct: 5,
    vacancyFloor: 0.03,
    reserveStructPerDoor: { bois: 450, beton: 300 },
    reserveComponents: { appliances: 110, heatpump: 250, elevatorBuilding: 2500 }
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
  }
};
