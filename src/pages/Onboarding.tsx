import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Loader2, Mountain, ChevronRight, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { parsePaceToSeconds, fmtPace } from "@/lib/format";

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Nome muito curto").max(100),
  date_of_birth: z.string().min(1, "Indica a data de nascimento"),
  weight_kg: z.number().min(30).max(200),
  height_cm: z.number().min(120).max(230),
  baseline_km_per_week: z.number().min(0).max(300),
  baseline_avg_pace_sec_per_km: z.number().min(180).max(900),
  display_preference: z.enum(["pace", "distance", "time", "heart_rate"]),
});

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [kmPerWeek, setKmPerWeek] = useState("");
  const [paceInput, setPaceInput] = useState("");
  const [displayPref, setDisplayPref] = useState<"pace" | "distance" | "time" | "heart_rate">("pace");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // BMI live
  const bmi = (() => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    if (!w || !h || h <= 0) return null;
    return (w / Math.pow(h / 100, 2)).toFixed(1);
  })();

  const handleSubmit = async () => {
    const paceSec = parsePaceToSeconds(paceInput);
    const parsed = profileSchema.safeParse({
      full_name: fullName,
      date_of_birth: dob,
      weight_kg: parseFloat(weight),
      height_cm: parseFloat(height),
      baseline_km_per_week: parseFloat(kmPerWeek),
      baseline_avg_pace_sec_per_km: paceSec ?? -1,
      display_preference: displayPref,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          ...parsed.data,
          onboarding_completed: true,
        })
        .eq("id", user!.id);
      if (error) throw error;
      toast.success("Perfil criado. Agora adiciona a tua próxima prova!");
      navigate("/races");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao guardar perfil");
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step === 1 && (!fullName.trim() || !dob)) { toast.error("Preenche nome e data de nascimento"); return; }
    if (step === 2 && (!weight || !height)) { toast.error("Indica peso e altura"); return; }
    if (step === 3 && (!kmPerWeek || !paceInput || parsePaceToSeconds(paceInput) === null)) {
      toast.error("Preenche os km/semana e pace médio (ex: 5:30)"); return;
    }
    setStep((s) => s + 1);
  };

  const totalSteps = 4;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl glass-card p-6 sm:p-10 animate-slide-up">
        <div className="flex items-center gap-2 mb-2 text-primary">
          <Mountain className="w-5 h-5" />
          <span className="text-xs font-bold tracking-widest uppercase">Onboarding · Passo {step} de {totalSteps}</span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-8">
          <div className="h-full bg-gradient-hero transition-all duration-500" style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>

        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold">Quem és tu, atleta?</h2>
              <p className="text-muted-foreground text-sm mt-1">Para personalizar o teu plano.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dob">Data de nascimento</Label>
              <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().split("T")[0]} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold">Composição corporal</h2>
              <p className="text-muted-foreground text-sm mt-1">Calculamos o IMC automaticamente.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weight">Peso (kg)</Label>
                <Input id="weight" type="number" step="0.1" min={30} max={200} value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Altura (cm)</Label>
                <Input id="height" type="number" step="0.5" min={120} max={230} value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
            </div>
            {bmi && (
              <div className="rounded-xl border border-border/60 bg-muted/40 p-4 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">IMC calculado</span>
                <span className="stat-number text-3xl text-gradient">{bmi}</span>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold">Baseline das últimas 4 semanas</h2>
              <p className="text-muted-foreground text-sm mt-1">É o ponto de partida do teu plano. Sê honesto.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="km">Média de km por semana</Label>
              <Input id="km" type="number" step="0.5" min={0} max={300} value={kmPerWeek} onChange={(e) => setKmPerWeek(e.target.value)} placeholder="Ex: 35" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pace">Pace médio ao km</Label>
              <Input id="pace" value={paceInput} onChange={(e) => setPaceInput(e.target.value)} placeholder="Ex: 5:30" />
              {paceInput && parsePaceToSeconds(paceInput) !== null && (
                <p className="text-xs text-muted-foreground">Interpretado como <span className="text-primary font-medium">{fmtPace(parsePaceToSeconds(paceInput))}</span></p>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold">Como queres ver os treinos?</h2>
              <p className="text-muted-foreground text-sm mt-1">Pode ser alterado a qualquer momento.</p>
            </div>
            <RadioGroup value={displayPref} onValueChange={(v) => setDisplayPref(v as any)} className="grid grid-cols-2 gap-3">
              {[
                { v: "pace", label: "Por Pace" },
                { v: "distance", label: "Por Distância" },
                { v: "time", label: "Por Tempo" },
                { v: "heart_rate", label: "Por HR" },
              ].map((opt) => (
                <Label key={opt.v} htmlFor={`pref-${opt.v}`}
                  className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-all ${displayPref === opt.v ? "border-primary bg-primary/10" : "border-border/60 hover:border-border"}`}>
                  <RadioGroupItem id={`pref-${opt.v}`} value={opt.v} />
                  <span className="font-medium">{opt.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
        )}

        <div className="flex justify-between mt-8 gap-3">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || submitting}>
            <ChevronLeft className="w-4 h-4" /> Voltar
          </Button>
          {step < totalSteps ? (
            <Button variant="hero" onClick={next}>Continuar <ChevronRight className="w-4 h-4" /></Button>
          ) : (
            <Button variant="hero" onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Concluir
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
