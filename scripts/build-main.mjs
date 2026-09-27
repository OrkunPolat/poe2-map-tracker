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

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

// Price check OCR on macOS: a small Swift tool around Apple Vision, built for both CPU types.
if (process.platform === "darwin") {
  mkdirSync("dist/bin", { recursive: true });
  const out = (arch) => `dist/bin/poe2-ocr-${arch}`;
  for (const arch of ["arm64", "x86_64"]) {
    execFileSync("swiftc", ["-O", "-target", `${arch}-apple-macos12`, "native/poe2-ocr.swift", "-o", out(arch)], { stdio: "inherit" });
  }
  execFileSync("lipo", ["-create", out("arm64"), out("x86_64"), "-output", "dist/bin/poe2-ocr"]);
  execFileSync("rm", [out("arm64"), out("x86_64")]);
}

await Promise.all([
  build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist/main.cjs" }),
  build({ ...common, entryPoints: ["src/preload/preload.ts"], outfile: "dist/preload.cjs" }),
  build({ ...common, entryPoints: ["src/main/stashWorker.ts"], outfile: "dist/stashWorker.cjs" }),
]);
