// Coin detail — TradingView chart, technical indicator matrix, fundamental news stream,
// and the hybrid contribution split. Data is a fresh per-coin analysis (cached 2 min server-side).
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  ExternalLink,
  Gauge,
  Newspaper,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { fmtIDR, fmtPct, fmtWita, relativeTime } from "@/lib/format";
import { SentimentChip, ScoreBar, TrendBadge, VolumeTrendBadge, scoreTone } from "@/components/bits";
import PriceHistoryChart from "@/components/price-history-chart";
import IndodaxCandleChart from "@/components/indodax-candle-chart";
import { StarToggle, useWatchlist } from "@/hooks/useWatchlist";
import { PrintButton, PrintReportHeader } from "@/components/print-report";
import type { SnapshotItem } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// TradingView symbol is derived from the exchange our candles actually came from, so a
// small-cap Indodax coin never renders the widget's "symbol not available" error screen.
function tvSymbol(coin: string, source: string): string | null {
  const c = coin.toUpperCase();
  if (source === "okx") return `OKX:${c}USDT`;
  if (source === "coinbase") return `COINBASE:${c}USD`;
  return null; // indodax_trades / indodax_ticker — not listed on a global venue we can chart
}

function TradingViewChart({ coin, symbol }: { coin: string; symbol: string }) {
  const { theme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget h-full w-full";
    host.appendChild(widget);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "60",
      timezone: "Asia/Makassar",
      theme: theme === "light" ? "light" : "dark",
      style: "candles",
      locale: "id",
      hide_side_toolbar: false,
      allow_symbol_change: false,
      support_host: "https://www.tradingview.com",
    });
    host.appendChild(script);
  }, [symbol, theme]);

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-lg border border-border">
      <div ref={ref} className="tradingview-widget-container h-full w-full" data-testid="tradingview-widget" />
      <a
        href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur"
      >
        Buka di TradingView <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

