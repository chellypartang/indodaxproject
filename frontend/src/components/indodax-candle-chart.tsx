// Indodax-native candlestick chart — the chart used when a coin has no global listing.
// Candles come from Indodax trades (true OHLC), backfilled from our own ticker samples.
// Recharts has no candlestick series, so a range Bar is drawn with a custom shape.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/lib/recharts";
import { CandlestickChart, Info } from "lucide-react";
import { apiGet } from "@/lib/api";
import { fmtIDR } from "@/lib/format";
import type { Candle, CandleSeries } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const WITA_TZ = "Asia/Makassar";

type Row = Candle & { range: [number, number]; label: string };

function witaLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { timeZone: WITA_TZ, hour: "2-digit", minute: "2-digit" });
}

// Recharts passes the resolved pixel box for the [low, high] range bar; the body is
// positioned by linearly mapping open/close prices into that same box.
interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Row;
}

function CandleShape(props: ShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;
  const { o, c, h, l } = payload;
  const up = c >= o;
  const color = up ? "var(--color-bullish)" : "var(--color-bearish)";
  const span = h - l;

  const priceToY = (p: number) => (span <= 0 ? y + height / 2 : y + ((h - p) / span) * height);

  const bodyTop = priceToY(Math.max(o, c));
  const bodyBottom = priceToY(Math.min(o, c));
  const bodyHeight = Math.max(1, bodyBottom - bodyTop); // doji still gets a 1px line
  const cx = x + width / 2;
  const bodyWidth = Math.max(1, Math.min(width * 0.7, 14));

  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect
        x={cx - bodyWidth / 2}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        fill={up ? color : "var(--color-card)"}
        stroke={color}
        strokeWidth={1.2}
        rx={1}
      />
    </g>
  );
}

function CandleTooltip({ active, payload }: { active?: boolean; payload?: { payload?: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const up = row.c >= row.o;
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-xs shadow-lg">
      <p className="font-mono font-semibold">{row.label} WITA</p>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
        <span className="text-muted-foreground">Open</span>
        <span className="text-right">{fmtIDR(row.o)}</span>
        <span className="text-muted-foreground">High</span>
        <span className="text-right text-bullish">{fmtIDR(row.h)}</span>
        <span className="text-muted-foreground">Low</span>
        <span className="text-right text-bearish">{fmtIDR(row.l)}</span>
        <span className="text-muted-foreground">Close</span>
        <span className={up ? "text-right text-bullish" : "text-right text-bearish"}>{fmtIDR(row.c)}</span>
      </div>
      {!row.from_trades && (
        <p className="mt-1.5 border-t border-border pt-1.5 text-[10px] italic text-muted-foreground">
          direkonstruksi dari sampel harga
        </p>
      )}
    </div>
  );
}

export default function IndodaxCandleChart({ pair, name }: { pair: string; name: string }) {
  const [bucket, setBucket] = useState("15");

  const { data, isLoading } = useQuery({
    queryKey: ["coin-candles", pair, bucket],
    queryFn: () => apiGet<CandleSeries>(`/analysis/coin/${pair}/candles?bucket=${bucket}&hours=24`),
    refetchInterval: 180_000,
  });

  const rows: Row[] = (data?.candles ?? []).map((c) => ({
    ...c,
    range: [c.l, c.h],
    label: witaLabel(c.ts),
  }));

  const lows = rows.map((r) => r.l);
  const highs = rows.map((r) => r.h);
  const pad = rows.length ? (Math.max(...highs) - Math.min(...lows)) * 0.08 || Math.min(...lows) * 0.02 : 0;

  return (
    <Card data-testid="indodax-candle-card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 font-heading">
          <span className="flex items-center gap-2">
            <CandlestickChart className="size-4 text-technical" />
            Candlestick Indodax — {name}/IDR
          </span>
          <Tabs value={bucket} onValueChange={setBucket}>
            <TabsList>
              <TabsTrigger value="15" data-testid="candle-bucket-15">15m</TabsTrigger>
              <TabsTrigger value="60" data-testid="candle-bucket-60">1j</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardTitle>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          {data?.note ?? "Membentuk candle dari transaksi Indodax…"}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Memuat candle Indodax…</p>
        ) : rows.length < 2 ? (
          <p className="py-16 text-center text-sm text-muted-foreground" data-testid="indodax-candle-empty">
            Belum cukup transaksi di Indodax untuk membentuk candle pada rentang ini. Coba interval 1
            jam, atau tunggu server merekam lebih banyak sampel harga.
          </p>
        ) : (
          <div className="h-[380px]" data-testid="indodax-candle-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  minTickGap={28}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={92}
                  domain={[
                    () => Math.max(0, Math.min(...lows) - pad),
                    () => Math.max(...highs) + pad,
                  ]}
                  tickFormatter={(v: number) => fmtIDR(v)}
                />
                <Tooltip content={<CandleTooltip />} />
                <Bar dataKey="range" shape={<CandleShape />} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="border-bullish/40 text-bullish">Naik</Badge>
          <Badge variant="outline" className="border-bearish/40 text-bearish">Turun</Badge>
          <span>Sumbu waktu WITA · harga IDR langsung dari API publik Indodax.</span>
        </div>
      </CardContent>
    </Card>
  );
}
