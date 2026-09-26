/** 7-day price change badge: green up, red down, muted when flat. */
export function Trend({ change }: { change?: number }) {
  if (change == null) return null;
  const cls = change >= 3 ? "up" : change <= -3 ? "down" : "flat";
  const arrow = change >= 3 ? "▲" : change <= -3 ? "▼" : "•";
  return (
    <span className={`trend ${cls}`} title="Son 7 günde fiyat değişimi (poe.ninja)">
      {arrow} {Math.abs(change) >= 10 ? Math.round(change) : change.toFixed(1)}%
    </span>
  );
}
