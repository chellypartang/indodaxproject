// Watchlist panel — starred coins pinned above the Top 10 snapshot table.
import { useNavigate } from "react-router-dom";
import { Star, TrendingDown, TrendingUp } from "lucide-react";
import { fmtIDR, fmtPct } from "@/lib/format";
import { StarToggle, useWatchlist } from "@/hooks/useWatchlist";
import { scoreTone } from "@/components/bits";
import type { WatchlistEntry } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function dayRangePct(e: WatchlistEntry): number | null {
  if (!e.last_price || !e.low_24h || !e.high_24h || e.high_24h === e.low_24h) return null;
  // where the price sits inside its own 24h range, as a % — 100% = at the high
  return ((e.last_price - e.low_24h) / (e.high_24h - e.low_24h)) * 100;
}

export default function WatchlistPanel() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useWatchlist();
  const entries = data ?? [];

  // Static-preview rule: render the shell unconditionally, only the data region degrades.
  if (isLoading || isError) return null;

  if (entries.length === 0) {
    return (
      <Card size="sm" data-testid="watchlist-empty-card" className="border-dashed print:hidden">
        <CardContent className="flex flex-wrap items-center gap-3 pt-4">
          <Star className="size-4 shrink-0 text-fundamental" />
          <p className="text-sm text-muted-foreground">
            Belum ada koin favorit. Klik ikon bintang di tabel Top 10 untuk menyematkan koin di sini —
            pantauan Anda tetap tampil walau koinnya keluar dari Top 10.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="watchlist-panel" className="print:hidden">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 font-heading">
          <span className="flex items-center gap-2">
            <Star className="size-4 fill-current text-fundamental" />
            Watchlist Saya
          </span>
          <Badge variant="outline" className="font-mono text-[10px]" data-testid="watchlist-count">
            {entries.length} koin disematkan
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Harga IDR live dari Indodax; peringkat diambil dari snapshot harian terkunci.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="watchlist-grid">
          {entries.map((e) => {
            const pos = dayRangePct(e);
            const up = (pos ?? 50) >= 50;
            const open = () => navigate(`/coin/${e.pair}`);
            return (
              // A div, not a button: the star toggle is a nested interactive control and
              // <button> inside <button> is invalid HTML (React logs a hydration error).
              <div
                key={e.pair}
                role="button"
                tabIndex={0}
                data-testid={`watchlist-card-${e.pair.replace("_", "-")}`}
                onClick={open}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    open();
                  }
                }}
                className="group cursor-pointer rounded-lg border border-border bg-card p-3 text-left transition-colors duration-150 hover:border-fundamental/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div className="flex items-start gap-2.5">
                  {e.logo ? (
                    <img src={e.logo} alt={e.name} className="size-7 rounded-full" loading="lazy" />
                  ) : (
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                      {e.name.slice(0, 2)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{e.name}/IDR</span>
                      {e.in_snapshot && e.snapshot_rank && (
                        <Badge
                          variant="outline"
                          className="border-bullish/40 px-1 py-0 font-mono text-[10px] text-bullish"
                        >
                          #{e.snapshot_rank}
                        </Badge>
                      )}
                    </div>
                    <p className="font-mono text-sm tabular-nums">{fmtIDR(e.last_price)}</p>
                  </div>
                  <StarToggle pair={e.pair} name={e.name} starred />
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
                  {e.in_snapshot ? (
                    <>
                      <span className={cn("font-mono tabular-nums", scoreTone(e.score ?? 0))}>
                        Skor {e.score?.toFixed(1)}
                      </span>
                      <span className="font-mono tabular-nums text-bullish">
                        {fmtPct(e.est_gain_pct)} est.
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Di luar Top 10 hari ini</span>
                  )}
                </div>

                {pos !== null && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {up ? (
                          <TrendingUp className="size-3 text-bullish" />
                        ) : (
                          <TrendingDown className="size-3 text-bearish" />
                        )}
                        Posisi di range 24 jam
                      </span>
                      <span className="font-mono tabular-nums">{pos.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", up ? "bg-bullish" : "bg-bearish")}
                        style={{ width: `${Math.max(2, Math.min(100, pos))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
