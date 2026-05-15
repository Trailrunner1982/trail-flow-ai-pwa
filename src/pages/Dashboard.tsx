import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { MountainIndexCard } from "@/components/MountainIndexCard";
import { TrainingLoadChart } from "@/components/TrainingLoadChart";
import type {
  AdaptationProposal,
  CalendarCompletedWorkout,
  CalendarPlannedWorkout,
  CalendarStorage,
} from "@/components/calendar/types";
import {
  Activity,
  Flag,
  HeartPulse,
  Mountain,
  TrendingUp,
  Apple,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import { differenceInDays, format, parseISO, startOfWeek, endOfWeek, subDays } from "date-fns";
import { fmtDuration, fmtPace } from "@/lib/format";
import { computeReadiness } from "./Biometrics";
import { calculateReadiness, calculateGAP } from "@/lib/training";
import { useLanguage, getDateLocale } from "@/lib/i18n";
import { DailyCoachCard } from "@/components/DailyCoachCard";
import { WelcomeDialog } from "@/components/WelcomeDialog";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const todayStr = () => format(new Date(), "yyyy-MM-dd");

interface Race {
  id: string;
  name: string;
  race_date: string;
  distance_km: number;
  elevation_gain_m: number;
  priority: string;
}

export default function DashboardPage() {
  const { userId, canWrite } = useEffectiveUser();
  const { t, lang } = useLanguage();
  const dateLocale = getDateLocale(lang);
  const [showMore, setShowMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [planned, setPlanned] = useState<CalendarPlannedWorkout[]>([]);
  const [completed, setCompleted] = useState<CalendarCompletedWorkout[]>([]);
  const [historyCompleted, setHistoryCompleted] = useState<CalendarCompletedWorkout[]>([]);
  const [nextRaceA, setNextRaceA] = useState<Race | null>(null);
  const [todayBio, setTodayBio] = useState<any>(null);
  const [athleteName, setAthleteName] = useState<string>("");

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const ninetyDaysAgo = format(subDays(new Date(), 90), "yyyy-MM-dd");
    const [{ data: p }, { data: c }, { data: hc }, { data: r }, { data: bio }, { data: prof }] = await Promise.all([
      supabase.from("planned_workouts").select("*").eq("user_id", userId)
        .gte("workout_date", weekStart).lte("workout_date", weekEnd).order("workout_date"),
      supabase.from("completed_workouts").select("*").eq("user_id", userId)
        .gte("workout_date", weekStart).lte("workout_date", weekEnd),
      supabase.from("completed_workouts").select("*").eq("user_id", userId)
        .gte("workout_date", ninetyDaysAgo).order("workout_date"),
      supabase.from("races").select("*").eq("user_id", userId).eq("priority", "A")
        .gte("race_date", todayStr()).order("race_date").limit(1).maybeSingle(),
      supabase.from("daily_biometrics").select("*").eq("user_id", userId)
        .eq("measurement_date", todayStr()).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    setPlanned((p ?? []) as any);
    setCompleted((c ?? []) as any);
    setHistoryCompleted((hc ?? []) as any);
    setNextRaceA((r ?? null) as Race | null);
    setTodayBio(bio);
    setAthleteName((prof?.full_name ?? "").split(" ")[0] ?? "");
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const storage: CalendarStorage = useMemo(() => ({
    saveCompleted: async (plannedWO, data) => {
      if (!userId) throw new Error("Not authenticated");
      if (!canWrite) throw new Error("Modo Espelho — leitura apenas");
      const existing = completed.find((x) =>
        (plannedWO.id && x.planned_workout_id === plannedWO.id) ||
        (!plannedWO.id && x.workout_date === plannedWO.workout_date),
      );
      if (existing?.id) {
        const { data: upd, error } = await supabase.from("completed_workouts").update({
          actual_distance_km: data.actual_distance_km,
          actual_elevation_m: data.actual_elevation_m,
          actual_duration_min: data.actual_duration_min,
          actual_avg_pace_sec_per_km: data.actual_avg_pace_sec_per_km,
          rpe: data.rpe,
          notes: data.notes,
        }).eq("id", existing.id).select().single();
        if (error) throw error;
        if (plannedWO.id) await supabase.from("planned_workouts").update({ is_completed: true }).eq("id", plannedWO.id);
        return upd as any;
      }
      const { data: ins, error } = await supabase.from("completed_workouts").insert({
        user_id: userId,
        workout_date: plannedWO.workout_date,
        planned_workout_id: plannedWO.id ?? null,
        actual_distance_km: data.actual_distance_km,
        actual_elevation_m: data.actual_elevation_m,
        actual_duration_min: data.actual_duration_min,
        actual_avg_pace_sec_per_km: data.actual_avg_pace_sec_per_km,
        rpe: data.rpe,
        notes: data.notes,
      }).select().single();
      if (error) throw error;
      if (plannedWO.id) await supabase.from("planned_workouts").update({ is_completed: true }).eq("id", plannedWO.id);
      return ins as any;
    },
    applyAdaptations: async (adaptations: AdaptationProposal[]) => {
      if (!userId || !canWrite) return;
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
        decision, reasoning,
        context_data: { planned: plannedWO, executed, result } as any,
      });
    },
  }), [userId, canWrite, completed, planned, fetchAll]);

  if (loading) return <LoadingScreen />;

  const today = todayStr();
  const todayWorkout = planned.find((p) => p.workout_date === today);
  const todayCompleted = completed.find((c) => c.workout_date === today);
  const weekKm = completed.reduce((s, c) => s + (c.actual_distance_km ?? 0), 0);
  const weekVert = completed.reduce((s, c) => s + (c.actual_elevation_m ?? 0), 0);
  const targetKm = planned.reduce((s, p) => s + (p.target_distance_km ?? 0), 0);
  const targetVert = planned.reduce((s, p) => s + (p.target_elevation_m ?? 0), 0);
  const readiness = todayBio ? computeReadiness(todayBio) : null;
  const readinessAdvanced = todayBio ? calculateReadiness({
    hrv: todayBio.hrv, sleep_score: todayBio.sleep_score,
    body_battery: todayBio.body_battery, energy_level: todayBio.energy_level,
  }) : null;
  const todayGap = todayWorkout?.target_pace_sec_per_km && todayWorkout?.target_distance_km
    ? calculateGAP(todayWorkout.target_pace_sec_per_km, todayWorkout.target_distance_km, todayWorkout.target_elevation_m ?? 0)
    : null;
  const longSession = (todayWorkout?.target_duration_min ?? 0) >= 90 || (todayWorkout?.target_distance_km ?? 0) >= 18;

  // Race progress (time elapsed + adherence + vert/volume accrued)
  const raceProgress = (() => {
    if (!nextRaceA) return null;
    const raceDate = parseISO(nextRaceA.race_date);
    const daysToRace = Math.max(0, differenceInDays(raceDate, new Date()));
    // Time progress: assume 16-week macrocycle as default window
    const totalWindowDays = 16 * 7;
    const elapsedDays = Math.min(totalWindowDays, totalWindowDays - daysToRace);
    const timePct = Math.max(0, Math.min(100, Math.round((elapsedDays / totalWindowDays) * 100)));
    // Adherence: planned-with-completion ratio over last 28 days
    const since = subDays(new Date(), 28);
    const recentCompleted = historyCompleted.filter((c) => parseISO(c.workout_date) >= since);
    const recentPlannedCount = Math.max(1, Math.round(28 * (5 / 7))); // assume ~5 sessions/week
    const adherencePct = Math.max(0, Math.min(100, Math.round((recentCompleted.length / recentPlannedCount) * 100)));
    // Vert progress in last 4 weeks vs race D+
    const recentVert = recentCompleted.reduce((s, c) => s + (c.actual_elevation_m ?? 0), 0);
    const vertTarget = nextRaceA.elevation_gain_m * 4; // ~4× race vert across 4 weeks (Lyss)
    const vertPct = Math.max(0, Math.min(100, Math.round((recentVert / Math.max(1, vertTarget)) * 100)));
    return { daysToRace, timePct, adherencePct, vertPct, recentVert, vertTarget };
  })();

  const readinessStatus = readinessAdvanced?.status ?? null;
  const readinessAccent =
    readinessStatus === "green" ? "bg-emerald-300 text-emerald-950" :
    readinessStatus === "yellow" ? "bg-amber-300 text-amber-950" :
    readinessStatus === "red" ? "bg-rose-300 text-rose-950" :
    "bg-primary-foreground/20 text-primary-foreground";

  return (
    <div className="space-y-6 animate-fade-in">
      {userId && <WelcomeDialog userId={userId} />}
      {/* Hero greeting + readiness + race progress */}
      <Card className="p-5 bg-gradient-to-br from-primary via-primary/90 to-primary/70 border-primary/50 text-primary-foreground shadow-lg space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold">
              {t("dash.hello")}{athleteName ? `, ${athleteName}` : ""} 👋
            </h1>
            <p className="text-sm opacity-90 mt-1 capitalize">
              {format(new Date(), "EEEE", { locale: dateLocale })} · {format(new Date(), "dd/MM/yyyy")}
            </p>
          </div>
          {readinessAdvanced && (
            <div className={`rounded-xl px-3 py-2 flex items-center gap-2 shrink-0 ${readinessAccent}`}>
              <HeartPulse className="w-5 h-5" strokeWidth={2.5} />
              <div className="leading-tight">
                <div className="text-[9px] uppercase tracking-wide opacity-80">{t("dash.readiness")}</div>
                <div className="text-sm font-bold">{readinessAdvanced.score}/100 · {readinessAdvanced.label}</div>
              </div>
            </div>
          )}
        </div>
        {readinessAdvanced?.recommendation && (
          <p className="text-xs opacity-90 -mt-1">{readinessAdvanced.recommendation}</p>
        )}
        {raceProgress && nextRaceA && (
          <div className="pt-3 border-t border-primary-foreground/20 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <Flag className="w-3.5 h-3.5" /> {nextRaceA.name}
              </span>
              <span className="opacity-90">{raceProgress.daysToRace} {t("dash.daysToGo")}</span>
            </div>
            <ProgressBar label={t("dash.timeProgress")} pct={raceProgress.timePct} />
            <ProgressBar label={t("dash.adherence")} pct={raceProgress.adherencePct} />
            <ProgressBar label={t("dash.vertProgress")} pct={raceProgress.vertPct} hint={`${raceProgress.recentVert} / ${raceProgress.vertTarget} m`} />
          </div>
        )}
      </Card>

      {/* Aviso nutrição */}
      {longSession && !todayCompleted && (
        <Card className="p-3 border-l-4 border-l-primary bg-primary/5 flex items-center gap-3">
          <Apple className="w-5 h-5 text-primary shrink-0" />
          <div className="text-xs">
            <strong className="text-sm">{t("dash.nutritionHint")}</strong>
          </div>
        </Card>
      )}

      {/* Biometria de hoje — destaque máximo se ainda não registou */}
      {!todayBio && (
        <Link to="/biometrics" className="block group">
          <Card className="p-5 flex items-center justify-between gap-3 flex-wrap border-2 border-amber-500/60 bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-amber-500/10 hover:from-amber-500/30 hover:to-orange-500/20 transition-all cursor-pointer shadow-lg shadow-amber-500/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full bg-amber-500/25 flex items-center justify-center shrink-0 ring-2 ring-amber-500/40 animate-pulse">
                <HeartPulse className="w-5 h-5 text-amber-600 dark:text-amber-400" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-900 dark:text-amber-200">{t("dash.bioTodayMissing")}</div>
                <div className="text-xs text-amber-800/80 dark:text-amber-200/70 mt-0.5">HRV · sono · soreness · mood</div>
              </div>
            </div>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
              <Plus className="w-4 h-4" /> {t("dash.bioCta")}
            </Button>
          </Card>
        </Link>
      )}

      {/* Treino de hoje */}
      <Card className="p-6 border-primary/30">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-primary mb-1">{t("dash.todayWorkout")}</div>
            {todayWorkout ? (
              <>
                <h2 className="text-xl font-bold text-foreground">{todayWorkout.title}</h2>
                <div className="flex gap-3 mt-2 text-sm flex-wrap text-muted-foreground">
                  {todayWorkout.target_distance_km != null && <span><strong className="text-foreground">{todayWorkout.target_distance_km}</strong> km</span>}
                  {todayWorkout.target_elevation_m != null && todayWorkout.target_elevation_m > 0 && <span><strong className="text-foreground">{todayWorkout.target_elevation_m}</strong> D+</span>}
                  {todayWorkout.target_duration_min != null && <span>{fmtDuration(todayWorkout.target_duration_min)}</span>}
                  {todayWorkout.target_pace_sec_per_km != null && <span>{fmtPace(todayWorkout.target_pace_sec_per_km)}</span>}
                  {todayGap != null && todayGap !== todayWorkout.target_pace_sec_per_km && (
                    <Badge variant="outline" className="text-[10px]">GAP {fmtPace(todayGap)}</Badge>
                  )}
                </div>
                {todayWorkout.description && (
                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed line-clamp-3">{todayWorkout.description}</p>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold">{t("dash.noWorkout")}</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("dash.addRaceHint", { link: "" }).split("{link}")[0]}
                  <Link to="/races" className="text-primary underline">{t("nav.races")}</Link>
                </p>
              </>
            )}
          </div>
          <Link to="/calendar">
            <Button>
              {todayCompleted ? t("nav.calendar") : t("dash.registerWorkout")}
            </Button>
          </Link>
        </div>
        {todayCompleted && (
          <div className="mt-4 pt-4 border-t border-border/40 flex gap-3 text-sm flex-wrap">
            <Badge variant="secondary">{t("dash.done")}</Badge>
            {todayCompleted.actual_distance_km != null && <span>{todayCompleted.actual_distance_km} km</span>}
            {todayCompleted.actual_elevation_m != null && <span>{todayCompleted.actual_elevation_m} D+</span>}
            {todayCompleted.rpe != null && <Badge variant="outline">RPE {todayCompleted.rpe}/10</Badge>}
          </div>
        )}
      </Card>


      <DailyCoachCard todayWorkout={todayWorkout} todayBio={todayBio} readiness={readiness} onApplied={fetchAll} />

      {/* Mountain Index — sempre visível */}
      <MountainIndexCard
        totalKm={historyCompleted.reduce((s, c) => s + (c.actual_distance_km ?? 0), 0)}
        totalVert={historyCompleted.reduce((s, c) => s + (c.actual_elevation_m ?? 0), 0)}
        nextRace={nextRaceA ? { name: nextRaceA.name, distance_km: nextRaceA.distance_km, elevation_gain_m: nextRaceA.elevation_gain_m } : null}
      />

      {/* Próxima Prova A — resumo simples */}
      {nextRaceA && (
        <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Flag className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dash.nextRace")}</div>
              <div className="text-sm font-semibold truncate">{nextRaceA.name}</div>
              <div className="text-xs text-muted-foreground">
                {differenceInDays(parseISO(nextRaceA.race_date), new Date())}d · {nextRaceA.distance_km}km · {nextRaceA.elevation_gain_m}D+
              </div>
            </div>
          </div>
          <Link to="/races"><Button size="sm" variant="outline">{t("nav.races")}</Button></Link>
        </Card>
      )}

      {/* Mais métricas — colapsável */}
      <Collapsible open={showMore} onOpenChange={setShowMore}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {showMore ? t("dash.lessMetrics") : t("dash.moreMetrics")}
            </span>
            {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard
              icon={Activity}
              label={t("dash.weekVolume")}
              value={`${weekKm.toFixed(1)} km`}
              hint={`alvo ${targetKm.toFixed(0)} km`}
            />
            <StatCard
              icon={Mountain}
              label={t("dash.weekVert")}
              value={`${weekVert} m`}
              hint={`${targetVert} m`}
            />
            <StatCard
              icon={HeartPulse}
              label={t("dash.readiness")}
              value={readiness != null ? String(readiness) : "—"}
              hint={t("nav.biometrics")}
              to="/biometrics"
            />
          </div>
          <TrainingLoadChart completed={historyCompleted} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  to?: string;
}) {
  const inner = (
    <Card className="p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground truncate">{hint}</div>}
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function ProgressBar({ label, pct, hint }: { label: string; pct: number; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-medium">
        <span>{label}</span>
        <span className="opacity-90">{hint ?? `${pct}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-primary-foreground/20 overflow-hidden">
        <div
          className="h-full bg-primary-foreground transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
