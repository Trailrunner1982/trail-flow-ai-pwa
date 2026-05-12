import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/hooks/useImpersonation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Eye, Shield, ShieldOff, UserCog, Search, CalendarIcon, X, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { InviteAthleteDialog } from "@/components/admin/InviteAthleteDialog";

interface AthleteRow {
  id: string;
  full_name: string | null;
  is_suspended: boolean;
  onboarding_completed: boolean;
  created_at: string;
  subscription_end_date: string | null;
  isAdmin: boolean;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const { setImpersonated } = useImpersonation();
  const [rows, setRows] = useState<AthleteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AthleteRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles, error: pErr }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, is_suspended, onboarding_completed, created_at, subscription_end_date").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pErr) { toast.error(pErr.message); setLoading(false); return; }
    const adminSet = new Set((roles || []).filter(r => r.role === "admin").map(r => r.user_id));
    setRows((profiles || []).map(p => ({ ...p, isAdmin: adminSet.has(p.id) })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSuspend = async (row: AthleteRow) => {
    const { error } = await supabase.from("profiles").update({ is_suspended: !row.is_suspended }).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(row.is_suspended ? "Conta reativada" : "Conta suspensa");
    load();
  };

  const toggleAdmin = async (row: AthleteRow) => {
    if (row.isAdmin) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", row.id).eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success("Admin removido");
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: row.id, role: "admin" });
      if (error) return toast.error(error.message);
      toast.success("Promovido a admin");
    }
    load();
  };

  const updateSubscription = async (row: AthleteRow, date: Date | null) => {
    const value = date ? format(date, "yyyy-MM-dd") : null;
    const { error } = await supabase.from("profiles").update({ subscription_end_date: value }).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(value ? `Subscrição até ${format(date!, "dd/MM/yyyy")}` : "Subscrição removida");
    load();
  };

  const mirror = (row: AthleteRow) => {
    setImpersonated({ id: row.id, full_name: row.full_name });
    toast.success(`A ver como ${row.full_name || row.id.slice(0, 8)}`);
    navigate("/dashboard");
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase.rpc("delete_athlete", {
      p_user_id: toDelete.id,
    });
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success(`Atleta ${toDelete.full_name || toDelete.id.slice(0, 8)} apagado`);
    setToDelete(null);
    load();
  };

  const filtered = rows.filter(r =>
    !q || (r.full_name || "").toLowerCase().includes(q.toLowerCase()) || r.id.includes(q)
  );

  const subBadge = (date: string | null) => {
    if (!date) return <span className="text-xs text-muted-foreground">—</span>;
    const days = differenceInCalendarDays(parseISO(date), new Date());
    const formatted = format(parseISO(date), "dd/MM/yyyy");
    if (days < 0) return <Badge variant="destructive">Expirou {formatted}</Badge>;
    if (days <= 7) return <Badge className="bg-destructive/15 text-destructive border-destructive/30">{days}d • {formatted}</Badge>;
    if (days <= 30) return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">{days}d • {formatted}</Badge>;
    return <Badge variant="secondary">{formatted}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão de Atletas</h1>
          <p className="text-muted-foreground text-sm mt-1">Lista, permissões, subscrição e Modo Espelho.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="w-4 h-4" /> Convidar atleta
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Procurar nome ou ID..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <InviteAthleteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={load} />

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Subscrição até</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">A carregar...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem atletas</TableCell></TableRow>
            ) : filtered.map(row => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.full_name || "(sem nome)"}</div>
                  <div className="text-xs text-muted-foreground font-mono">{row.id.slice(0, 8)}</div>
                </TableCell>
                <TableCell>
                  {row.is_suspended ? <Badge variant="destructive">Suspenso</Badge>
                    : row.onboarding_completed ? <Badge variant="secondary">Ativo</Badge>
                    : <Badge variant="outline">Onboarding</Badge>}
                </TableCell>
                <TableCell>
                  {row.isAdmin ? <Badge className="bg-primary/15 text-primary border-primary/30">Admin</Badge> : <span className="text-xs text-muted-foreground">Atleta</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className={cn("h-8 px-2 gap-1", !row.subscription_end_date && "text-muted-foreground")}>
                          <CalendarIcon className="w-3.5 h-3.5" />
                          {row.subscription_end_date ? subBadge(row.subscription_end_date) : <span className="text-xs">Definir</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={row.subscription_end_date ? parseISO(row.subscription_end_date) : undefined}
                          onSelect={(d) => d && updateSubscription(row, d)}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    {row.subscription_end_date && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateSubscription(row, null)} title="Remover data">
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => mirror(row)} title="Modo Espelho">
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleAdmin(row)} title={row.isAdmin ? "Remover admin" : "Promover a admin"}>
                    <UserCog className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleSuspend(row)} title={row.is_suspended ? "Reativar" : "Suspender"}>
                    {row.is_suspended ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4 text-destructive" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setToDelete(row)} title="Apagar atleta">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar atleta?</AlertDialogTitle>
            <AlertDialogDescription>
              Vais apagar <strong>{toDelete?.full_name || toDelete?.id.slice(0, 8)}</strong> e todos os dados associados (treinos, biometria, provas, etc.). Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "A apagar..." : "Apagar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
