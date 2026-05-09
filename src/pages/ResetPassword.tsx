import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Mountain, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("A password tem de ter pelo menos 8 caracteres");
    if (!/[A-Z]/.test(password)) return toast.error("Inclui pelo menos uma letra maiúscula");
    if (!/[a-z]/.test(password)) return toast.error("Inclui pelo menos uma letra minúscula");
    if (!/[0-9]/.test(password)) return toast.error("Inclui pelo menos um número");
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Password atualizada");
    navigate("/dashboard");
  };

  const checks = [
    { ok: password.length >= 8, label: "Pelo menos 8 caracteres" },
    { ok: /[A-Z]/.test(password), label: "Uma letra maiúscula (A-Z)" },
    { ok: /[a-z]/.test(password), label: "Uma letra minúscula (a-z)" },
    { ok: /[0-9]/.test(password), label: "Um número (0-9)" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="flex items-center gap-2 text-primary">
          <Mountain className="w-6 h-6" />
          <span className="text-sm font-semibold tracking-widest uppercase">Trail Forge</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold">Definir nova password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ready ? "Escolhe uma password forte para a tua conta." : "A validar o link de recuperação..."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova password</Label>
            <Input id="password" type="password" autoComplete="new-password" required minLength={8}
              value={password} onChange={(e) => setPassword(e.target.value)} disabled={!ready} />
            <ul className="text-xs space-y-1 mt-2">
              {checks.map((c, i) => (
                <li key={i} className={c.ok ? "text-emerald-500" : "text-muted-foreground"}>
                  {c.ok ? "✓" : "○"} {c.label}
                </li>
              ))}
            </ul>
          </div>
          <Button type="submit" disabled={!ready || submitting || checks.some(c => !c.ok)} className="w-full" variant="hero" size="lg">
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Atualizar password
          </Button>
        </form>
      </Card>
    </div>
  );
}
