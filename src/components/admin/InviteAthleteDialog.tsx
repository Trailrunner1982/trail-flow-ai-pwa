import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}

export function InviteAthleteDialog({ open, onOpenChange, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const reset = () => { setEmail(""); setFullName(""); setEndDate(undefined); };

  const submit = async () => {
    if (!email.trim()) return toast.error("Email obrigatório");
    setLoading(true);
    try {
      // Guardar sessão do admin antes
      const { data: { session: adminSession } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke("invite-athlete", {
        body: {
          email: email.trim(),
          full_name: fullName.trim() || null,
          subscription_end_date: endDate ? format(endDate, "yyyy-MM-dd") : null,
          redirect_to: `${window.location.origin}/reset-password`,
        },
      });

      // Restaurar sessão do admin imediatamente
      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });
      }

      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Falha ao convidar");
      }

      toast.success(`Convite enviado para ${email}!`);
      reset();
      onOpenChange(false);
      onInvited();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao convidar atleta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar atleta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email *</Label>
            <Input id="invite-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="atleta@exemplo.pt" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-name">Nome (opcional)</Label>
            <Input id="invite-name" value={fullName}
              onChange={(e) => setFullName(e.target.value)} placeholder="João Silva" />
          </div>
          <div className="space-y-2">
            <Label>Subscrição até (opcional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start gap-2", !endDate && "text-muted-foreground")}>
                  <CalendarIcon className="w-4 h-4" />
                  {endDate ? format(endDate, "dd/MM/yyyy") : "Sem data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate}
                  initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-xs text-muted-foreground">
            O atleta recebe um email de convite com link para definir a password e entrar na app.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enviar convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
