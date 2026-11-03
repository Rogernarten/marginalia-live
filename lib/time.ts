/** "just now", "12 seconds ago", "4 minutes ago", "2 hours ago", "3 days ago". */
export function ago(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** "1:42:05 PM", in the reader's own time zone. */
export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/**
 * An edit summary as plain text: "[[Regency era|the Regency]]" → "the Regency",
 * "/* Early life *\/ fix" → "Early life: fix". Never rendered as HTML.
 */
export function readableSummary(comment: string) {
  return comment
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\/\*\s*(.*?)\s*\*\/\s*/g, (_, section: string) => `${section}: `)
    .replace(/:\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function bytes(delta: number) {
  if (delta === 0) return "no size change";
  const n = Math.abs(delta).toLocaleString();
  return delta > 0 ? `+${n} bytes` : `−${n} bytes`;
}
