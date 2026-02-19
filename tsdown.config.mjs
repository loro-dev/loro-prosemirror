import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  target: "es2020",
  platform: "browser",
  sourcemap: true,
  clean: true,
});
