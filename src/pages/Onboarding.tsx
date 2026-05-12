import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Mountain, ChevronRight, ChevronLeft, LayoutDashboard, Calendar, Brain, Flag, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fmtPace } from "@/lib/format";

function paceInputToSec(val: string): number | null {
  if (!val) return null;
  // Só aceita formato min:seg
  if (!val.includes(":")) return null;
  const parts = val.split(":");
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0]);
  const s = parseInt(parts[1]);
  if (isNaN(m) || isNaN(s)) return null;
  if (s < 0 || s > 59) return null;
  if (m < 2 || m > 15) return null;
  return m * 60 + s;
}

const DAYS = [
  { v: 1, l: "Seg" }, { v: 2, l: "Ter" }, { v: 3, l: "Qua" },
  { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" }, { v: 0, l: "Dom" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [paceError, setPaceError] = useState("");

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [kmPerWeek, setKmPerWeek] = useState("");
  const [paceInput, setPaceInput] = useState("");
  const [runDays, setRunDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [strengthDays, setStrengthDays] = useState<number[]>([2, 4]);
  const [longRunDay, setLongRunDay] = useState<number>(6);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const bmi = (() => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    if (!w || !h || h <= 0) return null;
    return (w / Math.pow(h / 100, 2)).toFixed(1);
  })();

  const toggleDay = (day: number, list: number[], setList: (d: number[]) => void) => {
    if (list.includes(day)) {
      setList(list.filter((d) => d !== day));
    } else {
      setList([...list, day].sort());
    }
  };

  const handlePaceChange = (val: string) => {
    setPaceInput(val);
    setPaceError("");
    if (val && !val.includes(":")) {
      setPaceError("Usa o formato min:seg — ex: 5:30");
    } else if (val && val.includes(":")) {
      const sec = paceInputToSec(val);
      if (sec === null) {
        setPaceError("Pace inválido — ex: 5:30 (entre 2:00 e 15:00)");
      }
    }
  };

  const next = () => {
    if (step === 1) {
      if (!fullName.trim() || fullName.trim().length < 2) { toast.error("Indica o teu nome completo"); return; }
      if (!dob) { toast.error("Indica a tua data de nascimento"); return; }
      if (!weight || parseFloat(weight) < 30) { toast.error("Indica o teu peso (mínimo 30kg)"); return; }
      if (!height || parseFloat(height) < 120) { toast.error("Indica a tua altura (mínimo 120cm)"); return; }
    }
    if (step === 2) {
      if (!kmPerWeek || parseFloat(kmPerWeek) < 0) { toast.error("Indica os km semanais"); return; }
      const paceSec = paceInputToSec(paceInput);
      if (!paceInput) { toast.error("Indica o pace médio — ex: 5:30"); return; }
      if (!paceInput.includes(":")) { toast.error("Usa o formato min:seg — ex: 5:30 (não uses ponto)"); return; }
      if (paceSec === null) { toast.error("Pace inválido — usa o formato 5:30 (entre 2:00 e 15:00)"); return; }
      if (runDays.length === 0) { toast.error("Seleciona pelo menos 1 dia de corrida"); return; }
    }
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    const paceSec = paceInputToSec(paceInput);
    if (!paceSec) return toast.error("Pace inválido — usa o formato 5:30");
    setSubmitting(true);
    try {
      const { error } = await supabase.from("profiles").update({
        full_name: fullName.trim(),
        date_of_birth: dob,
        weight_kg: parseFloat(weight),
        height_cm: parseFloat(height),
        baseline_km_per_week: parseFloat(kmPerWeek),
        baseline_avg_pace_sec_per_km: paceSec,
        available_run_days: runDays,
        available_strength_days: strengthDays,
        long_run_day: longRunDay,
        onboarding_completed: true,
        must_change_password: false,
      }).eq("id", user!.id);
      if (error) throw error;

      const today = new Date().toISOString().split("T")[0];
      await supabase.from("daily_biometrics").upsert({
        user_id: user!.id,
        measurement_date: today,
        weight_kg: parseFloat(weight),
      }, { onConflict: "user_id,measurement_date" });

      toast.success("Perfil criado! Bem-vindo ao Trail Forge 🏔️");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao guardar perfil");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSteps = 3;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-xl bg-card border border-border rounded-2xl p-6 sm:p-10 shadow-lg">
        <div className="flex items-center gap-2 mb-2 text-primary">
          <Mountain className="w-5 h-5" />
          <span className="text-xs font-bold tracking-widest uppercase text-primary">Onboarding · Passo {step} de {totalSteps}</span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-8">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Quem és tu, atleta?</h2>
              <p className="text-muted-foreground text-sm mt-1">Vamos personalizar a tua experiência.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Nome completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="João Silva" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Data de nascimento</Label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                max={new Date().toISOString().split("T")[0]} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Peso (kg)</Label>
                <Input type="number" step="0.1" min={30} max={200} value={weight}
                  onChange={(e) => setWeight(e.target.value)} placeholder="70" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Altura (cm)</Label>
                <Input type="number" step="1" min={120} max={230} value={height}
                  onChange={(e) => setHeight(e.target.value)} placeholder="175" />
              </div>
            </div>
            {bmi && (
              <div className="rounded-xl border border-border bg-muted/40 p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">IMC calculado</span>
                <span className="text-3xl font-bold text-primary">{bmi}</span>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Configura o teu treino</h2>
              <p className="text-muted-foreground text-sm mt-1">O coach AI usa estes dados para gerar o teu plano. Podes alterar no Perfil a qualquer momento.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Km por semana</Label>
                <Input type="number" step="1" min={0} max={300} value={kmPerWeek}
                  onChange={(e) => setKmPerWeek(e.target.value)} placeholder="Ex: 35" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Pace médio (min:seg/km)</Label>
                <Input
                  value={paceInput}
                  onChange={(e) => handlePaceChange(e.target.value)}
                  placeholder="Ex: 5:30"
                  className={paceError ? "border-destructive" : ""}
                />
                {paceError && (
                  <p className="text-xs text-destructive mt-1">{paceError}</p>
                )}
                {paceInput && !paceError && paceInputToSec(paceInput) && (
                  <p className="text-xs text-emerald-500 mt-1">✓ {fmtPace(paceInputToSec(paceInput))} min/km</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Dias disponíveis para correr</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DAYS.map((d) => (
                  <Button key={d.v} type="button" size="sm"
                    variant={runDays.includes(d.v) ? "default" : "outline"}
                    onClick={() => toggleDay(d.v, runDays, setRunDays)}>
                    {d.l}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Dias de força</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DAYS.map((d) => (
                  <Button key={d.v} type="button" size="sm"
                    variant={strengthDays.includes(d.v) ? "default" : "outline"}
                    onClick={() => toggleDay(d.v, strengthDays, setStrengthDays)}>
                    {d.l}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Dia do long run</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DAYS.map((d) => (
                  <Button key={d.v} type="button" size="sm"
                    variant={longRunDay === d.v ? "default" : "outline"}
                    onClick={() => setLongRunDay(d.v)}>
                    {d.l}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Como funciona o Trail Forge</h2>
              <p className="text-muted-foreground text-sm mt-1">Uma plataforma completa para o teu treino de trail.</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/30">
                <LayoutDashboard className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Painel</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Vê o teu estado de prontidão, o próximo treino e o resumo da semana.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/30">
                <Calendar className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Treinos</p>
                  <p className="text-xs text-muted-foreground mt-0.5">O teu plano semanal gerado automaticamente. Regista cada treino após completar.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/30">
                <Brain className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Treinador AI</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Análise inteligente dos teus treinos e recomendações adaptadas ao teu estado de forma.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/30">
                <Flag className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Provas</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Adiciona as tuas provas âncora e o plano adapta-se automaticamente para chegares preparado.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/30">
                <HelpCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Biometria diária</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Regista sono, stress e dores musculares para o coach AI adaptar a intensidade dos treinos.</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">Podes alterar todos os teus dados a qualquer momento no <strong className="text-foreground">Perfil</strong>.</p>
          </div>
        )}

        <div className="flex justify-between mt-8 gap-3">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || submitting}>
            <ChevronLeft className="w-4 h-4" /> Voltar
          </Button>
          {step < totalSteps ? (
            <Button onClick={next}>
              Continuar <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Entrar no Trail Forge 🏔️
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
