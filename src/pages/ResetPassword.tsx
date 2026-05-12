import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Mountain, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isForced = searchParams.get("force") === "true";
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

  const checks = [
    { ok: password.length >= 8, label: "Pelo menos 8 caracteres" },
    { ok: /[A-Z]/.test(password), label: "Uma letra maiúscula (A-Z)" },
    { ok: /[a-z]/.test(password), label: "Uma letra minúscula (a-z)" },
    { ok: /[0-9]/.test(password), label: "Um número (0-9)" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checks.some(c => !c.ok)) return toast.error("A password não cumpre os requisitos");
    setSubmitting(true);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setSubmitting(false);
      return toast.error(error.message);
    }

    // Limpar must_change_password e verificar onboarding
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles")
        .update({ must_change_password: false })
        .eq("id", user.id);

      // Verificar se o onboarding está completo
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      setSubmitting(false);
      toast.success("Password atualizada com sucesso!");

      if (!profile?.onboarding_completed) {
        navigate("/onboarding");
      } else {
        navigate("/dashboard");
      }
      return;
    }

    setSubmitting(false);
    toast.success("Password atualizada com sucesso!");
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="flex items-center gap-2 text-primary">
          <Mountain className="w-6 h-6" />
          <span className="text-sm font-semibold tracking-widest uppercase">Trail Forge</span>
        </div>

        {isForced && (
          <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 p-4 flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-orange-400">Mudança de password obrigatória</p>
              <p className="text-xs text-muted-foreground mt-1">
                Por segurança, tens de definir uma password pessoal antes de aceder à app.
              </p>
            </div>
          </div>
        )}

        <div>
          <h1 className="text-2xl font-bold">
            {isForced ? "Define a tua password" : "Definir nova password"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isForced
              ? "Escolhe uma password segura para a tua conta Trail Forge."
              : ready ? "Escolhe uma password forte para a tua conta." : "A validar o link de recuperação..."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!ready && !isForced}
              placeholder="Mínimo 8 caracteres"
            />
            <ul className="text-xs space-y-1 mt-2">
              {checks.map((c, i) => (
                <li key={i} className={c.ok && password ? "text-emerald-500" : "text-muted-foreground"}>
                  {c.ok && password ? "✓" : "○"} {c.label}
                </li>
              ))}
            </ul>
          </div>
          <Button
            type="submit"
            disabled={(!ready && !isForced) || submitting || checks.some(c => !c.ok)}
            className="w-full"
            variant="hero"
            size="lg"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isForced ? "Definir password e entrar" : "Atualizar password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
