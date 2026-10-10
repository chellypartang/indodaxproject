// Auth boundary: /api/auth/me is the single source of truth (httpOnly cookie session).
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { apiGet } from "@/lib/api";
import type { UserOut } from "@/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<UserOut>("/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

function AuthSplash() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Memeriksa sesi…</p>
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useMe();
  if (isLoading) return <AuthSplash />;
  if (isError || !data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useMe();
  if (isLoading) return <AuthSplash />;
  if (isError || !data) return <Navigate to="/login" replace />;
  if (data.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
