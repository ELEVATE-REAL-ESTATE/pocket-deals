import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // esm + cjs for the apps/services; iife so the current analyzer.html can load it
  // via <script src> and read it as window.ElevateDomain (bridge old → new).
  format: ["esm", "cjs", "iife"],
  globalName: "ElevateDomain",
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
});