function NoGlobalChart({ coin }: { coin: string }) {
  return (
    <div
      data-testid="tradingview-unavailable"
      className="flex flex-col gap-2 rounded-lg border border-dashed border-border px-4 py-3"
    >
      <p className="text-sm font-semibold">
        {coin.toUpperCase()} belum terdaftar di bursa global — memakai candlestick Indodax
      </p>
      <p className="text-xs text-muted-foreground">
        Koin ini hanya diperdagangkan di Indodax, jadi chart TradingView tidak tersedia. Grafik di
        bawah dibentuk langsung dari transaksi dan sampel harga API Indodax.
      </p>
      <a
        href={`https://www.tradingview.com/search/?query=${encodeURIComponent(coin)}`}
        target="_blank"
        rel="noreferrer"
        className="flex w-fit items-center gap-1 text-xs text-technical hover:underline"
      >
        Cari manual di TradingView <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
  testId,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: string;
  testId?: string;
}) {
  return (
    <Card size="sm" data-testid={testId}>
      <CardContent className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-mono text-base font-semibold tabular-nums", tone)}>{value}</p>
        {detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

function RsiGauge({ rsi }: { rsi: number | null }) {
  if (rsi === null) return <p className="font-mono text-sm text-muted-foreground">—</p>;
  const zone = rsi >= 70 ? "Overbought" : rsi <= 30 ? "Oversold" : rsi >= 45 ? "Sehat" : "Lemah";
  const tone = rsi >= 70 ? "bg-bearish" : rsi <= 30 ? "bg-fundamental" : "bg-bullish";
  return (
    <div className="space-y-1.5" data-testid="rsi-gauge">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xl font-semibold tabular-nums">{rsi.toFixed(1)}</span>
        <span className="text-xs text-muted-foreground">{zone}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${rsi}%` }} />
        <div className="absolute inset-y-0 left-[30%] w-px bg-border" />
        <div className="absolute inset-y-0 left-[70%] w-px bg-border" />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>30</span>
        <span>70</span>
        <span>100</span>
      </div>
    </div>
  );
}

export default function CoinDetail() {
  const { pair = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const kind = (params.get("kind") === "weekly" ? "weekly" : "daily") as "daily" | "weekly";

  const { data: coin, isLoading, isError, error } = useQuery({
    queryKey: ["coin", pair, kind],
    queryFn: () => apiGet<SnapshotItem>(`/analysis/coin/${pair}?kind=${kind}`),
    refetchInterval: 120_000,
  });

  const tech = coin?.technical;
  const fund = coin?.fundamental;
  const { data: watchlist } = useWatchlist();
  const isStarred = (watchlist ?? []).some((w) => w.pair === pair);
  // Which chart the coin gets: a global candlestick when the venue our candles came from
  // can be charted, otherwise the Indodax-native candlestick below.
  const globalSymbol = coin ? tvSymbol(coin.coin, coin.technical?.source ?? "") : null;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24" data-testid="coin-not-found">
        <p className="text-lg font-semibold">Pair tidak ditemukan di market Indodax</p>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error && error.message}
        </p>
        <Button variant="outline" onClick={() => history.back()}>
          <ArrowLeft className="size-4" /> Kembali
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center gap-4">
        <Link
          to="/"
          data-testid="back-to-dashboard-link"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
        <div className="flex items-center gap-3">
          {coin?.logo && <img src={coin.logo} alt={coin.name} className="size-10 rounded-full" />}
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight" data-testid="coin-detail-title">
              {coin ? `${coin.name}/IDR` : "…"}
            </h1>
            <p className="font-mono text-xs text-muted-foreground">{pair} · Indodax</p>
          </div>
          <StarToggle pair={pair} name={coin?.name} starred={isStarred} size="md" />
        </div>
        <div className="ml-auto flex items-center gap-4">
          <PrintButton testId="print-coin-report-button" label="PDF" />
          <Tabs value={kind} onValueChange={(v) => setParams({ kind: v })}>
            <TabsList>
              <TabsTrigger value="daily" data-testid="coin-kind-tab-daily">Harian</TabsTrigger>
              <TabsTrigger value="weekly" data-testid="coin-kind-tab-weekly">Mingguan</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <PrintReportHeader
        title={coin ? `Analisis Hybrid — ${coin.name}/IDR` : "Analisis Hybrid"}
        subtitle={`Periode ${kind === "daily" ? "harian (06:00–05:59 WITA)" : "mingguan (Senin ke Senin)"}`}
        meta={
          coin
            ? `Skor hybrid ${coin.score.toFixed(1)} · TA ${coin.technical_score.toFixed(1)} · FA ${coin.fundamental_score.toFixed(1)} · estimasi ${fmtPct(coin.est_gain_pct)}`
            : undefined
        }
      />

      {isLoading || !coin ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      ) : (
        <>
          {/* key numbers */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <Card size="sm">
              <CardContent className="pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Harga Terkini</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums" data-testid="coin-price">
                  {fmtIDR(coin.entry_price)}
                </p>
                <p className="text-[11px] text-muted-foreground">{tech?.timeframe_note}</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Skor Hybrid</p>
                <p className={cn("mt-1 font-mono text-lg font-semibold tabular-nums", scoreTone(coin.score))} data-testid="coin-hybrid-score">
                  {coin.score.toFixed(1)} / 100
                </p>
                <ScoreBar value={coin.score} className="mt-1" />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Estimasi Kenaikan</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-bullish" data-testid="coin-est-gain">
                  {fmtPct(coin.est_gain_pct)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {coin.snapshot_rank ? `Peringkat #${coin.snapshot_rank} di snapshot aktif` : "Di luar Top 10 snapshot aktif"}
                </p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Target Level</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums" data-testid="coin-target-price">
                  {fmtIDR(coin.target_price)}
                </p>
                <p className="text-[11px] text-muted-foreground">berbasis resistance</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tren</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <TrendBadge trend={tech?.trend ?? "netral"} />
                  <VolumeTrendBadge trend={tech?.volume_trend ?? "stabil"} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Perubahan {fmtPct(tech?.change_pct ?? 0)} dalam window analisis
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* left: chart + technical matrix */}
            <div className="space-y-6 lg:col-span-8">
              {globalSymbol ? (
                <Card className="print:hidden">
                  <CardHeader>
                    <CardTitle className="font-heading">Chart Interaktif</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TradingViewChart coin={coin.coin} symbol={globalSymbol} />
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  <NoGlobalChart coin={coin.coin} />
                  <IndodaxCandleChart pair={coin.pair} name={coin.name} />
                </div>
              )}

              {/* IDR line chart complements the USD-quoted global candles; redundant when the
                  Indodax candlestick above is already the primary chart. */}
              {globalSymbol && <PriceHistoryChart pair={coin.pair} hours={kind === "daily" ? 24 : 168} />}

              <Card data-testid="technical-matrix">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-heading">
                    <Gauge className="size-4 text-technical" />
                    Matriks Indikator Teknikal — Skor {tech?.score.toFixed(1) ?? "—"}/100
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Card size="sm">
                    <CardContent className="pt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">RSI (14)</p>
                      <div className="mt-2">
                        <RsiGauge rsi={tech?.rsi ?? null} />
                      </div>
                    </CardContent>
                  </Card>
                  <Card size="sm" data-testid="macd-card">
                    <CardContent className="pt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">MACD (12/26/9)</p>
                      <div className="mt-2 flex items-center gap-2">
                        {(tech?.macd_hist ?? 0) > 0 ? (
                          <TrendingUp className="size-5 text-bullish" />
                        ) : (
                          <TrendingDown className="size-5 text-bearish" />
                        )}
                        <span
                          className={cn(
                            "font-mono text-sm font-semibold",
                            (tech?.macd_hist ?? 0) > 0 ? "text-bullish" : "text-bearish"
                          )}
                          data-testid="macd-hist-value"
                        >
                          {(tech?.macd_hist ?? 0) > 0 ? "Histogram positif" : "Histogram negatif"}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        MACD {fmtIDR(tech?.macd)} · Signal {fmtIDR(tech?.macd_signal)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardContent className="pt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Moving Averages</p>
                      <div className="mt-2 space-y-1 font-mono text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">SMA 20</span>
                          <span className={cn("tabular-nums", (tech?.sma20 ?? 0) > coin.entry_price ? "text-bullish" : "text-bearish")}>
                            {fmtIDR(tech?.sma20)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">SMA 50</span>
                          <span className={cn("tabular-nums", (tech?.sma50 ?? 0) > coin.entry_price ? "text-bullish" : "text-bearish")}>
                            {fmtIDR(tech?.sma50)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Harga</span>
                          <span className="tabular-nums font-semibold">{fmtIDR(coin.entry_price)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card size="sm" data-testid="sr-card">
                    <CardContent className="pt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Support / Resistance</p>
                      <div className="mt-2 space-y-1 font-mono text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Resistance</span>
                          <span className="tabular-nums text-bearish">{fmtIDR(tech?.resistance)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Support</span>
                          <span className="tabular-nums text-bullish">{fmtIDR(tech?.support)}</span>
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Posisi harga dalam range: {tech?.range_position !== null && tech?.range_position !== undefined ? `${Math.round(tech.range_position * 100)}%` : "—"}
                      </p>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </div>

            {/* right: fundamental stream + hybrid split */}
            <div className="space-y-6 lg:col-span-4">
              <Card data-testid="fundamental-panel">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between font-heading">
                    <span className="flex items-center gap-2">
                      <Newspaper className="size-4 text-fundamental" />
                      Opini & Sentimen Berita
                    </span>
                    <SentimentChip sentiment={fund?.polarity ?? 0} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Skor Fundamental
                      </span>
                      <span className="font-mono text-lg font-semibold tabular-nums text-fundamental" data-testid="fundamental-score">
                        {fund?.score.toFixed(1) ?? "—"}
                      </span>
                    </div>
                    <ScoreBar value={fund?.score ?? 50} className="mt-1" />
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground" data-testid="fundamental-summary">
                    {fund?.summary}
                  </p>
                  <div className="space-y-2" data-testid="fundamental-headline-list">
                    {(fund?.headlines ?? []).map((h, i) => (
                      <a
                        key={`${h.url}-${i}`}
                        href={h.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg border border-border bg-card p-3 transition-colors duration-150 hover:border-technical/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium leading-relaxed">{h.title}</p>
                          <SentimentChip sentiment={h.sentiment} />
                        </div>
                        <p className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="rounded border border-border px-1 py-0.5 font-semibold uppercase">{h.source}</span>
                          {relativeTime(h.published_at)}
                          {!h.matched && <span className="italic">· konteks pasar</span>}
                        </p>
                      </a>
                    ))}
                    {(fund?.headlines ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">Tidak ada headline yang cocok.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card size="sm" data-testid="hybrid-split-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-heading text-base">
                    <Target className="size-4 text-bullish" />
                    Kontribusi Hybrid ({kind === "daily" ? "Harian" : "Mingguan"})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Teknikal — skor {coin.technical_score.toFixed(1)}</span>
                    </div>
                    <ScoreBar value={coin.technical_score} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Fundamental — skor {coin.fundamental_score.toFixed(1)}</span>
                    </div>
                    <ScoreBar value={coin.fundamental_score} />
                  </div>
                  <div className="rounded-md border border-border bg-card p-2.5 text-xs text-muted-foreground" data-testid="hybrid-formula">
                    Skor hybrid = {coin.score.toFixed(1)} ={" "}
                    <span className="text-technical">TA {coin.technical_score.toFixed(0)}</span> × w
                    + <span className="text-fundamental">FA {coin.fundamental_score.toFixed(0)}</span> × (1−w),
                    sesuai bobot admin.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
