# Phase 0 — Socle monorepo + extraction de `@elevate/domain`

**Objectif** : poser le monorepo et extraire le moteur d'underwriting (le « joyau »)
dans un paquet pur, testé, **sans changer le comportement** de l'analyseur en ligne.
Tout est **additif** : les fichiers actuels (`analyzer.html`, `index.html`,
`market-data.js`) ne sont pas touchés tant que la passerelle (PR 2) n'est pas validée.

---

## Prérequis (une seule fois)

⚠️ Node n'est pas installé sur cette machine. Installer **Node 20+** puis **pnpm** :

```powershell
winget install OpenJS.NodeJS.LTS      # ou nvm-windows
corepack enable                        # active pnpm
corepack prepare pnpm@9.12.0 --activate
node -v ; pnpm -v                      # vérifier
```

---

## Déjà créé dans cette phase (à réviser)

```
elevate/ (repo)
├─ package.json            # workspace racine (turbo)
├─ pnpm-workspace.yaml     # apps/* packages/* services/*
├─ turbo.json              # pipeline build/test/typecheck
├─ tsconfig.base.json      # réglages TS partagés
├─ .gitignore             # node_modules, dist, .turbo, .env
└─ packages/domain/        # ★ @elevate/domain
   ├─ src/ finance.ts · schl.ts · underwrite.ts · types.ts · index.ts
   ├─ test/ underwrite.test.ts     # tests « golden » (chiffres verrouillés)
   ├─ package.json · tsconfig.json · tsup.config.ts · README.md
```

Le moteur a été porté **à l'identique** depuis `calc()` de `analyzer.html`. Les
valeurs attendues des tests ont été calculées **indépendamment** (hors moteur),
donc si le build passe au vert, le comportement est garanti conforme.

---

## PR 1 — Valider le socle (aucun risque, additif)

```powershell
pnpm install
pnpm --filter @elevate/domain build      # produit dist/ (esm + cjs + iife)
pnpm --filter @elevate/domain test        # doit être vert (golden)
pnpm --filter @elevate/domain typecheck
```

**Definition of done** : `pnpm test` vert. Commit sur une branche
`chore/phase-0-monorepo`, ouvrir une PR. Le site en ligne n'est pas affecté.

---

## PR 2 — Brancher l'analyseur sur le moteur partagé (seule étape qui touche le comportement)

But : `analyzer.html` ne contient plus la *logique* de calcul ; il lit le DOM,
appelle `ElevateDomain.underwrite(...)`, puis affiche. La logique vit désormais
**uniquement** dans `@elevate/domain`.

1. Construire le bundle navigateur :
   ```powershell
   pnpm --filter @elevate/domain build
   ```
   tsup produit `packages/domain/dist/index.global.js` (variable globale
   `window.ElevateDomain`).

2. **Pont d'hébergement statique** : le `dist/` est ignoré par git. Pour que la
   page statique le serve, copier le bundle à un emplacement versionné, p. ex.
   `vendor/elevate-domain.global.js`, et l'ajouter à un script de build
   (`"build:analyzer": "pnpm --filter @elevate/domain build && copy ..."`).
   *(Pont temporaire jusqu'à ce que l'analyseur devienne une vraie app Vite/Next
   en Phase 1 — voir ci-dessous.)*

3. Dans `analyzer.html` :
   ```html
   <script src="vendor/elevate-domain.global.js"></script>
   ```
   puis remplacer le corps de `calc()` :
   ```js
   // AVANT : ~80 lignes de maths inline
   // APRÈS :
   const inputs = readDealInputsFromDOM();        // adaptateur DOM → DealInputs
   const r = ElevateDomain.underwrite(inputs);    // moteur partagé
   renderResult(r);                               // adaptateur résultat → DOM
   ```
   Les fonctions `mortPayment` / `loanFromPayment` / `remainingBalance` / `irr`
   inline sont supprimées (elles vivent dans le paquet).

4. **Vérification anti-régression** : ouvrir la page, comparer chaque métrique aux
   valeurs actuelles (NOI 171 944 $, cap 7,16 %, RCD 1,35, CoC 10,7 %, etc. —
   exactement les golden). Aucune différence attendue.

**Definition of done** : page identique au pixel près sur les chiffres ; `calc()`
ne contient plus aucune formule financière.

---

## Frontières posées dès la Phase 0
- La logique métier vit **uniquement** dans `@elevate/domain` — jamais dupliquée.
- `analyzer.html` devient un *consommateur* (adaptateurs DOM ⇄ moteur), pas un détenteur de logique.
- Tout futur produit (Radar, Dashboard) importe le **même** moteur → une seule vérité.

---

## Ce que la Phase 0 NE fait pas (volontairement)
- Pas de réécriture en React/Next (c'est la **Phase 1**).
- Pas de migration de `market-data.js` vers `@elevate/config` (Phase 1, mécanique).
- Pas de consolidation Supabase ni de RLS (Phase 1).

## Rollback
Tout est additif. En cas de pépin : supprimer `packages/`, les fichiers de config
racine, et `vendor/` — `analyzer.html` redevient autonome.

---

## Enchaînement vers la Phase 1
1. `apps/analyzer` : transformer la page statique en app **Vite + React** qui
   `import { underwrite } from "@elevate/domain"` (fin du pont `vendor/`).
2. Extraire `@elevate/ui` (design system actuel) et `@elevate/config` (market-data).
3. `apps/pocketdeal` : migrer `index.html` dans le monorepo.
4. Consolider un seul projet Supabase + schémas + RLS (voir ARCHITECTURE).
