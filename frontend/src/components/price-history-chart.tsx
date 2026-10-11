// Indodax-native price trend from our own 15-min scheduler samples (not an external feed).
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/lib/recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { apiGet } from "@/lib/api";
import { fmtIDR } from "@/lib/format";
import type { PricePoint } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const WITA_TZ = "Asia/Makassar";

function witaClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: WITA_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PriceHistoryChart({ pair, hours }: { pair: string; hours: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["coin-history", pair, hours],
    queryFn: () => apiGet<PricePoint[]>(`/analysis/coin/${pair}/history?hours=${hours}`),
    refetchInterval: 300_000,
  });

  const points = (data ?? []).map((p) => ({ ...p, label: witaClock(p.ts) }));
  const first = points[0]?.price;
  const last = points[points.length - 1]?.price;
  const changePct = first && last ? ((last - first) / first) * 100 : null;
  const up = (changePct ?? 0) >= 0;

  return (
    <Card data-testid="price-history-card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 font-heading">
          <span className="flex items-center gap-2">
            <LineChartIcon className="size-4 text-technical" />
            Harga Indodax ({hours} jam terakhir)
          </span>
          {changePct !== null && (
            <Badge
              variant="outline"
              className={up ? "border-bullish/40 text-bullish" : "border-bearish/40 text-bearish"}
              data-testid="price-history-change"
            >
              {up ? "+" : ""}
              {changePct.toFixed(2)}% dalam window
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sampel harga IDR langsung dari API Indodax, direkam server tiap 15 menit.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Memuat riwayat harga…</p>
        ) : points.length < 2 ? (
          <p className="py-12 text-center text-sm text-muted-foreground" data-testid="price-history-empty">
            Riwayat harga Indodax sedang terkumpul — server merekam sampel tiap 15 menit, grafik
            muncul setelah beberapa sampel tersedia.
          </p>
        ) : (
          <div className="h-56" data-testid="price-history-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 6, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={up ? "var(--color-bullish)" : "var(--color-bearish)"} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={up ? "var(--color-bullish)" : "var(--color-bearish)"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} minTickGap={28} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={78}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => fmtIDR(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "var(--color-foreground)" }}
                  formatter={(value: number) => [fmtIDR(value), "Harga"]}
                  labelFormatter={(label: string) => `${label} WITA`}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={up ? "var(--color-bullish)" : "var(--color-bearish)"}
                  strokeWidth={2}
                  fill="url(#priceFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
