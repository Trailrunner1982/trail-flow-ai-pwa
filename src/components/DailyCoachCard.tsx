import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Eye, Pencil, Check, X } from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import type { CalendarPlannedWorkout } from "./calendar/types";

interface Recommendation {
  verdict: "go" | "modify" | "easy" | "rest";
  headline: string;
  reasoning: string;
  adjustments: string[];
  suggested_distance_km?: number | null;
  suggested_elevation_m?: number | null;
  suggested_duration_min?: number | null;
  suggested_pace_sec_per_km?: number | null;
  suggested_zone?: string | null;
  watch_for: string;
}

const verdictMeta: Record<Recommendation["verdict"], { label: string; cls: string }> = {
  go: { label: "Avança", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  modify: { label: "Ajusta", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  easy: { label: "Faz fácil", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" },
  rest: { label: "Descansas", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

interface Props {
  todayWorkout: CalendarPlannedWorkout | undefined;
  todayBio: any | null;
  readiness: number | null;
  onApplied?: () => void;
}

interface EditForm {
  distance_km: string;
  elevation_m: string;
  duration_min: string;
  pace_sec_per_km: string;
  zone: string;
}

const toStr = (v: number | null | undefined) => (v == null ? "" : String(v));
const toNum = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function DailyCoachCard({ todayWorkout, todayBio, readiness, onApplied }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    distance_km: "", elevation_m: "", duration_min: "", pace_sec_per_km: "", zone: "",
  });

  const seedFromRec = (r: Recommendation) => {
    setForm({
      distance_km: toStr(r.suggested_distance_km ?? todayWorkout?.target_distance_km ?? null),
      elevation_m: toStr(r.suggested_elevation_m ?? todayWorkout?.target_elevation_m ?? null),
      duration_min: toStr(r.suggested_duration_min ?? todayWorkout?.target_duration_min ?? null),
      pace_sec_per_km: toStr(r.suggested_pace_sec_per_km ?? todayWorkout?.target_pace_sec_per_km ?? null),
      zone: r.suggested_zone ?? todayWorkout?.zone ?? "",
    });
  };

  const run = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const monthAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

      const [{ data: bio }, { data: rpe }, { data: stravaActivities }] = await Promise.all([
        supabase
          .from("daily_biometrics")
          .select("measurement_date,sleep_score,hrv,stress_level,body_battery,energy_level,soreness_score,soreness_zones,mood,weight_kg")
          .eq("user_id", user.id)
          .gte("measurement_date", weekAgo)
          .lte("measurement_date", today)
          .order("measurement_date", { ascending: false }),
        supabase
          .from("completed_workouts")
          .select("workout_date,rpe,actual_distance_km")
          .eq("user_id", user.id)
          .gte("workout_date", weekAgo)
          .lte("workout_date", today)
          .order("workout_date", { ascending: false }),
        supabase
          .from("free_workouts")
          .select("workout_date,activity,distance_km,duration_min,elevation_m,avg_hr,avg_pace_sec_per_km")
          .eq("user_id", user.id)
          .gte("workout_date", monthAgo)
          .order("workout_date", { ascending: false })
          .limit(30),
      ]);

      const { data, error } = await supabase.functions.invoke("daily-coach", {
        body: {
          today_workout: todayWorkout ?? null,
          today_bio: todayBio ?? null,
          recent_bio: bio ?? [],
          recent_rpe: rpe ?? [],
          readiness,
          recent_activities: stravaActivities ?? [],
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const result: Recommendation = (data as any).result;
      setRec(result);
      seedFromRec(result);
      setEditing(false);

      await supabase.from("ai_feedback").insert({
        user_id: user.id,
        feedback_date: today,
        feedback_type: "daily_recommendation",
        decision: `${result.verdict.toUpperCase()} · ${result.headline}`,
        reasoning: result.reasoning,
        context_data: { today_workout: todayWorkout, today_bio: todayBio, readiness, result } as any,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro a gerar recomendação");
    } finally {
      setLoading(false);
    }
  }, [user, todayWorkout, todayBio, readiness]);

  const applyToToday = useCallback(async () => {
    if (!user || !rec) return;
    setSaving(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const update: any = {
        target_distance_km: toNum(form.distance_km),
        target_elevation_m: toNum(form.elevation_m),
        target_duration_min: toNum(form.duration_min),
        target_pace_sec_per_km: toNum(form.pace_sec_per_km),
        zone: form.zone || null,
        description: `↻ Ajustado pelo Coach diário: ${rec.headline}${rec.reasoning ? ` — ${rec.reasoning}` : ""}`,
      };

      if (todayWorkout?.id) {
        const { error } = await supabase.from("planned_workouts").update(update).eq("id", todayWorkout.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("planned_workouts").insert({
          user_id: user.id,
          workout_date: today,
          workout_type: "easy",
          title: rec.verdict === "rest" ? "Descanso" : "Sessão ajustada",
          ...update,
        });
        if (error) throw error;
      }

      await supabase.from("ai_feedback").insert({
        user_id: user.id,
        feedback_date: today,
        feedback_type: "daily_recommendation_applied",
        decision: `Aplicado: ${form.distance_km || "—"}km · ${form.duration_min || "—"}min · zona ${form.zone || "—"}`,
        reasoning: `Versão final guardada pelo atleta a partir da sugestão "${rec.headline}".`,
        context_data: { applied: update, original_suggestion: rec } as any,
      });

      toast.success("Treino de hoje atualizado");
      setEditing(false);
      onApplied?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro a guardar");
    } finally {
      setSaving(false);
    }
  }, [user, rec, form, todayWorkout, onApplied]);

  const dirty = useMemo(() => {
    if (!rec) return false;
    return (
      toNum(form.distance_km) !== (rec.suggested_distance_km ?? todayWorkout?.target_distance_km ?? null) ||
      toNum(form.elevation_m) !== (rec.suggested_elevation_m ?? todayWorkout?.target_elevation_m ?? null) ||
      toNum(form.duration_min) !== (rec.suggested_duration_min ?? todayWorkout?.target_duration_min ?? null) ||
      toNum(form.pace_sec_per_km) !== (rec.suggested_pace_sec_per_km ?? todayWorkout?.target_pace_sec_per_km ?? null) ||
      (form.zone || null) !== (rec.suggested_zone ?? todayWorkout?.zone ?? null)
    );
  }, [form, rec, todayWorkout]);

  return (
    <Card className="p-5 border-primary/20">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">Coach diário</div>
            <div className="text-[11px] text-muted-foreground">Recomendação com base na tua biometria + RPE + atividades recentes</div>
          </div>
        </div>
        <Button size="sm" onClick={run} disabled={loading}>
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> A analisar…</>
            : (rec ? "Reanalisar" : "Analisar hoje")}
        </Button>
      </div>

      {rec && (
        <div className="mt-4 space-y-3 animate-fade-in">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={verdictMeta[rec.verdict].cls}>
              {verdictMeta[rec.verdict].label}
            </Badge>
            <span className="text-sm font-medium">{rec.headline}</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{rec.reasoning}</p>

          {rec.adjustments?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Ajustes</div>
              <ul className="space-y-1">
                {rec.adjustments.map((a, i) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-primary">→</span>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-card p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {editing ? "Edita os valores antes de guardar" : "Versão sugerida para hoje"}
              </div>
              {!editing && (
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(true)}>
                  <Pencil className="w-3 h-3 mr-1" /> Editar
                </Button>
              )}
            </div>

            {editing ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Field label="Distância (km)" value={form.distance_km} onChange={(v) => setForm({ ...form, distance_km: v })} />
                <Field label="D+ (m)" value={form.elevation_m} onChange={(v) => setForm({ ...form, elevation_m: v })} />
                <Field label="Duração (min)" value={form.duration_min} onChange={(v) => setForm({ ...form, duration_min: v })} />
                <Field label="Pace (s/km)" value={form.pace_sec_per_km} onChange={(v) => setForm({ ...form, pace_sec_per_km: v })} />
                <Field label="Zona" value={form.zone} onChange={(v) => setForm({ ...form, zone: v })} placeholder="Z2" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Pill k="Dist" v={form.distance_km ? `${form.distance_km} km` : "—"} />
                <Pill k="D+" v={form.elevation_m ? `${form.elevation_m} m` : "—"} />
                <Pill k="Dur" v={form.duration_min ? `${form.duration_min} min` : "—"} />
                <Pill k="Pace" v={form.pace_sec_per_km ? `${form.pace_sec_per_km} s/km` : "—"} />
                <Pill k="Zona" v={form.zone || "—"} />
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              {editing && (
                <Button size="sm" variant="ghost" onClick={() => { seedFromRec(rec); setEditing(false); }}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                </Button>
              )}
              <Button size="sm" onClick={applyToToday} disabled={saving}>
                {saving
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Check className="w-3.5 h-3.5 mr-1.5" />}
                {editing ? (dirty ? "Guardar versão final" : "Guardar") : "Aceitar e guardar"}
              </Button>
            </div>
          </div>

          {rec.watch_for && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
              <Eye className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{rec.watch_for}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
    </div>
  );
}

function Pill({ k, v }: { k: string; v: string }) {
  return (
    <span className="text-xs text-foreground"><span className="opacity-60">{k}:</span> <strong>{v}</strong></span>
  );
}
