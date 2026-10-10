// Admin: hybrid weight configuration (daily & weekly) + snapshot regeneration.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { Snapshot, WeightsAllOut } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Kind = "daily" | "weekly";

function WeightSlider({
  kind,
  technical,
  fundamental,
  onChange,
}: {
  kind: Kind;
  technical: number;
  fundamental: number;
  onChange: (technical: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-technical">Analisis Teknikal</span>
          <span className="font-mono text-base font-semibold tabular-nums" data-testid={`weight-technical-value-${kind}`}>
            {technical}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={technical}
          data-testid={`weight-technical-slider-${kind}`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-[color:var(--color-technical)]"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-fundamental">Analisis Fundamental</span>
          <span className="font-mono text-base font-semibold tabular-nums" data-testid={`weight-fundamental-value-${kind}`}>
            {fundamental}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-fundamental to-bearish" style={{ width: `${fundamental}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["weights"],
    queryFn: () => apiGet<WeightsAllOut>("/settings/weights"),
  });

  const [dailyTech, setDailyTech] = useState(70);
  const [weeklyTech, setWeeklyTech] = useState(50);

  useEffect(() => {
    if (data) {
      setDailyTech(data.daily.technical);
      setWeeklyTech(data.weekly.technical);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (body: { kind: Kind; technical: number; fundamental: number }) =>
      apiPut(`/settings/weights/${body.kind}`, { technical: body.technical, fundamental: body.fundamental }),
    onSuccess: (_out, vars) => {
      queryClient.invalidateQueries({ queryKey: ["weights"] });
      toast.success(`Bobot ${vars.kind === "daily" ? "harian" : "mingguan"} disimpan — dipakai pada snapshot berikutnya`);
    },
    onError: () => toast.error("Gagal menyimpan bobot"),
  });

  const refresh = useMutation({
    mutationFn: (kind: Kind) => apiPost<Snapshot>("/analysis/refresh", { kind }),
    onSuccess: (_out, kind) => {
      queryClient.invalidateQueries({ queryKey: ["analysis", kind] });
      toast.success(`Snapshot ${kind} berhasil di-regenerate`);
    },
    onError: () => toast.error("Gagal regenerate — coba beberapa saat lagi"),
  });

  const weightCards: {
    kind: Kind;
    title: string;
    desc: string;
    tech: number;
    dirty: boolean;
    setTech: (v: number) => void;
  }[] = [
    {
      kind: "daily",
      title: "Bobot Harian",
      desc: "Default spesifikasi: 70% teknikal + 30% fundamental. Dipakai saat snapshot harian di-generate (06:00 WITA).",
      tech: dailyTech,
      dirty: !!data && dailyTech !== data.daily.technical,
      setTech: setDailyTech,
    },
    {
      kind: "weekly",
      title: "Bobot Mingguan",
      desc: "Default spesifikasi: 50% teknikal + 50% fundamental (opini mendalam & sentimen makro). Dipakai Senin 06:00 WITA.",
      tech: weeklyTech,
      dirty: !!data && weeklyTech !== data.weekly.technical,
      setTech: setWeeklyTech,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Pengaturan Analisis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Atur bobot Hybrid Analysis per periode dan regenerate snapshot bila diperlukan.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {weightCards.map((card) => (
          <Card key={card.kind} data-testid={`weights-card-${card.kind}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading">
                <SlidersHorizontal className="size-4 text-technical" />
                {card.title}
                {card.dirty && <Badge className="border-fundamental/40 text-fundamental" variant="outline">belum disimpan</Badge>}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{card.desc}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <WeightSlider
                kind={card.kind}
                technical={card.tech}
                fundamental={100 - card.tech}
                onChange={card.setTech}
              />
              <Button
                data-testid={`save-weights-button-${card.kind}`}
                disabled={!card.dirty || save.isPending}
                onClick={() => save.mutate({ kind: card.kind, technical: card.tech, fundamental: 100 - card.tech })}
              >
                {save.isPending ? "Menyimpan…" : "Simpan Bobot"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card data-testid="regenerate-card">
        <CardHeader>
          <CardTitle className="font-heading">Regenerasi Snapshot</CardTitle>
          <p className="text-xs text-muted-foreground">
            Jalankan ulang mesin hybrid untuk periode yang sedang berjalan. Snapshot terkunci akan
            diganti dengan hasil analisis terbaru (memakan waktu ~1 menit).
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            data-testid="regenerate-daily-button"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate("daily")}
          >
            <RefreshCw className={refresh.isPending ? "size-4 animate-spin" : "size-4"} />
            Regenerate Harian
          </Button>
          <Button
            variant="outline"
            data-testid="regenerate-weekly-button"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate("weekly")}
          >
            <RefreshCw className={refresh.isPending ? "size-4 animate-spin" : "size-4"} />
            Regenerate Mingguan
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
