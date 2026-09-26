import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

/** Common Windows install locations for the PoE2 log; the most recently written one wins. */
export function detectLogPath(): string | undefined {
  const roots = [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2",
    "C:\\Program Files\\Steam\\steamapps\\common\\Path of Exile 2",
    "C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2",
    "C:\\Program Files\\Grinding Gear Games\\Path of Exile 2",
    ...["C", "D", "E", "F"].flatMap((d) => [
      `${d}:\\SteamLibrary\\steamapps\\common\\Path of Exile 2`,
      `${d}:\\Steam\\steamapps\\common\\Path of Exile 2`,
      `${d}:\\Games\\Path of Exile 2`,
    ]),
  ];
  const candidates = roots
    .flatMap((r) => [join(r, "logs", "Client.txt"), join(r, "logs", "LatestClient.txt")])
    .filter((p) => existsSync(p))
    .map((p) => ({ p, mtime: statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.p;
}

/** Reads the last `bytes` of a file as lines (used to learn the current area on startup). */
export function readTailLines(path: string, bytes = 256 * 1024): string[] {
  const size = statSync(path).size;
  const start = Math.max(0, size - bytes);
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    return buf.toString("utf8").split(/\r?\n/);
  } finally {
    closeSync(fd);
  }
}

/**
 * Polls the log for appended bytes. Polling (not fs.watch) because the game keeps the file
 * open and Windows change notifications for it are unreliable.
 */
export class LogTail {
  private offset = 0;
  private partial = "";
  private timer?: NodeJS.Timeout;

  constructor(
    private path: string,
    private onLine: (line: string) => void,
    private intervalMs = 500,
  ) {}

  start() {
    this.offset = statSync(this.path).size; // only new lines; history is not replayed
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
  }

  private poll() {
    let size: number;
    try {
      size = statSync(this.path).size;
    } catch {
      return;
    }
    if (size < this.offset) {
      // Log was truncated or rotated.
      this.offset = 0;
      this.partial = "";
    }
    if (size === this.offset) return;
    const fd = openSync(this.path, "r");
    try {
      const buf = Buffer.alloc(size - this.offset);
      readSync(fd, buf, 0, buf.length, this.offset);
      this.offset = size;
      const text = this.partial + buf.toString("utf8");
      const lines = text.split(/\r?\n/);
      this.partial = lines.pop() ?? "";
      for (const line of lines) if (line) this.onLine(line);
    } finally {
      closeSync(fd);
    }
  }
}
