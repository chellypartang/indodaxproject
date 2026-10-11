// Formatting helpers — IDR currency, percents, WITA dates (design: DD/MM/YYYY HH:mm WITA).

const WITA_TZ = "Asia/Makassar";

export function fmtIDR(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n) || n === 0) return "—";
  const digits = Math.abs(n) < 100 ? 2 : 0;
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: digits });
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

/** Compact IDR for dense table cells: Rp 12,4 M (miliar) / Rp 950 jt / Rp 12 rb. */
export function compactIDR(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `Rp ${(n / 1e12).toLocaleString("id-ID", { maximumFractionDigits: 1 })} T`;
  if (abs >= 1e9) return `Rp ${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (abs >= 1e6) return `Rp ${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 0 })} jt`;
  if (abs >= 1e3) return `Rp ${(n / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return `Rp ${n.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

export function fmtWita(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("id-ID", {
    timeZone: WITA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  if (!withTime) return date;
  const time = d.toLocaleTimeString("id-ID", {
    timeZone: WITA_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time} WITA`;
}

export function fmtWitaRange(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso || !endIso) return "—";
  const s = new Date(startIso);
  const e = new Date(endIso);
  const fmt = (d: Date) =>
    d.toLocaleDateString("id-ID", { timeZone: WITA_TZ, day: "2-digit", month: "short" });
  const t = (d: Date) =>
    d.toLocaleTimeString("id-ID", { timeZone: WITA_TZ, hour: "2-digit", minute: "2-digit" });
  return `${fmt(s)} ${t(s)} WITA → ${fmt(e)} ${t(e)} WITA`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}
