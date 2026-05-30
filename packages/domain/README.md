# @elevate/domain

Cœur métier de l'écosystème Elevate — **pur, sans dépendance UI/DOM**, donc
testable et réutilisable par tous les produits (Analyzer, Radar, Dashboard).

## Contenu
- `finance.ts` — primitives : versement, prêt depuis versement, solde restant, TRI.
- `schl.ts` — barèmes de dépenses normalisées SCHL (entretien, conciergerie, réserves).
- `underwrite.ts` — `underwrite(deal): UnderwritingResult` : NOI, cap, prêt max (valeur **et** couverture), RCD, cash-on-cash, pro forma, multiple d'équité, TRI.
- `types.ts` — modèles partagés (`DealInputs`, `UnderwritingResult`, …).

## Usage
```ts
import { underwrite } from "@elevate/domain";

const result = underwrite({
  price: 2_400_000, units: 12, sqft: 11_000, closingPct: 2.5, capex: 0,
  grossRevenue: 312_000, vacancyPct: 4,
  expenses: { taxes: 34_000, insurance: 11_000, energy: 22_000, water: 9_000,
              repairs: 18_000, caretaking: 9_000, mgmtPct: 5, reservePerDoor: 300, misc: 6_000 },
  program: { maxLTV: 0.85, minDCR: 1.2, maxAmort: 40, premium: 0.04 },
  rate: 5.25, amort: 40, premiumPct: 4.0, capMktPct: 5.0,
  hold: 5, rentGrowthPct: 3, expenseGrowthPct: 2.5, exitCapPct: 6.5, sellingPct: 4,
});
// result.noi, result.capRate, result.dscr, result.cashOnCash, result.equityMultiple, …
```

> Convention : les champs `…Pct` et `rate` sont en **pourcentage** (5.25 = 5,25 %).

## Scripts
- `pnpm build` — bundle ESM + CJS + IIFE (`window.ElevateDomain`) via tsup.
- `pnpm test` — tests « golden » qui verrouillent les chiffres du moteur.
- `pnpm typecheck` — `tsc --noEmit`.
