// Terminal shell: glass header with brand, primary nav, Indodax sync pill, WITA countdown,
// theme toggle and the account menu. All routes render inside <Outlet/>.
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  Users,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { endSession } from "@/lib/session";
import { useMe } from "@/hooks/useAuth";
import { fmtWita, relativeTime } from "@/lib/format";
import type { MetaStatusOut } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function Countdown({ targetIso, label }: { targetIso: string | null; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!targetIso) return <span className="font-mono text-sm">--:--:--</span>;
  const diff = Math.max(0, new Date(targetIso).getTime() - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const pad = (v: number) => String(v).padStart(2, "0");
  const urgent = diff < 10 * 60_000 && diff > 0;
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span
        data-testid="countdown-next-update"
        className={cn(
          "font-mono text-sm font-medium tabular-nums tracking-tight",
          urgent && "animate-pulse text-fundamental"
        )}
      >
        {pad(h)}:{pad(m)}:{pad(s)}
      </span>
    </div>
  );
}

export default function AppShell() {
  const { data: me } = useMe();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const { data: status } = useQuery({
    queryKey: ["meta-status"],
    queryFn: () => apiGet<MetaStatusOut>("/meta/status"),
    refetchInterval: 30_000,
  });

  const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/evaluasi", label: "Evaluasi", icon: BarChart3, end: false },
    ...(me?.role === "admin"
      ? [
          { to: "/admin/pengguna", label: "Pengguna", icon: Users, end: false },
          { to: "/admin/pengaturan", label: "Bobot Analisis", icon: SlidersHorizontal, end: false },
        ]
      : []),
  ];

  const syncOk = status?.sync?.last_ticker_ok !== false;

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 lg:px-6">
          <button
            data-testid="brand-home-link"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-left"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-[#050B14]">
              <TrendingUp className="size-4.5" strokeWidth={2.5} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-heading text-sm font-bold tracking-tight">Indo Crypto Lens</span>
              <span className="hidden text-[10px] text-muted-foreground sm:block">
                Analisis Hybrid Kripto Indodax IDR
              </span>
            </span>
          </button>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div
              data-testid="sync-status-pill"
              className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 sm:flex"
            >
              <span className="relative flex size-2">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                    syncOk ? "bg-bullish" : "bg-bearish"
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex size-2 rounded-full",
                    syncOk ? "bg-bullish" : "bg-bearish"
                  )}
                />
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Indodax {syncOk ? "tersinkron" : "gangguan"} ·{" "}
                {status?.sync ? relativeTime(status.sync.last_ticker_sync_at) : "—"}
              </span>
            </div>

            <div className="hidden items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-1 lg:flex">
              <Activity className="size-3.5 text-technical" />
              <Countdown targetIso={status?.next_daily_run ?? null} label="Next 06:00 WITA" />
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="theme-toggle-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Ganti tema"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" data-testid="user-menu-button" className="max-w-44">
                    <span className="truncate">{me?.email ?? "—"}</span>
                    {me?.role === "admin" && <ShieldCheck className="size-3.5 shrink-0 text-technical" />}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="truncate text-sm">{me?.email}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {me?.role === "admin" ? "Administrator" : "Anggota tim"}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="logout-menu-item" onClick={() => void endSession()}>
                  <LogOut className="size-4" />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* mobile nav */}
        <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-2 md:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )
              }
            >
              <item.icon className="size-3.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-border py-4 print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-4 text-[11px] text-muted-foreground sm:flex-row lg:px-6">
          <span>
            Indo Crypto Lens — snapshot terkunci di-generate otomatis setiap 06:00 WITA (mingguan tiap Senin).
          </span>
          <Badge variant="outline" className="font-mono text-[10px]">
            70/30 harian · 50/50 mingguan
          </Badge>
        </div>
      </footer>
    </div>
  );
}

export { Countdown };
