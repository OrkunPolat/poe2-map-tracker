import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  // tesseract.js spawns its own worker script from node_modules, so it must stay unbundled.
  external: ["electron", "tesseract.js"],
  sourcemap: true,
  logLevel: "info",
};

await Promise.all([
  build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist/main.cjs" }),
  build({ ...common, entryPoints: ["src/preload/preload.ts"], outfile: "dist/preload.cjs" }),
  build({ ...common, entryPoints: ["src/main/stashWorker.ts"], outfile: "dist/stashWorker.cjs" }),
]);
