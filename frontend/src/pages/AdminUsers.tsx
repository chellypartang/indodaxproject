// Admin: user provisioning cockpit — invite (initial password shown once), reset, delete.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { fmtWita } from "@/lib/format";
import type { PasswordResetOut, UserCreatedOut, UserOut } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function PasswordReveal({ title, password, testId }: { title: string; password: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="flex items-center gap-2">
        <code data-testid={testId} className="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
          {password}
        </code>
        <Button
          variant="outline"
          size="icon-sm"
          data-testid={`${testId}-copy-button`}
          onClick={async () => {
            await navigator.clipboard.writeText(password);
            setCopied(true);
            toast.success("Password disalin ke clipboard");
          }}
        >
          {copied ? <ShieldCheck className="size-4 text-bullish" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Tampilkan sekali ini saja — bagikan lewat kanal aman.</p>
    </div>
  );
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("user");
  const [created, setCreated] = useState<UserCreatedOut | null>(null);
  const [reset, setReset] = useState<PasswordResetOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserOut | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<UserOut[]>("/users"),
  });

  const invite = useMutation({
    mutationFn: () => apiPost<UserCreatedOut>("/users", { email, name, role }),
    onSuccess: (out) => {
      setInviteOpen(false);
      setCreated(out);
      setEmail("");
      setName("");
      setRole("user");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError && err.status === 409 ? "Email sudah terdaftar" : "Gagal mengundang pengguna");
    },
  });

  const doReset = useMutation({
    mutationFn: (id: string) => apiPatch<PasswordResetOut>(`/users/${id}/password`),
    onSuccess: (out) => {
      setReset(out);
      toast.success("Password direset");
    },
    onError: () => toast.error("Gagal reset password"),
  });

  const doDelete = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/users/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Pengguna dihapus");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? String((err.body as { detail?: string })?.detail ?? "Gagal menghapus") : "Gagal menghapus");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Manajemen Pengguna</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Undang anggota tim yang diizinkan mengakses terminal, atau cabut aksesnya.
          </p>
        </div>
        <Button data-testid="invite-user-button" onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" />
          Undang Pengguna
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Akun Terdaftar</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="users-table">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead>Login Terakhir</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => (
                <TableRow key={u.id} data-testid={`user-row-${u.email}`}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell>{u.name || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={u.role === "admin" ? "border-technical/40 text-technical" : "text-muted-foreground"}
                    >
                      {u.role === "admin" ? "Admin" : "User"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtWita(u.created_at, false)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtWita(u.last_login_at)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="xs"
                        data-testid={`reset-password-button-${u.email}`}
                        onClick={() => doReset.mutate(u.id)}
                      >
                        Reset Password
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-xs"
                        data-testid={`delete-user-button-${u.email}`}
                        className="text-bearish hover:bg-bearish/10"
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Memuat…
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent data-testid="invite-user-dialog">
          <DialogHeader>
            <DialogTitle>Undang Pengguna</DialogTitle>
            <DialogDescription>
              Buat akun untuk anggota tim. Password awal dibuat otomatis dan ditampilkan sekali.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                data-testid="invite-email-input"
                type="email"
                placeholder="nama@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-name">Nama (opsional)</Label>
              <Input
                id="invite-name"
                data-testid="invite-name-input"
                placeholder="Nama lengkap"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Peran</Label>
              <Select value={role} onValueChange={(v: string) => setRole(v)}>
                <SelectTrigger data-testid="invite-role-select" className="w-full">
                  <SelectValue>{role === "admin" ? "Admin" : "User"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User — akses dashboard</SelectItem>
                  <SelectItem value="admin">Admin — akses penuh</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Batal</Button>
            <Button
              data-testid="invite-submit-button"
              disabled={!email || invite.isPending}
              onClick={() => invite.mutate()}
            >
              {invite.isPending ? "Membuat…" : "Buat Akun"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* initial password reveal */}
      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent data-testid="created-user-dialog">
          <DialogHeader>
            <DialogTitle>Akun dibuat</DialogTitle>
            <DialogDescription>
              {created?.user.email} sekarang dapat masuk dengan password awal berikut.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {created && <PasswordReveal title="Password Awal" password={created.initial_password} testId="initial-password-display" />}
          </div>
          <DialogFooter>
            <Button data-testid="created-user-done-button" onClick={() => setCreated(null)}>Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* reset password reveal */}
      <Dialog open={!!reset} onOpenChange={(o) => !o && setReset(null)}>
        <DialogContent data-testid="reset-password-dialog">
          <DialogHeader>
            <DialogTitle>Password direset</DialogTitle>
            <DialogDescription>{reset?.user.email}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {reset && <PasswordReveal title="Password Baru" password={reset.new_password} testId="new-password-display" />}
          </div>
          <DialogFooter>
            <Button onClick={() => setReset(null)}>Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent data-testid="delete-user-dialog">
          <DialogHeader>
            <DialogTitle>Hapus pengguna?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.email} akan langsung kehilangan akses ke terminal. Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button
              variant="destructive"
              data-testid="confirm-delete-user-button"
              disabled={doDelete.isPending}
              onClick={() => deleteTarget && doDelete.mutate(deleteTarget.id)}
            >
              {doDelete.isPending ? "Menghapus…" : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
