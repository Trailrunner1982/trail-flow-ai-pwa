import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarView } from "@/components/calendar/CalendarView";
import type {
  AdaptationProposal,
  CalendarCompletedWorkout,
  CalendarPlannedWorkout,
  CalendarStorage,
} from "@/components/calendar/types";
import { generatePlan } from "@/lib/planner";
import { addDays, format } from "date-fns";
import { Calendar as CalendarIcon, Sparkles, Dumbbell } from "lucide-react";
import { toast } from "sonner";
import { FreeWorkoutDialog } from "@/components/FreeWorkoutDialog";
import { useLanguage } from "@/lib/i18n";
import { AdaptPlanCard } from "@/components/AdaptPlanCard";
import { computeReadiness } from "./Biometrics";
import StrengthPage from "./Strength";

export default function CalendarPage() {
  const { userId, canWrite } = useEffectiveUser();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [planned, setPlanned] = useState<CalendarPlannedWorkout[]>([]);
  const [completed, setCompleted] = useState<CalendarCompletedWorkout[]>([]);
  const [todayBio, setTodayBio] = useState<any>(null);
  const [nextRaceA, setNextRaceA] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState("workouts");

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const [{ data: p }, { data: c }, { data: bio }, { data: race }] = await Promise.all([
      supabase.from("planned_workouts").select("*").eq("user_id", userId).order("workout_date"),
      supabase.from("completed_workouts").select("*").eq("user_id", userId),
      supabase.from("daily_biometrics").select("*").eq("user_id", userId).eq("measurement_date", today).maybeSingle(),
      supabase.from("races").select("*").eq("user_id", userId).eq("priority", "A").gte("race_date", today).order("race_date").limit(1).maybeSingle(),
    ]);
    setPlanned((p ?? []) as any);
    setCompleted((c ?? []) as any);
    setTodayBio(bio);
    setNextRaceA(race);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const storage: CalendarStorage = useMemo(() => ({
    saveCompleted: async (plannedWO, data) => {
      if (!userId) throw new Error("Not authenticated");
      if (!canWrite) throw new Error("Modo Espelho — leitura apenas");
      const existing = completed.find(
        (x) =>
          (plannedWO.id && x.planned_workout_id === plannedWO.id) ||
          (!plannedWO.id && x.workout_date === plannedWO.workout_date),
      );
      if (existing?.id) {
        const { data: upd, error } = await supabase
          .from("completed_workouts")
          .update({
            actual_distance_km: data.actual_distance_km,
            actual_elevation_m: data.actual_elevation_m,
            actual_duration_min: data.actual_duration_min,
            actual_avg_pace_sec_per_km: data.actual_avg_pace_sec_per_km,
            rpe: data.rpe,
            notes: data.notes,
          })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        await supabase.from("planned_workouts").update({ is_completed: true }).eq("id", plannedWO.id ?? "").then(() => null);
        return upd as any;
      }
      const { data: ins, error } = await supabase
        .from("completed_workouts")
        .insert({
          user_id: userId,
          workout_date: plannedWO.workout_date,
          planned_workout_id: plannedWO.id ?? null,
          actual_distance_km: data.actual_distance_km,
          actual_elevation_m: data.actual_elevation_m,
          actual_duration_min: data.actual_duration_min,
          actual_avg_pace_sec_per_km: data.actual_avg_pace_sec_per_km,
          rpe: data.rpe,
          notes: data.notes,
        })
        .select()
        .single();
      if (error) throw error;
      if (plannedWO.id) {
        await supabase.from("planned_workouts").update({ is_completed: true }).eq("id", plannedWO.id);
      }
      return ins as any;
    },
    applyAdaptations: async (adaptations: AdaptationProposal[]) => {
      if (!userId) throw new Error("Not authenticated");
      if (!canWrite) throw new Error("Modo Espelho — leitura apenas");
      for (const a of adaptations) {
        const target = planned.find((p) => p.workout_date === a.workout_date);
        if (!target?.id) continue;
        const update: any = { title: a.new_title };
        if (a.new_target_distance_km !== undefined) update.target_distance_km = a.new_target_distance_km;
        if (a.new_target_elevation_m !== undefined) update.target_elevation_m = a.new_target_elevation_m;
        if (a.new_target_duration_min !== undefined) update.target_duration_min = a.new_target_duration_min;
        update.description = `↻ Readaptado pelo Treinador AI: ${a.reason}`;
        await supabase.from("planned_workouts").update(update).eq("id", target.id);
      }
      fetchAll();
    },
    persistFeedback: async (mode, plannedWO, executed, result) => {
      if (!userId || !canWrite) return;
      const r: any = result;
      const decision = mode === "deep"
        ? `${r.verdict?.toUpperCase()} · ${r.adaptations?.length ?? 0} readaptaç${(r.adaptations?.length ?? 0) === 1 ? "ão" : "ões"} proposta(s)`
        : `${r.verdict?.toUpperCase()} · ${r.headline ?? ""}`;
      const reasoning = mode === "deep" ? (r.summary ?? "") : (r.next_session_tip ?? "");
      await supabase.from("ai_feedback").insert({
        user_id: userId,
        feedback_date: plannedWO.workout_date,
        feedback_type: mode === "deep" ? "workout_deep" : "workout_quick",
        decision,
        reasoning,
        context_data: { planned: plannedWO, executed, result } as any,
      });
    },
  }), [userId, canWrite, completed, planned, fetchAll]);

  const handleGenerateDemo = async () => {
    if (!userId) return;
    if (!canWrite) return toast.error("Modo Espelho — leitura apenas");
    setGenerating(true);
    try {
      const startDate = new Date();
     const generated = generatePlan({
  startDate,
  raceDate: addDays(startDate, 84),
  raceDistanceKm: 42,
  raceElevationM: 2000,
  terrainProfile: "mixed",
  baselineKmPerWeek: 35,
  baselineAvgPaceSecPerKm: 330,
  raceName: "Demo Trail 42K",
});
      const rows = generated.map((w) => ({
  ...w,
  user_id: userId,
  race_id: w.race_id && w.race_id !== "single" ? w.race_id : null,
}));
      const { error } = await supabase.from("planned_workouts").insert(rows as any);
      if (error) throw error;
      toast.success(`Plano gerado: ${rows.length} treinos`);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro a gerar plano");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-primary" /> Treinos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Plano de corrida e sessões de força.</p>
        </div>
        {tab === "workouts" && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{planned.length} {t("cal.workouts")}</Badge>
            <Badge variant="outline">{completed.length} {t("cal.done")}</Badge>
            {userId && <FreeWorkoutDialog userId={userId} canWrite={canWrite} onSaved={fetchAll} />}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="workouts">
            <CalendarIcon className="w-3.5 h-3.5 mr-1.5" /> Calendário
          </TabsTrigger>
          <TabsTrigger value="strength">
            <Dumbbell className="w-3.5 h-3.5 mr-1.5" /> Força
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workouts" className="mt-4">
          {planned.length === 0 ? (
            <Card className="p-8 text-center space-y-4">
              <div className="text-lg font-medium">{t("cal.noPlan")}</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">{t("cal.demoHint")}</p>
              <Button onClick={handleGenerateDemo} disabled={generating}>
                <Sparkles className="w-4 h-4" /> {t("cal.generateDemo")}
              </Button>
            </Card>
          ) : (
            <>
              <AdaptPlanCard
                todayBio={todayBio}
                readiness={todayBio ? computeReadiness(todayBio) : null}
                nextRace={nextRaceA}
                onApplied={fetchAll}
              />
              <CalendarView planned={planned} completed={completed} storage={storage} onChanged={fetchAll} />
            </>
          )}
        </TabsContent>

        <TabsContent value="strength" className="mt-4">
          <StrengthPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
