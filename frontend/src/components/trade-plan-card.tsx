// Trade plan card — entry zone, TP1/TP2/TP3 ladder, stop loss and risk/reward,
// rendered as a visual price ladder so a trader can read the levels at a glance.
import { ArrowDownRight, ArrowUpRight, Crosshair, ShieldAlert, Target } from "lucide-react";
import { fmtIDR, fmtPct } from "@/lib/format";
import type { TradeLevels } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function LevelRow({
  label,
  price,
  pct,
  tone,
  icon,
  hint,
  testId,
  emphasis,
}: {
  label: string;
  price: number;
  pct?: number;
  tone: string;
  icon?: React.ReactNode;
  hint?: string;
  testId: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors duration-150",
        emphasis ? "border-current/30 bg-current/5" : "border-border",
        tone
      )}
    >
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
        {icon}
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-sm font-semibold tabular-nums" data-testid={testId}>
          {fmtIDR(price)}
        </span>
        {pct !== undefined && (
          <span className="font-mono text-[11px] tabular-nums opacity-80">{fmtPct(pct)}</span>
        )}
      </span>
      {hint && <span className="sr-only">{hint}</span>}
    </div>
  );
}

export default function TradePlanCard({
  levels,
  kind,
}: {
  levels: TradeLevels | null;
  kind: "daily" | "weekly";
}) {
  if (!levels) {
    return (
      <Card data-testid="trade-plan-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <Crosshair className="size-4 text-primary" />
            Rencana Trading
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Level trading belum tersedia untuk snapshot ini (dibuat sebelum fitur ini aktif). Akan
            muncul pada snapshot berikutnya.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rr = levels.risk_reward;
  const rrTone = rr === null ? "text-muted-foreground" : rr >= 2 ? "text-bullish" : rr >= 1 ? "text-fundamental" : "text-bearish";

  return (
    <Card data-testid="trade-plan-card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 font-heading">
          <span className="flex items-center gap-2">
            <Crosshair className="size-4 text-primary" />
            Rencana Trading ({kind === "daily" ? "Harian" : "Mingguan"})
          </span>
          {rr !== null && (
            <Badge variant="outline" className={cn("font-mono", rrTone)} data-testid="trade-risk-reward">
              R/R 1:{rr.toFixed(2)}
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Level diturunkan dari support/resistance dan proyeksi hybrid. Bukan saran finansial —
          sesuaikan dengan manajemen risiko Anda.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* TP ladder, highest first — reads like a price ladder */}
        <div className="space-y-1.5">
          <LevelRow
            label="TP 3"
            price={levels.tp3}
            pct={levels.tp3_pct}
            tone="text-bullish"
            icon={<ArrowUpRight className="size-3.5" />}
            testId="level-tp3"
          />
          <LevelRow
            label="TP 2 · target proyeksi"
            price={levels.tp2}
            pct={levels.tp2_pct}
            tone="text-bullish"
            icon={<Target className="size-3.5" />}
            testId="level-tp2"
            emphasis
          />
          <LevelRow
            label="TP 1"
            price={levels.tp1}
            pct={levels.tp1_pct}
            tone="text-bullish"
            icon={<ArrowUpRight className="size-3.5" />}
            testId="level-tp1"
          />
          <LevelRow
            label="Entry"
            price={levels.entry}
            tone="text-foreground"
            icon={<Crosshair className="size-3.5" />}
            testId="level-entry"
            emphasis
          />
          <LevelRow
            label="Stop Loss"
            price={levels.stop_loss}
            pct={levels.stop_loss_pct}
            tone="text-bearish"
            icon={<ShieldAlert className="size-3.5" />}
            testId="level-stop-loss"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Zona Entry
            </p>
            <p className="font-mono text-sm tabular-nums" data-testid="level-entry-zone">
              {fmtIDR(levels.entry_low)} – {fmtIDR(levels.entry_high)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Akumulasi di area ini, jangan di atas TP 1
            </p>
          </div>
          <div className="rounded-md border border-border p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Risiko Maksimal
            </p>
            <p className="font-mono text-sm tabular-nums text-bearish">
              {fmtPct(levels.stop_loss_pct)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Batas periode {kind === "daily" ? "harian" : "mingguan"}: {levels.max_risk_pct}%
            </p>
          </div>
        </div>

        <div className="space-y-1 text-[11px] text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <ArrowDownRight className="size-3 text-bullish" />
            Support acuan {fmtIDR(levels.support)} · Resistance {fmtIDR(levels.resistance)}
          </p>
          {levels.key_resistance && (
            <p data-testid="level-key-resistance">
              Resistance kunci {fmtIDR(levels.key_resistance)} berada di dalam tangga TP — perhatikan
              reaksi harga di level ini.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
