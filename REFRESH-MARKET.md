# Rafraîchir les données de marché (`packages/config/src/index.js`)

Procédure pour garder l'analyseur à jour. Tout vit dans **`packages/config/src/index.js`**
(le paquet `@elevate/config`, `export const MARKET_DATA`) — un seul fichier.
Chaque bloc porte un `asOf` (date de validité) et une `source`. Après une mise à jour,
**bump `meta.lastUpdated`** à la date du jour.

> Note (post-bascule) : l'ancien `market-data.js` à la racine a été retiré ; la source
> unique est désormais le paquet `@elevate/config`. L'app `apps/analyzer` l'importe,
> et le build committé `/analyzer/` est régénéré via `pnpm --filter analyzer build`.

Cette procédure est conçue pour être exécutée :
- **manuellement** (ouvrir une session Claude Code et demander « rafraîchis les données de marché ») ; ou
- **automatiquement** via une routine planifiée (`/schedule`) — voir la cadence proposée en bas.

---

## Ce qui se rafraîchit tout seul (aucune action requise)

| Donnée | Source live (API Valet, Banque du Canada) | Fréquence |
|---|---|---|
| **Taux directeur** | série `V39079` (target overnight rate) | À chaque chargement + bouton ↻ |
| **Taux préférentiel** | série `V80691311` (prime rate) | idem |
| **Obligation 5 ans** | série `BD.CDN.5YR.DQ.YLD` | idem |
| **CMB 5 ans** | *EXACT* — feed temps réel GreenBirch Capital / theFinancials (`rates.cmbWidgetUrl`), ligne « CMB 5-Year ». Repli : oblig. 5 ans + `rates.cmbSpread` si le feed est inaccessible. | À chaque chargement + bouton ↻ |
| **Taux hypothécaire suggéré** | base (oblig. ou CMB selon programme) + `rates.spreads[programme].spread` | idem |

À ajuster manuellement dans `packages/config/src/index.js` quand le marché bouge :
- `rates.cmbSpread` — écart CMB de **repli** seulement (si le feed GreenBirch tombe ; ~25–50 pb)
- `rates.spreads[*].spread` — écart hypothécaire par programme (voir §4)

---

## Ce qui demande un rafraîchissement périodique

Pour chaque bloc : consulter la/les source(s), extraire les chiffres, mettre à jour le bloc, bumper `asOf`.

### 1. `capRates` — taux de capitalisation par région & actif
- **Sources** :
  - Colliers — *Canada Cap Rate Report* (trimestriel) : https://www.collierscanada.com/en-ca/research
  - CBRE — *Canadian Cap Rates & Market Reports* : https://www.cbre.ca/insights/canadian-market-reports
  - Cushman & Wakefield — *Canadian Cap Rates Report* : https://www.cushmanwakefield.com/en/canada/insights/canadian-cap-rates-perspective-report
- **Extraire** : fourchettes de cap rate multilogement (haut/bas de gamme) pour Montréal, Québec, Gatineau, etc.
  Mettre à jour `regions[*].baseCap` (cap multilogement de référence) et, au besoin, `assetSpreads[*].spread`
  (écart bureau/commercial/industriel vs multilogement).
- **Cadence** : **trimestrielle** (les rapports sortent par trimestre).

### 2. `programs` — paramètres SCHL / conventionnel (RPV, RCD, amortissement, prime)
- **Sources** :
  - SCHL — MLI Select : https://www.cmhc-schl.gc.ca/professionals/project-funding-and-mortgage-financing/mortgage-loan-insurance/multi-unit-insurance/mliselect
  - SCHL — MLI Standard (assurance prêt logements locatifs) : page « multi-unit insurance »
  - Bulletins SCHL sur les **primes** (révisées à l'occasion ; ex. ajustements de tarification au risque)
- **Extraire** : `maxLTV`, `minDCR`, `maxAmort`, `premium` par programme. Vérifier surtout la **prime**
  (`premium`) — c'est ce qui bouge le plus.
- **Cadence** : **à chaque bulletin SCHL** (vérifier ~mensuellement).

### 3. `schlExpenses` — barèmes de dépenses normalisées (Québec)
- **Sources** :
  - CORPIQ — actualités SCHL : https://www.corpiq.com/fr/nouvelles
  - SCHL — barèmes de dépenses d'opération / *Replacement Reserve Guide*
  - MREX — Revenu Net Normalisé (RNN) : https://mrex.co
- **Extraire** : `repairsPerDoor`, `conciergePerDoor` (par palier d'unités), `mgmtPct`,
  `reserveStructPerDoor` (bois/béton), `reserveComponents` (électros, thermopompe, ascenseur), `vacancyFloor`.
- **Cadence** : **annuelle** (la SCHL révise les barèmes ~1×/an ; dernière connue : juin 2023).

### 4. `rates.spreads` + `rates.cmbSpread` — écarts hypothécaires
- **Sources** : courtiers hypothécaires commerciaux (taux affichés multi-résidentiel assuré vs conventionnel),
  WOWA, LendCity, ou un prêteur partenaire ; pour la CMB, écart CMB/Canada publié par les pupitres obligataires.
- **Extraire** :
  - `cmbSpread` : écart CMB 5 ans − obligation 5 ans du Canada (~25–50 pb).
  - `spreads.conv.spread` : écart conventionnel sur l'**obligation 5 ans**.
  - `spreads["mli-std"].spread` / `spreads["mli-sel"].spread` : écart sur la **CMB 5 ans** (les prêts assurés se tarifient sur la CMB).
- **Cadence** : **trimestrielle**.

---

## Procédure d'écriture
1. Pour chaque chiffre changé, mettre à jour la valeur **et** le `asOf` du bloc **et** la `source` si elle change.
2. Bumper `meta.lastUpdated` à la date du jour.
3. Conserver la précision en décimales (cap rates et taux sont stockés en **fraction** : 5,25 % → `0.0525`).
4. Commit avec un message qui cite les sources et les trimestres (ex. `MAJ cap rates Colliers Q1 2026`).

## Cadence planifiée proposée (`/schedule`)
- **Mensuelle** — vérifier primes SCHL + écarts de crédit ; bump si changement.
- **Trimestrielle** — cap rates (Colliers/CBRE/C&W) au lendemain de la sortie des rapports.
- **Annuelle** — barèmes de dépenses normalisées SCHL.

> Note : les taux d'intérêt n'ont **pas** besoin d'être planifiés — ils sont tirés en direct à chaque ouverture.
