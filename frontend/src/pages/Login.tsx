// Split branded auth: methodology panel left, credential form right.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Lock, ShieldCheck, TrendingUp } from "lucide-react";
import { ApiError, apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { useMe } from "@/hooks/useAuth";
import type { UserOut } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const METHODOLOGY = [
  { pct: "70/30", label: "Hybrid Harian — 70% teknikal (RSI, MACD, MA, S/R, Volume) + 30% fundamental" },
  { pct: "50/50", label: "Hybrid Mingguan — teknikal & fundamental berimbang, sentimen makro 7 hari" },
  { pct: "06:00", label: "Snapshot terkunci setiap 06:00 WITA — Top 10 Koin Bullish, valid 24 jam / 7 hari" },
  { pct: "Real", label: "Evaluasi proyeksi vs Actual High — akurasi model terukur tiap periode" },
];

export default function Login() {
  const { data: me, isLoading } = useMe();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      apiPost<UserOut>("/auth/login", body),
    onSuccess: (user) => {
      beginSession();
      toast.success(`Selamat datang, ${user.email}`);
      navigate("/", { replace: true });
    },
    onError: (err) => {
      const msg = err instanceof ApiError && err.status === 401 ? "Email atau password salah" : "Gagal masuk — coba lagi";
      setError(msg);
    },
  });

  if (!isLoading && me) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#090D16] p-10 text-slate-100 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 10%, rgba(0,242,254,0.25), transparent 60%), radial-gradient(50% 40% at 80% 90%, rgba(16,185,129,0.2), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#00F2FE] text-[#050B14]">
            <TrendingUp className="size-5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="font-heading text-lg font-bold tracking-tight">Indo Crypto Lens</p>
            <p className="text-xs text-slate-400">Platform Analisis Hybrid Kripto Indodax IDR</p>
          </div>
        </div>

        <div className="relative space-y-5">
          <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight">
            Analisis kripto Indodax
            <br />
            <span className="text-[#00F2FE]">dengan Hybrid Analysis.</span>
          </h1>
          <ul className="space-y-3">
            {METHODOLOGY.map((m) => (
              <li key={m.pct} className="flex items-start gap-3">
                <span className="mt-0.5 rounded-md border border-white/15 bg-white/5 px-2 py-1 font-mono text-xs font-semibold text-[#00F2FE]">
                  {m.pct}
                </span>
                <span className="text-sm leading-relaxed text-slate-300">{m.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
          Akses terbatas — hanya akun yang diundang administrator.
        </p>
      </div>

      {/* form panel */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-[#050B14]">
              <TrendingUp className="size-4.5" strokeWidth={2.5} />
            </span>
            <p className="font-heading text-base font-bold">Indo Crypto Lens</p>
          </div>

          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-bold tracking-tight">Masuk</h2>
            <p className="text-sm text-muted-foreground">
              Gunakan kredensial yang diberikan administrator Anda.
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              login.mutate({ email, password });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="login-email-input"
                type="email"
                autoComplete="email"
                placeholder="nama@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                data-testid="login-password-input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p
                data-testid="login-error-message"
                className="rounded-md border border-bearish/30 bg-bearish/10 px-3 py-2 text-sm text-bearish"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              data-testid="login-submit-button"
              disabled={login.isPending}
            >
              {login.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-[#050B14] border-t-transparent" />
                  Memproses…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Lock className="size-4" />
                  Masuk ke Terminal
                </span>
              )}
            </Button>
          </form>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-technical" />
            Sesi berbasis cookie httpOnly — kredensial tidak pernah disimpan di browser.
          </p>
        </div>
      </div>
    </div>
  );
}
