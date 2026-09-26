import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};

await Promise.all([
  build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist/main.cjs" }),
  build({ ...common, entryPoints: ["src/preload/preload.ts"], outfile: "dist/preload.cjs" }),
]);
