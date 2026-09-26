import { app, net, shell } from "electron";
import { spawn } from "node:child_process";
import { createWriteStream, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { UpdateInfo } from "../shared/ipc";
import { isNewerVersion } from "../shared/version";

const REPO = "OrkunPolat/poe2-map-tracker";
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

/** electron-builder's portable launcher tells the app where the .exe the user started lives. */
const portableExe = () => process.env.PORTABLE_EXECUTABLE_FILE;

interface GhRelease {
  tag_name: string;
  html_url: string;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
}

export async function checkForUpdate(userAgent: string): Promise<UpdateInfo | undefined> {
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { "User-Agent": userAgent, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
  const rel = (await res.json()) as GhRelease;
  const version = rel.tag_name.replace(/^v/, "");
  if (!isNewerVersion(version, app.getVersion())) return undefined;

  const portable = !!portableExe();
  const asset = rel.assets.find((a) => (portable ? /portable\.exe$/i.test(a.name) : /setup.*\.exe$/i.test(a.name)));
  // Only ever download from this repo's release assets.
  const usable = asset && asset.browser_download_url.startsWith(DOWNLOAD_PREFIX) && process.platform === "win32";
  return {
    version,
    pageUrl: rel.html_url,
    assetUrl: usable ? asset.browser_download_url : undefined,
    assetName: usable ? asset.name : undefined,
    size: usable ? asset.size : undefined,
    mode: !usable ? "manual" : portable ? "portable" : "installer",
  };
}

async function download(url: string, file: string, userAgent: string, onProgress: (p: number) => void) {
  const res = await net.fetch(url, { headers: { "User-Agent": userAgent } });
  if (!res.ok || !res.body) throw new Error(`İndirme başarısız (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const out = createWriteStream(file);
  const reader = res.body.getReader();
  let got = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.byteLength;
      if (!out.write(value)) await new Promise((r) => out.once("drain", r));
      if (total) onProgress(got / total);
    }
  } finally {
    await new Promise<void>((r) => out.end(r));
  }
  if (total && got !== total) throw new Error("İndirme yarım kaldı");
}

/**
 * Downloads the new build and hands over to it:
 * - portable: a small batch file waits until this .exe is unlocked, swaps it, and restarts it;
 * - installer: runs the NSIS setup silently, which relaunches the app (--force-run).
 */
export async function installUpdate(info: UpdateInfo, userAgent: string, onProgress: (p: number) => void) {
  if (info.mode === "manual" || !info.assetUrl) {
    await shell.openExternal(info.pageUrl || RELEASES_URL);
    return;
  }
  if (info.mode === "portable") {
    const target = portableExe()!;
    const next = `${target}.new`;
    await download(info.assetUrl, next, userAgent, onProgress);
    const bat = join(tmpdir(), `poe2-tracker-update-${Date.now()}.cmd`);
    writeFileSync(
      bat,
      [
        "@echo off",
        `set "TARGET=${target}"`,
        `set "NEW=${next}"`,
        "for /l %%i in (1,1,60) do (",
        '  move /y "%NEW%" "%TARGET%" >nul 2>&1 && goto done',
        "  timeout /t 1 /nobreak >nul",
        ")",
        "exit /b 1",
        ":done",
        `start "" /d "${dirname(target)}" "%TARGET%"`,
        'del "%~f0"',
      ].join("\r\n"),
    );
    spawn("cmd.exe", ["/c", bat], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else {
    const setup = join(tmpdir(), basename(new URL(info.assetUrl).pathname));
    await download(info.assetUrl, setup, userAgent, onProgress);
    spawn(setup, ["/S", "--force-run"], { detached: true, stdio: "ignore" }).unref();
  }
  app.quit();
}
