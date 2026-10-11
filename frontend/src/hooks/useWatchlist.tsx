// Watchlist state + the star toggle used on the dashboard table and the coin page.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/api";
import type { WatchlistEntry } from "@/types";
import { cn } from "@/lib/utils";

export function useWatchlist() {
  return useQuery({
    queryKey: ["watchlist"],
    queryFn: () => apiGet<WatchlistEntry[]>("/watchlist"),
    staleTime: 30_000,
  });
}

export function useToggleWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pair, starred }: { pair: string; starred: boolean; name?: string }) => {
      if (starred) return apiDelete<{ ok: boolean }>(`/watchlist/${pair}`);
      return apiPost<WatchlistEntry>("/watchlist", { pair });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      const label = vars.name ?? vars.pair.split("_")[0].toUpperCase();
      toast.success(vars.starred ? `${label} dihapus dari watchlist` : `${label} ditambahkan ke watchlist`);
    },
    onError: (err) => {
      const detail = err instanceof ApiError ? (err.body as { detail?: string })?.detail : null;
      toast.error(detail ?? "Gagal memperbarui watchlist");
    },
  });
}

export function StarToggle({
  pair,
  name,
  starred,
  size = "sm",
}: {
  pair: string;
  name?: string;
  starred: boolean;
  size?: "sm" | "md";
}) {
  const toggle = useToggleWatchlist();
  const px = size === "md" ? "size-5" : "size-4";
  return (
    <button
      type="button"
      data-testid={`watchlist-star-${pair.replace("_", "-")}`}
      aria-label={starred ? `Hapus ${name ?? pair} dari watchlist` : `Tambah ${name ?? pair} ke watchlist`}
      aria-pressed={starred}
      disabled={toggle.isPending}
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ pair, starred, name });
      }}
      className={cn(
        "rounded-md p-1 transition-colors duration-150 hover:bg-accent disabled:opacity-50 print:hidden",
        starred ? "text-fundamental" : "text-muted-foreground hover:text-fundamental"
      )}
    >
      <Star className={cn(px, starred && "fill-current")} />
    </button>
  );
}
