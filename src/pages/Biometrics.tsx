import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useLanguage } from "@/lib/i18n";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { HeartPulse, Moon, Activity, Battery, Save, Loader2, HelpCircle } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { pt, enUS } from "date-fns/locale";
import { toast } from "sonner";

interface Bio {
  id?: string;
  measurement_date: string;
  sleep_score: number | null;
  hrv: number | null;
  stress_level: number | null;
  body_battery: number | null;
  resting_hr: number | null;
  energy_level: number | null;
  soreness_score: number | null;
  soreness_zones: string[] | null;
  mood: number | null;
  notes: string | null;
}

export const SORENESS_ZONES = [
  "quadriceps", "calves", "hamstrings", "glutes", "lower_back", "knees", "ankles", "shoulders", "other",
] as const;

const today = () => format(new Date(), "yyyy-MM-dd");

function TooltipHelp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button type="button" onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-primary ml-1">
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span className="absolute z-50 left-5 top-0 w-52 rounded-md bg-popover border border-border text-xs text-popover-foreground shadow-md p-2">
          {text}
        </span>
      )}
    </span>
  );
}

export default function BiometricsPage() {
  const { userId, canWrite } = useEffectiveUser();
  const { t, lang } = useLanguage();
  const dateLocale = lang === "en" ? enUS : pt;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Bio[]>([]);
  const [date, setDate] = useState(today());
  const [form, setForm] = useState<Bio>({
    measurement_date: today(),
    sleep_score: 75,
    hrv: null,
    stress_level: 30,
    body_battery: null,
    resting_hr: null,
    energy_level: 7,
    soreness_score: 0,
    soreness_zones: [],
    mood: 3,
    notes: "",
  });

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("daily_biometrics")
      .select("*")
      .eq("user_id", userId)
      .gte("measurement_date", format(subDays(new Date(), 30), "yyyy-MM-dd"))
      .order("measurement_date", { ascending: false });
    setHistory((data ?? []) as Bio[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const existing = history.find((h) => h.measurement_date === date);
    if (existing) {
      setForm(existing);
    } else {
      setForm({
        measurement_date: date,
        sleep_score: 75, hrv: null, stress_level: 30, body_battery: null,
        resting_hr: null, energy_level: 7,
        soreness_score: 0, soreness_zones: [], mood: 3,
        notes: "",
      });
    }
  }, [date, history]);

  const handleSave = async () => {
    if (!userId) return;
    if (!canWrite) return toast.error(t("common.readonly"));
    setSaving(true);
    const payload = {
      user_id: userId,
      measurement_date: form.measurement_date,
      sleep_score: form.sleep_score,
      hrv: form.hrv,
      stress_level: form.stress_level,
      body_battery: form.body_battery,
      resting_hr: form.resting_hr,
      energy_level: form.energy_level,
      soreness_score: form.soreness_score,
      soreness_zones: form.soreness_zones?.length ? form.soreness_zones : null,
      mood: form.mood,
      notes: form.notes || null,
    };
    const existing = history.find((h) => h.measurement_date === form.measurement_date);
    const { error } = existing?.id
      ? await supabase.from("daily_biometrics").update(payload).eq("id", existing.id)
      : await supabase.from("daily_biometrics").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("bio.toast.saved"));
    fetchAll();
  };

  if (loading) return <LoadingScreen />;

  const readiness = computeReadiness(form);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <HeartPulse className="w-6 h-6 text-primary" /> {t("bio.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("bio.subtitle")}</p>
      </div>

      <Card className="p-5 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Label className="text-xs">{t("common.day")}</Label>
            <Input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          {readiness !== null && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-end gap-1">
                {t("dash.readiness")}
                <TooltipHelp text="Prontidão calculada com base no sono, stress, dores musculares e humor. 75+ = ótimo, 55-74 = bom, 35-54 = moderado, abaixo = descanso recomendado." />
              </div>
              <div className={`text-2xl font-bold ${readinessColor(readiness)}`}>{readiness}</div>
            </div>
          )}
        </div>

        <SliderField
          icon={Moon}
          label={t("bio.sleep")}
          hint={t("bio.sleepHint")}
          tooltip="Qualidade do sono de 0 a 100. Inclui duração, fases e recuperação. Valores acima de 70 indicam boa recuperação."
          value={form.sleep_score ?? 0}
          onChange={(v) => setForm({ ...form, sleep_score: v })}
        />
        <SliderField
          icon={Activity}
          label={t("bio.stress")}
          hint={t("bio.stressHint")}
          tooltip="Nível de stress de 0 a 100. Valores abaixo de 40 são ideais para treinar. Acima de 70 considera reduzir a intensidade."
          value={form.stress_level ?? 0}
          onChange={(v) => setForm({ ...form, stress_level: v })}
        />
        <SliderField
          icon={Activity}
          label={t("bio.soreness")}
          hint={t("bio.sorenessHint")}
          tooltip="Dor muscular de 0 a 10. Acima de 5 o coach pode adaptar o treino. Acima de 7 recomenda-se descanso ativo."
          max={10}
          value={form.soreness_score ?? 0}
          onChange={(v) => setForm({ ...form, soreness_score: v })}
        />

        {(form.soreness_score ?? 0) > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">{t("bio.sorenessZones")}</Label>
            <div className="flex flex-wrap gap-2">
              {SORENESS_ZONES.map((z) => {
                const active = form.soreness_zones?.includes(z) ?? false;
                return (
                  <Button
                    key={z}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => {
                      const cur = form.soreness_zones ?? [];
                      setForm({ ...form, soreness_zones: active ? cur.filter((x) => x !== z) : [...cur, z] });
                    }}
                  >
                    {t(`bio.zone.${z}`)}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        <SliderField
          icon={HeartPulse}
          label={t("bio.mood")}
          hint={t("bio.moodHint")}
          tooltip="Humor de 1 (muito mau) a 5 (excelente). Influencia o cálculo da prontidão e as recomendações do coach."
          max={5}
          value={form.mood ?? 3}
          onChange={(v) => setForm({ ...form, mood: v })}
        />

        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          <NumField
            label={t("bio.hrv")}
            icon={HeartPulse}
            value={form.hrv}
            onChange={(v) => setForm({ ...form, hrv: v })}
            tooltip="Variabilidade da frequência cardíaca em ms. Valores mais altos indicam melhor recuperação. Compara sempre com a tua baseline pessoal."
          />
          <NumField
            label={t("bio.restHr")}
            icon={HeartPulse}
            value={form.resting_hr}
            onChange={(v) => setForm({ ...form, resting_hr: v })}
            tooltip="FC em repouso ao acordar. Valores elevados (>5 bpm acima da tua média) podem indicar fadiga ou início de doença."
          />
          <NumField
            label={t("bio.battery")}
            icon={Battery}
            value={form.body_battery}
            onChange={(v) => setForm({ ...form, body_battery: v })}
            tooltip="Body Battery (Garmin) de 0 a 100. Indica a energia disponível para o dia. Abaixo de 30 recomenda-se treino leve."
          />
          <NumField
            label={t("bio.energy")}
            icon={Battery}
            value={form.energy_level}
            onChange={(v) => setForm({ ...form, energy_level: v })}
            tooltip="A tua perceção subjetiva de energia de 1 a 10. Complementa os dados objetivos do sensor."
          />
        </div>

        <div>
          <Label className="text-xs">{t("common.notes")} ({t("common.optional")})</Label>
          <Textarea
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={t("bio.notesPlaceholder")}
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t("common.save")}
        </Button>
      </Card>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">{t("bio.last30")}</h2>
        {history.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">{t("bio.empty")}</Card>
        ) : (
          <div className="grid gap-2">
            {history.map((h) => {
              const r = computeReadiness(h);
              return (
                <Card key={h.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Button size="sm" variant="ghost" onClick={() => setDate(h.measurement_date)}>
                      {format(parseISO(h.measurement_date), "EEE dd MMM", { locale: dateLocale })}
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 text-xs flex-wrap justify-end">
                    {h.sleep_score != null && <Badge variant="outline">😴 {h.sleep_score}</Badge>}
                    {h.stress_level != null && <Badge variant="outline">⚡ {h.stress_level}</Badge>}
                    {h.hrv != null && <Badge variant="outline">❤️ {h.hrv}</Badge>}
                    {r != null && <Badge className={readinessColor(r) + " border-current"} variant="outline">{r}</Badge>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SliderField({
  icon: Icon, label, hint, tooltip, value, onChange, max = 100,
}: { icon: any; label: string; hint: string; tooltip?: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-primary" /> {label}
          {tooltip && <TooltipHelp text={tooltip} />}
        </Label>
        <Badge variant="secondary">{value}</Badge>
      </div>
      <Slider value={[value]} min={0} max={max} step={1} onValueChange={(v) => onChange(v[0])} />
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function NumField({
  label, icon: Icon, value, onChange, step, tooltip,
}: { label: string; icon: any; value: number | null; onChange: (v: number | null) => void; step?: string; tooltip?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-primary" /> {label}
        {tooltip && <TooltipHelp text={tooltip} />}
      </Label>
      <Input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        placeholder="—"
      />
    </div>
  );
}

export function computeReadiness(b: Partial<Pick<Bio, "sleep_score" | "stress_level" | "soreness_score" | "mood">>): number | null {
  const sleep = b.sleep_score ?? null;
  const stress = b.stress_level ?? null;
  if (sleep == null && stress == null) return null;
  let score = 0;
  let weight = 0;
  if (sleep != null) { score += sleep * 0.6; weight += 0.6; }
  if (stress != null) { score += (100 - stress) * 0.4; weight += 0.4; }
  let r = score / weight;
  if (b.soreness_score != null && b.soreness_score >= 7) r -= 15;
  else if (b.soreness_score != null && b.soreness_score >= 5) r -= 8;
  if (b.mood != null) r += (b.mood - 3) * 3;
  return Math.max(0, Math.min(100, Math.round(r)));
}

function readinessColor(r: number) {
  if (r >= 75) return "text-emerald-400";
  if (r >= 55) return "text-primary";
  if (r >= 35) return "text-yellow-400";
  return "text-destructive";
}
