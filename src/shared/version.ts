/** "0.10.0" > "0.9.3"; tags may carry a leading "v". */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.replace(/^v/, "").split(".").map(Number);
  const b = current.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}
