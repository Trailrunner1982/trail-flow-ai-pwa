import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2, Copy, Check } from "lucide-react";
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
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setEmail(""); setFullName(""); setEndDate(undefined);
    setCreated(false); setCopied(false);
  };

  const copyCredentials = () => {
    const text = `Email: ${email}\nPassword: ${DEFAULT_PASSWORD}\nApp: https://trailforgeai.pt`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submit = async () => {
    if (!email.trim()) return toast.error("Email obrigatório");
    setLoading(true);
    try {
      const { error } = await supabase.rpc("create_athlete", {
        p_email: email.trim(),
        p_full_name: fullName.trim() || null,
        p_subscription_end_date: endDate ? format(endDate, "yyyy-MM-dd") : null,
      });
      if (error) throw error;
      setCreated(true);
      toast.success("Atleta criado com sucesso!");
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
          {!created ? (
            <>
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
              <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs space-y-1">
                <p className="font-medium">Como funciona:</p>
                <p>1. O atleta é criado com a password <code className="bg-muted px-1 rounded">TrailForge2026!</code></p>
                <p>2. Na primeira entrada é obrigado a mudar a password</p>
                <p>3. Envia-lhe as credenciais manualmente</p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 space-y-2">
                <p className="text-sm font-medium text-emerald-400">✓ Atleta criado com sucesso!</p>
                <p className="text-xs text-muted-foreground">Partilha estas credenciais com o atleta:</p>
                <div className="bg-muted rounded p-3 text-xs font-mono space-y-1">
                  <p>Email: {email}</p>
                  <p>Password: {DEFAULT_PASSWORD}</p>
                  <p>App: trailforgeai.pt</p>
                </div>
              </div>
              <Button variant="outline" className="w-full gap-2" onClick={copyCredentials}>
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copiado!" : "Copiar credenciais"}
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          {!created ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
              <Button onClick={submit} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar atleta
              </Button>
            </>
          ) : (
            <Button onClick={() => { reset(); onOpenChange(false); }}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
