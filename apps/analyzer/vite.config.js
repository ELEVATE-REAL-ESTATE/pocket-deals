import { defineConfig } from "vite";

// App statique simple : pas de framework, Vite bundle main.js + ses imports
// (@elevate/domain, @elevate/config) et le CSS. `pnpm --filter analyzer dev`.
export default defineConfig({
  // Chemins relatifs → fonctionne quel que soit le préfixe Pages
  // (github.io/pocket-deals/analyzer/ comme un domaine racine).
  base: "./",
  server: { port: 5174, open: true },
  build: {
    // Sortie committée servie par GitHub Pages : <racine repo>/analyzer/
    outDir: "../../analyzer",
    emptyOutDir: true,
    sourcemap: false,
  },
});
