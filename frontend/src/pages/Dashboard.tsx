// Dashboard — locked Top 10 Koin Bullish snapshots (daily/weekly), sync status + countdown.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Activity, Clock, Download, Gauge, RefreshCw, TrendingUp } from "lucide-react";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { fmtIDR, fmtPct, fmtWita, fmtWitaRange, relativeTime, compactIDR } from "@/lib/format";
import { useMe } from "@/hooks/useAuth";
import { ScoreBar, scoreTone, TrendBadge } from "@/components/bits";
import { StarToggle, useWatchlist } from "@/hooks/useWatchlist";
import WatchlistPanel from "@/components/watchlist-panel";
import { PrintButton, PrintReportHeader } from "@/components/print-report";
import { Countdown } from "@/components/app-shell";
import type { CurrentAnalysis, MetaStatusOut, Snapshot, SnapshotItem } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Kind = "daily" | "weekly";

function SnapshotTable({ snapshot }: { snapshot: Snapshot }) {
  const navigate = useNavigate();
  const { data: watchlist } = useWatchlist();
  const starred = new Set((watchlist ?? []).map((w) => w.pair));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8 print:hidden"></TableHead>
          <TableHead className="w-12">Rank</TableHead>
          <TableHead>Koin</TableHead>
          <TableHead className="text-right">Harga (Rp)</TableHead>
          <TableHead className="text-right">Skor Hybrid</TableHead>
          <TableHead className="text-right">Skor TA</TableHead>
          <TableHead className="text-right">Skor FA</TableHead>
          <TableHead className="text-right">Volume 24j</TableHead>
          <TableHead className="text-center">Tren</TableHead>
          <TableHead className="text-right">Estimasi Kenaikan</TableHead>
          <TableHead className="text-right">Entry / TP 1·2·3</TableHead>
          <TableHead className="text-right">Stop Loss</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {snapshot.items.map((item) => (
          <TableRow
            key={item.pair}
            data-testid={`coin-row-${item.pair.replace("_", "-")}`}
            className="cursor-pointer transition-colors duration-150 hover:bg-accent/60"
            onClick={() => navigate(`/coin/${item.pair}`)}
          >
            <TableCell className="print:hidden">
              <StarToggle pair={item.pair} name={item.name} starred={starred.has(item.pair)} />
            </TableCell>
            <TableCell className="font-mono font-semibold">#{item.rank}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2.5">
                {item.logo ? (
                  <img src={item.logo} alt={item.name} className="size-6 rounded-full" loading="lazy" />
                ) : (
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                    {item.name.slice(0, 2)}
                  </span>
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{item.name}/IDR</span>
                  <span className="text-xs text-muted-foreground">{item.pair}</span>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums">{fmtIDR(item.entry_price)}</TableCell>
            <TableCell className="text-right">
              <div className="flex flex-col items-end gap-1">
                <span className={cn("font-mono text-sm font-semibold tabular-nums", scoreTone(item.score))}>
                  {item.score.toFixed(1)}
                </span>
                <ScoreBar value={item.score} className="w-20" />
              </div>
            </TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums text-technical">
              {item.technical_score.toFixed(1)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums text-fundamental">
              {item.fundamental_score.toFixed(1)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex flex-col items-end">
                <span className="font-mono text-xs tabular-nums">{compactIDR(item.vol_idr)}</span>
                {item.projection?.volume_ratio != null && (
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      item.projection.volume_factor > 1
                        ? "text-bullish"
                        : item.projection.volume_factor < 1
                          ? "text-bearish"
                          : "text-muted-foreground"
                    )}
                  >
                    {item.projection.volume_ratio.toFixed(2)}× · ×{item.projection.volume_factor.toFixed(2)}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex flex-col items-center gap-0.5">
                <TrendBadge trend={item.technical.trend} />
                {item.projection && (
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      item.projection.trend_factor > 1
                        ? "text-bullish"
                        : item.projection.trend_factor < 1
                          ? "text-bearish"
                          : "text-muted-foreground"
                    )}
                  >
                    ×{item.projection.trend_factor.toFixed(2)}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-bullish">
              {fmtPct(item.est_gain_pct)}
            </TableCell>
            <TableCell className="text-right">
              {item.levels ? (
                <div className="flex flex-col items-end leading-tight">
                  <span className="font-mono text-xs tabular-nums" data-testid={`row-entry-${item.pair.replace("_", "-")}`}>
                    {fmtIDR(item.levels.entry)}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-bullish" data-testid={`row-tps-${item.pair.replace("_", "-")}`}>
                    {fmtIDR(item.levels.tp1)} · {fmtIDR(item.levels.tp2)} · {fmtIDR(item.levels.tp3)}
                  </span>
                </div>
              ) : (
                <span className="font-mono text-sm tabular-nums">{fmtIDR(item.target_price)}</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              {item.levels ? (
                <div className="flex flex-col items-end leading-tight">
                  <span className="font-mono text-xs tabular-nums text-bearish" data-testid={`row-sl-${item.pair.replace("_", "-")}`}>
                    {fmtIDR(item.levels.stop_loss)}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {fmtPct(item.levels.stop_loss_pct)}
                    {item.levels.risk_reward !== null && ` · R/R 1:${item.levels.risk_reward.toFixed(1)}`}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SnapshotHeader({ kind, snapshot, generating }: { kind: Kind; snapshot: Snapshot | null; generating: boolean }) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const refresh = useMutation({
    mutationFn: () => apiPost<Snapshot>("/analysis/refresh", { kind }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis", kind] });
      toast.success(`Snapshot ${kind === "daily" ? "harian" : "mingguan"} berhasil di-regenerate`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? "Gagal regenerate" : "Gagal regenerate"),
  });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-col">
        <span data-testid={`snapshot-period-${kind}`} className="font-mono text-sm text-muted-foreground">
          {snapshot ? fmtWitaRange(snapshot.period_start, snapshot.period_end) : "menunggu pembuatan…"}
        </span>
        <span className="text-xs text-muted-foreground">
          {snapshot
            ? `Snapshot terkunci · dibuat ${fmtWita(snapshot.generated_at)} · bobot TA ${snapshot.weights.technical}% / FA ${snapshot.weights.fundamental}%`
            : "Snapshot untuk periode ini sedang dibuat otomatis oleh mesin analisis."}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {generating && (
          <Badge variant="outline" className="animate-pulse border border-fundamental/40 text-fundamental">
            <Clock className="size-3" /> generating…
          </Badge>
        )}
        {snapshot && (
          <Badge className="border border-technical/40 bg-technical/10 text-technical" variant="outline">
            <Activity className="size-3" /> Snapshot Terkunci
          </Badge>
        )}
        <a
          href={`/api/evaluation/export/analysis/${kind}`}
          download
          data-testid={`export-csv-button-${kind}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="size-3.5" />
          CSV
        </a>
        <PrintButton testId={`print-snapshot-button-${kind}`} label="PDF" />
        {me?.role === "admin" && (
          <Button
            variant="outline"
            size="sm"
            data-testid={`refresh-snapshot-button-${kind}`}
            disabled={refresh.isPending}
            onClick={() => (confirming ? refresh.mutate() : setConfirming(true))}
          >
            <RefreshCw className={cn("size-3.5", refresh.isPending && "animate-spin")} />
            {confirming ? "Klik lagi untuk konfirmasi" : "Regenerate"}
          </Button>
        )}
      </div>
    </div>
  );
}

function GeneratingRows({ kind }: { kind: Kind }) {
  return (
    <div className="space-y-3 p-4" data-testid={`snapshot-generating-${kind}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
      <p className="pt-2 text-center text-sm text-muted-foreground">
        Mesin hybrid sedang menganalisis market Indodax — snapshot akan terkunci otomatis.
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [kind, setKind] = useState<Kind>("daily");

  const { data: status } = useQuery({
    queryKey: ["meta-status"],
    queryFn: () => apiGet<MetaStatusOut>("/meta/status"),
    refetchInterval: 30_000,
  });

  const { data: analysis, isLoading } = useQuery({
    queryKey: ["analysis", kind],
    queryFn: () => apiGet<CurrentAnalysis>(`/analysis/current?kind=${kind}`),
    refetchInterval: 120_000,
  });

  const snapshot = analysis?.snapshot ?? null;

  const stats = [
    { label: "Pair IDR Aktif", value: status?.sync?.universe_count ?? "—", testId: "stat-universe-count" },
    { label: "Kandidat Dianalisis", value: status?.sync?.candidates_last_run ?? "—", testId: "stat-candidates" },
    {
      label: "Status API Indodax",
      value: status?.sync?.last_ticker_ok === false ? "Gangguan" : "Tersinkron",
      tone: status?.sync?.last_ticker_ok === false ? "text-bearish" : "text-bullish",
      testId: "stat-api-status",
    },
    { label: "Generasi Terakhir", value: status?.sync ? relativeTime(status.sync.last_generation_at) : "—", testId: "stat-last-generation" },
  ];

  return (
    <div className="space-y-6">
      <PrintReportHeader
        title={`Laporan Top 10 Koin Bullish — ${kind === "daily" ? "Harian" : "Mingguan"}`}
        subtitle={snapshot ? fmtWitaRange(snapshot.period_start, snapshot.period_end) : undefined}
        meta={
          snapshot
            ? `Snapshot terkunci dibuat ${fmtWita(snapshot.generated_at)} · bobot TA ${snapshot.weights.technical}% / FA ${snapshot.weights.fundamental}%`
            : undefined
        }
      />

      {/* stat strip */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} size="sm" data-testid={s.testId} className="print:hidden">
            <CardContent className="pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className={cn("mt-1 font-mono text-lg font-semibold tabular-nums", s.tone)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* starred coins, pinned above the Top 10 */}
      <WatchlistPanel />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* snapshot panel */}
        <Card className="lg:col-span-8 print:col-span-12 print:border-0 print:shadow-none">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 font-heading">
                  <TrendingUp className="size-4.5 text-bullish" />
                  Top 10 Koin Bullish
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Urutan berdasarkan estimasi persentase kenaikan tertinggi → terendah.
                </p>
              </div>
              <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <TabsList>
                  <TabsTrigger value="daily" data-testid="tab-daily">Harian</TabsTrigger>
                  <TabsTrigger value="weekly" data-testid="tab-weekly">Mingguan</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="mt-3">
              <SnapshotHeader kind={kind} snapshot={snapshot} generating={!!analysis?.generating} />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <GeneratingRows kind={kind} />
            ) : snapshot && snapshot.items.length > 0 ? (
              <SnapshotTable snapshot={snapshot} />
            ) : (
              <GeneratingRows kind={kind} />
            )}
          </CardContent>
        </Card>

        {/* side rail */}
        <div className="space-y-4 lg:col-span-4 print:hidden">
          <Card size="sm" data-testid="countdown-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-base">
                <Clock className="size-4 text-technical" />
                Hitung Mundur Sinkronisasi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Snapshot harian berikutnya</span>
                <Countdown targetIso={status?.next_daily_run ?? null} label="06:00 WITA" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Snapshot mingguan berikutnya</span>
                <Countdown targetIso={status?.next_weekly_run ?? null} label="Senin 06:00" />
              </div>
              <p className="text-xs text-muted-foreground">
                Data dikunci saat di-generate — membuka/menutup web tidak mengubah snapshot.
              </p>
            </CardContent>
          </Card>

          <Card size="sm" data-testid="methodology-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-base">
                <Gauge className="size-4 text-fundamental" />
                Metodologi Hybrid
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Harian — Teknikal</span>
                  <span className="font-mono">{snapshot?.weights.technical ?? 70}%</span>
                </div>
                <ScoreBar value={snapshot?.weights.technical ?? 70} />
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Mingguan — Teknikal</span>
                  <span className="font-mono">{kind === "daily" ? "50" : snapshot?.weights.technical ?? 50}%</span>
                </div>
                <ScoreBar value={kind === "daily" ? 50 : snapshot?.weights.technical ?? 50} />
              </div>
              <p className="text-xs text-muted-foreground">
                Teknikal: RSI-14, MACD (12/26/9), SMA 20/50, Support/Resistance, tren volume.
                Fundamental: sentimen berita CoinDesk, Cointelegraph & Decrypt. Bobot diatur admin.
              </p>
            </CardContent>
          </Card>

          <Card size="sm" data-testid="sync-detail-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-base">
                <Activity className="size-4 text-bullish" />
                Status Sinkronisasi API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sinkron terakhir</span>
                <span className="font-mono text-xs">{relativeTime(status?.sync?.last_ticker_sync_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Snapshot dibuat</span>
                <span className="font-mono text-xs">{relativeTime(status?.sync?.last_generation_at)}</span>
              </div>
              {status?.sync?.last_generation_error && (
                <p className="rounded-md border border-bearish/30 bg-bearish/10 p-2 text-xs text-bearish">
                  {status.sync.last_generation_error}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
