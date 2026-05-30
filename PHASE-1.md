# Phase 1 — Apps bundlées + paquets partagés

**Objectif** : transformer l'analyseur statique en **app Vite** qui importe les
paquets (`@elevate/domain`, `@elevate/config`, `@elevate/ui`), supprimer le pont
`vendor/` et les globals, et poser le design system partagé.

> ⚠️ La conversion de l'app **exige Node** pour compiler/itérer (`pnpm dev`).
> Les paquets partagés (Tranche 1) sont mécaniques et faits ; la conversion
> (Tranche 2) est une découpe à faire avec le serveur de dev en marche.

---

## Tranche 1 — Paquets partagés ✅ FAIT

```
packages/
├─ config/   @elevate/config   → MARKET_DATA en module ESM (src/index.js + .d.ts)
└─ ui/       @elevate/ui        → tokens.css (palette, typo, resets partagés)
apps/
└─ analyzer/  package.json + vite.config.js   (coquille prête à recevoir la découpe)
```

Ces paquets sont **additifs** : la page statique `analyzer.html` continue de
fonctionner via `market-data.js` + `vendor/`. Rien n'est cassé.

---

## Tranche 2 — Découper `analyzer.html` en app Vite (à faire avec Node)

Recette mécanique. Le but : **déplacer le code qui marche**, pas le réécrire.

### Prérequis
```powershell
pnpm install
pnpm --filter @elevate/domain build      # le paquet doit avoir son dist/
```

### Étapes
1. **Markup** → `apps/analyzer/index.html`
   Copier le `<body>` de `analyzer.html`. Dans le `<head>`, retirer le `<style>`
   et les **trois** `<script>` (`market-data.js`, `vendor/...`, le `<script>`
   inline). Ajouter avant `</body>` :
   ```html
   <script type="module" src="/src/main.js"></script>
   ```
   Garder les `<link>` Google Fonts.

2. **Styles** → `apps/analyzer/src/styles.css`
   Copier le contenu du `<style>`. En tête, ajouter :
   ```css
   @import "@elevate/ui/tokens.css";
   ```
   puis **supprimer** de ce fichier le bloc `:root {…}`, les resets (`*`,
   `html, body`, `a`, `button`, `input…`) et les utilitaires `.display/.mono/
   .eyebrow` — ils viennent désormais de `@elevate/ui`. Garder tout le reste
   (styles spécifiques à l'analyseur).

3. **Script** → `apps/analyzer/src/main.js`
   Copier le `<script>` inline. En tête, ajouter :
   ```js
   import "./styles.css";
   import { underwrite } from "@elevate/domain";
   import { MARKET_DATA } from "@elevate/config";
   ```
   Puis deux remplacements globaux :
   - `window.MARKET_DATA`            → `MARKET_DATA`
   - `ElevateDomain.underwrite`      → `underwrite`
   Le reste du code (DOM, taux live, normalisation, rendu) **reste identique**.

4. **Lancer & vérifier**
   ```powershell
   pnpm --filter analyzer dev
   ```
   Comparer les métriques à la page actuelle (mêmes chiffres). Le pont a disparu :
   l'app importe le moteur **directement**.

5. **Retirer les ponts** (une fois l'app validée)
   - supprimer `vendor/elevate-domain.global.js`
   - supprimer la racine `market-data.js` et `analyzer.html`
   - repointer la routine `refresh-market-data` vers `packages/config/src/index.js`
     (mettre à jour `REFRESH-MARKET.md` en conséquence)

### Definition of done
App Vite servie, chiffres identiques, **zéro global** (`window.MARKET_DATA`,
`ElevateDomain`) et **zéro pont** `vendor/`. Source unique : les paquets.

---

## Tranche 3 — Suite (plus tard)
- **React-ifier** : extraire les composants récurrents (champs, métriques, tableau)
  dans `@elevate/ui` en composants React ; l'analyseur devient déclaratif.
- **`apps/pocketdeal`** : migrer `index.html` dans le monorepo (consomme `@elevate/ui`).
- **Supabase** : un seul projet, schémas + RLS (voir ARCHITECTURE / schéma `shared`).

## Frontières (rappel)
- Logique métier → `@elevate/domain` uniquement.
- Données de marché → `@elevate/config` uniquement (après bascule).
- Jetons de design → `@elevate/ui` uniquement.
- Les apps n'importent que des paquets ; jamais d'app → app.

## Rollback
Tout est additif. En cas de pépin : supprimer `apps/` et `packages/config`,
`packages/ui` — `analyzer.html` (statique) refonctionne seul.
