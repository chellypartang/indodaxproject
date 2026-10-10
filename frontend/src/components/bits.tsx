// Small presentational building blocks shared across pages.
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function scoreTone(score: number): string {
  if (score >= 70) return "text-bullish";
  if (score >= 55) return "text-technical";
  if (score >= 40) return "text-fundamental";
  return "text-bearish";
}

export function ScoreBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-technical to-bullish transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TrendBadge({ trend }: { trend: string }) {
  const variant = trend === "bullish" ? "default" : trend === "bearish" ? "destructive" : "secondary";
  const tone =
    trend === "bullish" ? "bg-bullish/15 text-bullish border-bullish/30" : trend === "bearish" ? "" : "text-muted-foreground";
  return (
    <Badge variant={variant} className={cn("border font-semibold uppercase tracking-wider", tone)}>
      {trend}
    </Badge>
  );
}

export function SentimentChip({ sentiment }: { sentiment: number }) {
  if (sentiment > 0.1)
    return (
      <Badge className="border border-bullish/30 bg-bullish/15 text-bullish" variant="outline">
        +Bullish
      </Badge>
    );
  if (sentiment < -0.1)
    return (
      <Badge className="border border-bearish/30 bg-bearish/15 text-bearish" variant="outline">
        -Bearish
      </Badge>
    );
  return (
    <Badge className="border border-muted-foreground/30 text-muted-foreground" variant="outline">
      ~Netral
    </Badge>
  );
}

export function VolumeTrendBadge({ trend }: { trend: string }) {
  const map: Record<string, string> = {
    naik: "border border-bullish/30 bg-bullish/15 text-bullish",
    turun: "border border-bearish/30 bg-bearish/15 text-bearish",
    stabil: "border border-muted-foreground/30 text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={cn("uppercase tracking-wider", map[trend] ?? map.stabil)}>
      Vol {trend}
    </Badge>
  );
}

export function SectionTitle({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <h3 data-testid={testId} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}
