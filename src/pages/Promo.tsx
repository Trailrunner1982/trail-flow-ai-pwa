import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mountain, Loader2, CheckCircle2, Gift, Zap } from "lucide-react";
import { toast } from "sonner";

type Step = "form" | "success";

export default function PromoPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const codeFromUrl = searchParams.get("code") ?? "";

  const [step, setStep] = useState<Step>("form");
  const [submitting, setSubmitting] = useState(false);
  const [monthsFree, setMonthsFree] = useState(1);

  const [form, setForm] = useState({
    code: codeFromUrl.toUpperCase(),
    full_name: "",
    email: "",
    password: "",
    password2: "",
  });

  // Actualizar código se mudar o URL
  useEffect(() => {
    if (codeFromUrl) setForm(f => ({ ...f, code: codeFromUrl.toUpperCase() }));
  }, [codeFromUrl]);

  const handleSubmit = async () => {
    if (!form.code.trim()) return toast.error("Introduz o código promocional");
    if (!form.full_name.trim()) return toast.error("Indica o teu nome completo");
    if (!form.email.includes("@")) return toast.error("Email inválido");
    if (form.password.length < 8) return toast.error("A password deve ter pelo menos 8 caracteres");
    if (!/[A-Z]/.test(form.password)) return toast.error("Inclui uma letra maiúscula");
    if (!/[a-z]/.test(form.password)) return toast.error("Inclui uma letra minúscula");
    if (!/[0-9]/.test(form.password)) return toast.error("Inclui um número");
    if (form.password !== form.password2) return toast.error("As passwords não coincidem");

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-promo", {
        body: {
          code: form.code.trim().toUpperCase(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          full_name: form.full_name.trim(),
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      setMonthsFree((data as any).months_free ?? 1);
      setStep("success");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao activar código. Tenta novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoToLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    if (error) navigate("/auth");
    else navigate("/onboarding");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Mountain className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">Trail Forge AI</span>
          </div>
          <p className="text-sm text-muted-foreground">Plano adaptativo de trail running</p>
        </div>

        {step === "form" && (
          <Card className="p-6 space-y-5">

            {/* Banner */}
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 flex items-start gap-3">
              <Gift className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-foreground text-sm">Código promocional</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Activa o teu acesso gratuito ao Trail Forge AI.
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">Criar conta</h2>
              <p className="text-sm text-muted-foreground">Preenche os teus dados para activar o código.</p>
            </div>

            <div className="space-y-3">
              {/* Código */}
              <div className="space-y-1.5">
                <Label className="text-xs">Código promocional</Label>
                <div className="relative">
                  <Zap className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
                  <Input
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="ex: TRAIL2026"
                    className="pl-9 font-mono tracking-widest"
                    maxLength={20}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Nome completo</Label>
                <Input value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  placeholder="João Silva" maxLength={100} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="joao@email.com" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Password</Label>
                <Input type="password" autoComplete="new-password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 8 caracteres" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Confirmar password</Label>
                <Input type="password" autoComplete="new-password"
                  value={form.password2}
                  onChange={e => setForm({ ...form, password2: e.target.value })} />
              </div>

              {form.password && (
                <ul className="text-xs space-y-1">
                  {[
                    { ok: form.password.length >= 8, label: "Pelo menos 8 caracteres" },
                    { ok: /[A-Z]/.test(form.password), label: "Uma letra maiúscula" },
                    { ok: /[a-z]/.test(form.password), label: "Uma letra minúscula" },
                    { ok: /[0-9]/.test(form.password), label: "Um número" },
                    { ok: form.password === form.password2 && form.password2.length > 0, label: "Passwords coincidem" },
                  ].map((c, i) => (
                    <li key={i} className={c.ok ? "text-emerald-500" : "text-muted-foreground"}>
                      {c.ok ? "✓" : "○"} {c.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button onClick={handleSubmit} disabled={submitting} className="w-full">
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Gift className="w-4 h-4" />}
              {submitting ? "A activar..." : "Activar acesso gratuito"}
            </Button>

            <div className="text-center space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Já tens conta?{" "}
                <button onClick={() => navigate("/auth")} className="text-primary underline">
                  Entrar
                </button>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Ao criares conta aceitas os termos de uso do Trail Forge AI.
              </p>
            </div>
          </Card>
        )}

        {step === "success" && (
          <Card className="p-8 text-center space-y-5">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Bem-vindo ao Trail Forge! 🏔️</h2>
              <p className="text-sm text-muted-foreground">
                O teu <strong className="text-primary">{monthsFree === 1 ? "mês grátis" : `${monthsFree} meses grátis`}</strong> está activado.<br />
                Completa o teu perfil para começar a treinar.
              </p>
            </div>

            <div className="rounded-xl bg-muted/40 p-4 text-sm text-left space-y-2">
              <div className="font-medium text-foreground">Próximos passos:</div>
              <div className="text-muted-foreground space-y-1.5">
                <div>1. Completa o onboarding (2 min)</div>
                <div>2. Adiciona as tuas provas âncora</div>
                <div>3. Liga o Strava para importar actividades</div>
                <div>4. O plano de época é gerado automaticamente</div>
              </div>
            </div>

            <Button onClick={handleGoToLogin} className="w-full">
              Entrar no Trail Forge AI →
            </Button>
          </Card>
        )}

      </div>
    </div>
  );
}
