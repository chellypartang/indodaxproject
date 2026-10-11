// Evaluasi Kinerja — proyeksi vs Actual High: harian, mingguan, dan rekap bulanan.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/lib/recharts";
import { CalendarClock, CheckCircle2, Download, Scale, Target, TrendingUp } from "lucide-react";
import { apiGet } from "@/lib/api";
import { fmtIDR, fmtPct, fmtWita } from "@/lib/format";
import type { EvalResponse, MonthlyEvalResponse } from "@/types";
import { PrintButton, PrintReportHeader } from "@/components/print-report";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const CHART = {
  hit: "var(--color-bullish, #10B981)",
  dev: "var(--color-fundamental, #FBBF24)",
  proj: "var(--color-technical, #38BDF8)",
  actual: "var(--color-bearish, #F43F5E)",
  grid: "var(--color-border, #1E293B)",
  axis: "var(--color-muted-foreground, #94A3B8)",
};

function StatCard({
  label,
  value,
  tone,
  icon,
  testId,
}: {
  label: string;
  value: string;
  tone?: string;
  icon: React.ReactNode;
  testId?: string;
}) {
  return (
    <Card size="sm" data-testid={testId}>
      <CardContent className="pt-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </p>
        <p className={cn("mt-1 font-mono text-xl font-semibold tabular-nums", tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyEval({ kindLabel }: { kindLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center" data-testid="evaluation-empty-state">
      <CalendarClock className="size-8 text-muted-foreground" />
      <div>
        <p className="font-semibold">Belum ada evaluasi {kindLabel}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Evaluasi tersedia setelah snapshot melewati window-nya (pukul 05:59 WITA) dan Actual High
          terekam. Sistem mengunci hasilnya secara otomatis — tidak ada yang perlu dilakukan manual.
        </p>
      </div>
    </div>
  );
}

function PeriodEvalTab({ kind }: { kind: "daily" | "weekly" }) {
  const { data, isLoading } = useQuery({
    queryKey: ["evaluation", kind],
    queryFn: () => apiGet<EvalResponse>(`/evaluation/${kind}`),
    refetchInterval: 120_000,
  });

  const latest = data?.latest ?? null;
  const history = (data?.history ?? []).slice().reverse(); // chronological for the chart

  if (isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Memuat evaluasi…</div>;

  return (
    <div className="space-y-6">
      {latest ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label="Akurasi Target"
              value={`${latest.hit_rate.toFixed(1)}%`}
              tone={latest.hit_rate >= 50 ? "text-bullish" : "text-bearish"}
              icon={<Target className="size-3" />}
              testId={`eval-hit-rate-${kind}`}
            />
            <StatCard
              label="Rata-rata Deviasi"
              value={fmtPct(latest.avg_deviation)}
              tone={latest.avg_deviation >= 0 ? "text-bullish" : "text-bearish"}
              icon={<Scale className="size-3" />}
              testId={`eval-avg-deviation-${kind}`}
            />
            <StatCard
              label="Koin Positif"
              value={`${latest.positive_rate.toFixed(1)}%`}
              icon={<TrendingUp className="size-3" />}
              testId={`eval-positive-rate-${kind}`}
            />
            <StatCard
              label={`Rata-rata Aktual (${kind === "daily" ? "harian" : "mingguan"})`}
              value={fmtPct(latest.avg_actual)}
              icon={<CheckCircle2 className="size-3" />}
              testId={`eval-avg-actual-${kind}`}
            />
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="font-heading">
                  Proyeksi vs Actual High — {fmtWita(latest.snapshot.period_start, false)}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bobot terpakai: TA {latest.snapshot.weights.technical}% / FA {latest.snapshot.weights.fundamental}% ·
                  dibuat {fmtWita(latest.snapshot.generated_at)}
                  {latest.snapshot.approximated && " · actual diaproksimasi (server tidak aktif saat rollover)"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/evaluation/export/evaluation/${kind}`}
                  download
                  data-testid={`export-eval-csv-${kind}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Download className="size-3.5" />
                  CSV
                </a>
                <PrintButton testId={`print-eval-button-${kind}`} label="PDF" />
              </div>
            </CardHeader>
            <CardContent>
              <Table data-testid={`eval-table-${kind}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Koin</TableHead>
                    <TableHead className="text-right">Proyeksi</TableHead>
                    <TableHead className="text-right">Target (Rp)</TableHead>
                    <TableHead className="text-right">Actual High (Rp)</TableHead>
                    <TableHead className="text-right">Actual %</TableHead>
                    <TableHead className="text-right">Deviasi</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latest.rows.map((row) => (
                    <TableRow key={row.pair} data-testid={`eval-row-${row.pair.replace("_", "-")}`}>
                      <TableCell className="font-medium">{row.pair.replace("_", "/").toUpperCase()}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-technical">
                        {fmtPct(row.projected_pct)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{fmtIDR(row.entry_price * (1 + row.projected_pct / 100))}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{fmtIDR(row.actual_high)}</TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", row.actual_pct >= 0 ? "text-bullish" : "text-bearish")}>
                        {fmtPct(row.actual_pct)}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", row.deviation_pct >= 0 ? "text-bullish" : "text-bearish")}>
                        {fmtPct(row.deviation_pct)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={row.target_hit ? "border-bullish/40 text-bullish" : "border-bearish/40 text-bearish"}>
                          {row.target_hit ? "Target tercapai" : "Meleset"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyEval kindLabel={kind === "daily" ? "harian" : "mingguan"} />
      )}

      {history.filter((h) => h.evaluated).length > 1 && (
        <Card data-testid={`eval-trend-chart-${kind}`}>
          <CardHeader>
            <CardTitle className="font-heading">Tren Akurasi ({history.length} periode terakhir)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="period_start"
                    tickFormatter={(v: string) => fmtWita(v, false)}
                    stroke={CHART.axis}
                    fontSize={11}
                  />
                  <YAxis stroke={CHART.axis} fontSize={11} unit="%" />
                  <Tooltip
                    contentStyle={{ background: "var(--color-card, #121824)", border: `1px solid ${CHART.grid}`, borderRadius: 8 }}
                    labelStyle={{ color: "var(--color-foreground, #F1F5F9)" }}
                    labelFormatter={(label: string) => fmtWita(label, false)}
                  />
                  <Line type="monotone" dataKey="hit_rate" name="Akurasi Target %" stroke={CHART.hit} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="avg_deviation" name="Deviasi rata-rata %" stroke={CHART.dev} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MonthlyTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["evaluation", "monthly"],
    queryFn: () => apiGet<MonthlyEvalResponse>("/evaluation/monthly"),
    refetchInterval: 180_000,
  });

  if (isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Memuat rekap bulanan…</div>;
  const points = data?.points ?? [];
  const overall = data?.overall;

  if (points.length === 0) return <EmptyEval kindLabel="bulanan" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Akurasi Keseluruhan"
          value={`${overall?.hit_rate.toFixed(1) ?? "0"}%`}
          tone={(overall?.hit_rate ?? 0) >= 50 ? "text-bullish" : "text-bearish"}
          icon={<Target className="size-3" />}
          testId="monthly-overall-hit-rate"
        />
        <StatCard
          label="Deviasi Rata-rata"
          value={fmtPct(overall?.avg_deviation ?? 0)}
          icon={<Scale className="size-3" />}
          testId="monthly-overall-deviation"
        />
        <StatCard
          label="Hari Terbaik"
          value={overall?.best_day ? `${overall.best_day.date} · ${overall.best_day.hit_rate.toFixed(0)}%` : "—"}
          tone="text-bullish"
          icon={<TrendingUp className="size-3" />}
          testId="monthly-best-day"
        />
        <StatCard
          label="Hari Terburuk"
          value={overall?.worst_day ? `${overall.worst_day.date} · ${overall.worst_day.hit_rate.toFixed(0)}%` : "—"}
          tone="text-bearish"
          icon={<TrendingUp className="size-3" />}
          testId="monthly-worst-day"
        />
      </div>

      <Card data-testid="monthly-trend-chart">
        <CardHeader>
          <CardTitle className="font-heading">Tren Akurasi Harian — 30 Hari</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke={CHART.axis} fontSize={11} />
                <YAxis stroke={CHART.axis} fontSize={11} unit="%" />
                <Tooltip
                  contentStyle={{ background: "var(--color-card, #121824)", border: `1px solid ${CHART.grid}`, borderRadius: 8 }}
                  labelStyle={{ color: "var(--color-foreground, #F1F5F9)" }}
                />
                <Line type="monotone" dataKey="hit_rate" name="Akurasi Target %" stroke={CHART.hit} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="positive_rate" name="Koin Positif %" stroke={CHART.proj} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke={CHART.axis} fontSize={11} />
                <YAxis stroke={CHART.axis} fontSize={11} unit="%" />
                <Tooltip
                  contentStyle={{ background: "var(--color-card, #121824)", border: `1px solid ${CHART.grid}`, borderRadius: 8 }}
                  labelStyle={{ color: "var(--color-foreground, #F1F5F9)" }}
                />
                <Bar dataKey="avg_deviation" name="Deviasi %" fill={CHART.dev} radius={[3, 3, 0, 0]} />
                <Bar dataKey="avg_actual" name="Actual %" fill={CHART.actual} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="font-heading">Ledger Deviasi Kronologis</CardTitle>
          <a
            href="/api/evaluation/export/evaluation/daily?days=30"
            download
            data-testid="export-eval-csv-monthly"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-3.5" />
            CSV
          </a>
        </CardHeader>
        <CardContent>
          <Table data-testid="monthly-ledger-table">
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-right">Koin</TableHead>
                <TableHead className="text-right">Akurasi Target</TableHead>
                <TableHead className="text-right">Deviasi Rata-rata</TableHead>
                <TableHead className="text-right">Proyeksi</TableHead>
                <TableHead className="text-right">Aktual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points
                .slice()
                .reverse()
                .map((p) => (
                  <TableRow key={p.date}>
                    <TableCell className="font-mono text-sm">{p.date}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{p.coins}</TableCell>
                    <TableCell className={cn("text-right font-mono tabular-nums", p.hit_rate >= 50 ? "text-bullish" : "text-bearish")}>
                      {p.hit_rate.toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtPct(p.avg_deviation)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-technical">{fmtPct(p.avg_projected)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-fundamental">{fmtPct(p.avg_actual)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Evaluation() {
  return (
    <div className="space-y-6">
      <PrintReportHeader
        title="Laporan Evaluasi Kinerja & Akurasi Proyeksi"
        subtitle="Proyeksi estimasi kenaikan vs Actual High aktual — window harian 06:00–05:59 WITA, mingguan Senin ke Senin"
      />
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Evaluasi Kinerja & Akurasi Proyeksi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Perbandingan estimasi kenaikan (proyeksi) dengan Actual High aktual dalam window snapshot —
          harian 06:00–05:59 WITA, mingguan Senin ke Senin.
        </p>
      </div>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily" data-testid="eval-tab-daily">Harian</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="eval-tab-weekly">Mingguan</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="eval-tab-monthly">Bulanan</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-6">
          <PeriodEvalTab kind="daily" />
        </TabsContent>
        <TabsContent value="weekly" className="mt-6">
          <PeriodEvalTab kind="weekly" />
        </TabsContent>
        <TabsContent value="monthly" className="mt-6">
          <MonthlyTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
