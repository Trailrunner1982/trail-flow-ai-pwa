import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Wand2, Check } from "lucide-react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";

interface Adaptation {
  workout_id: string;
  workout_date: string;
  action: "keep" | "modify" | "easy" | "rest" | "swap";
  reasoning: string;
  new_title?: string | null;
  new_distance_km?: number | null;
  new_elevation_m?: number | null;
  new_duration_min?: number | null;
  new_zone?: string | null;
}

interface PlanResult {
  summary: string;
  overall_load: "maintain" | "reduce" | "increase" | "deload";
  adaptations: Adaptation[];
}

const actionMeta: Record<Adaptation["action"], { label: string; cls: string }> = {
  keep: { label: "Manter", cls: "bg-muted text-muted-foreground border-border" },
  modify: { label: "Ajustar", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  easy: { label: "Fácil", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" },
  rest: { label: "Descanso", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  swap: { label: "Trocar", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30" },
};

interface Props {
  todayBio: any | null;
  readiness: number | null;
  nextRace: any | null;
  onApplied?: () => void;
}

export function AdaptPlanCard({ todayBio, readiness, nextRace, onApplied }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const run = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const horizon = format(addDays(new Date(), 7), "yyyy-MM-dd");
      const weekAgo = format(addDays(new Date(), -7), "yyyy-MM-dd");

      const [{ data: upcoming }, { data: bio }, { data: rpe }] = await Promise.all([
        supabase.from("planned_workouts").select("id,workout_date,title,target_distance_km,target_elevation_m,target_duration_min,zone,workout_type")
          .eq("user_id", user.id).gte("workout_date", today).lte("workout_date", horizon)
          .eq("is_completed", false).eq("is_skipped", false).order("workout_date"),
        supabase.from("daily_biometrics").select("measurement_date,hrv,sleep_score,stress_level,garmin_readiness,soreness_score,soreness_zones,mood,weight_kg")
          .eq("user_id", user.id).gte("measurement_date", weekAgo).order("measurement_date", { ascending: false }),
        supabase.from("completed_workouts").select("workout_date,rpe,actual_distance_km")
          .eq("user_id", user.id).gte("workout_date", weekAgo).order("workout_date", { ascending: false }),
      ]);

      const { data, error } = await supabase.functions.invoke("adapt-plan", {
        body: {
          upcoming: upcoming ?? [],
          today_bio: todayBio,
          recent_bio: bio ?? [],
          recent_rpe: rpe ?? [],
          readiness,
          next_race: nextRace,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const r: PlanResult = (data as any).result;
      setResult(r);
      setSelected(new Set(r.adaptations.filter((a) => a.action !== "keep").map((a) => a.workout_id)));

      await supabase.from("ai_feedback").insert({
        user_id: user.id,
        feedback_date: today,
        feedback_type: "plan_adaptation",
        decision: `${r.overall_load.toUpperCase()} · ${r.adaptations.filter((a) => a.action !== "keep").length} ajustes propostos`,
        reasoning: r.summary,
        context_data: { result: r, today_bio: todayBio, readiness } as any,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro a adaptar plano");
    } finally {
      setLoading(false);
    }
  }, [user, todayBio, readiness, nextRace]);

  const apply = useCallback(async () => {
    if (!user || !result) return;
    setSaving(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const toApply = result.adaptations.filter((a) => selected.has(a.workout_id) && a.action !== "keep");
      for (const a of toApply) {
        const update: any = {};
        if (a.new_title) update.title = a.new_title;
        if (a.new_distance_km != null) update.target_distance_km = a.new_distance_km;
        if (a.new_elevation_m != null) update.target_elevation_m = a.new_elevation_m;
        if (a.new_duration_min != null) update.target_duration_min = a.new_duration_min;
        if (a.new_zone) update.zone = a.new_zone;
        if (a.action === "rest") {
          update.is_skipped = true;
          update.skip_reason = `Adaptação automática: ${a.reasoning}`;
        }
        update.description = `↻ Adaptado pelo plano dinâmico: ${a.reasoning}`;
        const { error } = await supabase.from("planned_workouts").update(update).eq("id", a.workout_id);
        if (error) throw error;
      }
      await supabase.from("ai_feedback").insert({
        user_id: user.id,
        feedback_date: today,
        feedback_type: "plan_adaptation_applied",
        decision: `Aplicadas ${toApply.length} adaptações`,
        reasoning: result.summary,
        context_data: { applied: toApply } as any,
      });
      toast.success(`${toApply.length} treinos adaptados`);
      setResult(null);
      setSelected(new Set());
      onApplied?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro a aplicar");
    } finally {
      setSaving(false);
    }
  }, [user, result, selected, onApplied]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <Card className="p-5 border-primary/20">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">Adaptação dinâmica do plano</div>
            <div className="text-[11px] text-muted-foreground">Próximos 7 dias com base em HRV, sono e readiness</div>
          </div>
        </div>
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> A analisar…</> : (result ? "Reanalisar" : "Adaptar plano")}
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-3 animate-fade-in">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="capitalize">{result.overall_load}</Badge>
            <span className="text-sm text-muted-foreground">{result.summary}</span>
          </div>

          <div className="space-y-2">
            {result.adaptations.map((a) => {
              const isKeep = a.action === "keep";
              return (
                <div key={a.workout_id} className={`rounded-lg border p-3 ${isKeep ? "bg-muted/20 border-border/40" : "bg-muted/40 border-border"}`}>
                  <div className="flex items-start gap-2">
                    {!isKeep && (
                      <Checkbox checked={selected.has(a.workout_id)} onCheckedChange={() => toggle(a.workout_id)} className="mt-1" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={actionMeta[a.action].cls}>{actionMeta[a.action].label}</Badge>
                        <span className="text-xs text-muted-foreground">{a.workout_date}</span>
                        {a.new_title && <span className="text-sm font-medium">{a.new_title}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{a.reasoning}</p>
                      {(a.new_distance_km != null || a.new_duration_min != null || a.new_zone || a.new_elevation_m != null) && (
                        <div className="text-xs mt-1.5 flex gap-3 flex-wrap text-foreground/80">
                          {a.new_distance_km != null && <span>{a.new_distance_km} km</span>}
                          {a.new_elevation_m != null && <span>{a.new_elevation_m} D+</span>}
                          {a.new_duration_min != null && <span>{a.new_duration_min} min</span>}
                          {a.new_zone && <span>zona {a.new_zone}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selected.size > 0 && (
            <Button onClick={apply} disabled={saving} className="w-full">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> A aplicar…</> : <><Check className="w-4 h-4 mr-2" /> Aplicar {selected.size} adaptaç{selected.size === 1 ? "ão" : "ões"}</>}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
