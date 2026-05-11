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

const DEFAULT_PASSWORD = "TrailForge2026!";

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
      // 1. Criar utilizador com password default
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: DEFAULT_PASSWORD,
        options: {
          data: { full_name: fullName.trim() || null },
        },
      });

      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("Erro ao criar utilizador");

      const userId = signUpData.user.id;

      // 2. Atualizar perfil com nome e data de subscrição
      if (fullName.trim() || endDate) {
        await supabase.from("profiles").upsert({
          id: userId,
          full_name: fullName.trim() || null,
          subscription_end_date: endDate ? format(endDate, "yyyy-MM-dd") : null,
          must_change_password: true,
        });
      }

      toast.success(`Atleta criado! Email: ${email} · Password: ${DEFAULT_PASSWORD}`);
      reset();
      onOpenChange(false);
      onInvited();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar atleta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar atleta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email *</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="atleta@exemplo.pt" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-name">Nome (opcional)</Label>
            <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João Silva" />
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
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs space-y-1">
            <p className="font-medium">Como funciona:</p>
            <p>1. O atleta é criado com a password <code className="bg-muted px-1 rounded">TrailForge2026!</code></p>
            <p>2. Na primeira entrada é obrigado a mudar a password</p>
            <p>3. Envia-lhe o email e a password manualmente</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Criar atleta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
