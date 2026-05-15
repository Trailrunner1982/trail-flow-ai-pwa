import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dumbbell, Plus, CheckCircle2, Calendar, Search, Video, Flame, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useLanguage, getDateLocale } from "@/lib/i18n";
import { StrengthSessionDialog } from "@/components/strength/StrengthSessionDialog";
import { NewStrengthSessionDialog } from "@/components/strength/NewStrengthSessionDialog";
import {
  getMobilitySuggestions, getRecoveryRoutine, totalRoutineMinutes,
  type MobilitySuggestion, type StretchExercise,
} from "@/lib/stretching";

export default function StrengthPage() {
  const { userId } = useEffectiveUser();
  const { t, lang } = useLanguage();
  const dateLocale = getDateLocale(lang);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Mobilidade
  const [todayBio, setTodayBio] = useState<any>(null);
  const [lastWorkout, setLastWorkout] = useState<any>(null);
  const [mobilitySuggestions, setMobilitySuggestions] = useState<MobilitySuggestion[]>([]);
  const [mobilityContext, setMobilityContext] = useState<"post_workout" | "recovery" | "general">("general");

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");

    const [{ data: s }, { data: ex }, { data: bio }, { data: lastW }] = await Promise.all([
      supabase.from("strength_sessions").select("*").eq("user_id", userId)
        .order("session_date", { ascending: false }).limit(50),
      supabase.from("strength_exercises").select("*").order("name"),
      supabase.from("daily_biometrics").select("*").eq("user_id", userId)
        .eq("measurement_date", today).maybeSingle(),
      supabase.from("completed_workouts")
        .select("*, planned_workouts(workout_type, title)")
        .eq("user_id", userId)
        .order("workout_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setSessions(s ?? []);
    setExercises(ex ?? []);
    setTodayBio(bio);
    setLastWorkout(lastW);

    // Calcular sugestões de mobilidade
    const sorenessZones = bio?.soreness_zones as string[] | null;
    const lastType = (lastW as any)?.planned_workouts?.workout_type ?? null;
    const lastRpe = lastW?.rpe ?? null;
    const lastDuration = lastW?.actual_duration_min ?? null;
    const lastDate = lastW?.workout_date;
    const isToday = lastDate === today;

    let context: "post_workout" | "recovery" | "general" = "general";
    let suggestions: MobilitySuggestion[] = [];

    if (isToday && lastType) {
      context = "post_workout";
      suggestions = getMobilitySuggestions({
        workoutType: lastType,
        workoutDurationMin: lastDuration,
        rpe: lastRpe,
        sorenessZones,
        timing: "after",
        maxResults: 7,
      });
    } else if (sorenessZones && sorenessZones.length > 0) {
      context = "recovery";
      suggestions = getMobilitySuggestions({
        sorenessZones,
        timing: "anytime",
        maxResults: 7,
      });
    } else {
      context = "general";
      suggestions = getRecoveryRoutine().map(ex => ({
        exercise: ex,
        reason: "Mobilidade geral para trail runner",
        urgency: "low" as const,
      }));
    }

    setMobilitySuggestions(suggestions);
    setMobilityContext(context);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return <LoadingScreen />;

  const upcoming = sessions.filter((s) => !s.is_completed);
  const done = sessions.filter((s) => s.is_completed);

  const filteredExercises = exercises.filter((e) => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const categories = ["all", "legs", "push", "pull", "core", "plyo", "specific", "mobility"];
  const hasHighUrgency = mobilitySuggestions.some(s => s.urgency === "high");
  const totalMin = totalRoutineMinutes(mobilitySuggestions.map(s => s.exercise));

  const contextLabel = {
    post_workout: `Pós-treino — ${(lastWorkout as any)?.planned_workouts?.title ?? "último treino"}`,
    recovery: "Com base na tensão/dor reportada hoje",
    general: "Rotina de mobilidade geral para trail",
  }[mobilityContext];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 text-foreground">
            <Dumbbell className="w-6 h-6 text-primary" /> {t("strength.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("strength.subtitle")}</p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="w-4 h-4" /> {t("strength.new.button")}
        </Button>
      </div>

      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions">
            <Calendar className="w-3.5 h-3.5 mr-1" />
            {t("strength.tab.sessions")}
          </TabsTrigger>
          <TabsTrigger value="mobility" className="relative">
            🧘 Mobilidade
            {hasHighUrgency && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-amber-500 inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="library">
            <Dumbbell className="w-3.5 h-3.5 mr-1" />
            {t("strength.tab.library")} ({exercises.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Sessões ── */}
        <TabsContent value="sessions" className="space-y-4">
          {sessions.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <Dumbbell className="w-10 h-10 text-muted-foreground/50 mx-auto" />
              <div className="font-medium text-foreground">{t("strength.empty.title")}</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">{t("strength.empty.desc")}</p>
              <Button onClick={() => setNewOpen(true)}><Plus className="w-4 h-4" /> {t("strength.new.button")}</Button>
            </Card>
          ) : (
            <>
              {upcoming.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    {t("strength.upcoming")} ({upcoming.length})
                  </div>
                  <div className="grid gap-2">
                    {upcoming.map((s) => (
                      <SessionCard key={s.id} s={s} dateLocale={dateLocale} onOpen={() => setOpenSession(s.id)} />
                    ))}
                  </div>
                </div>
              )}
              {done.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    {t("strength.done")} ({done.length})
                  </div>
                  <div className="grid gap-2">
                    {done.map((s) => (
                      <SessionCard key={s.id} s={s} dateLocale={dateLocale} onOpen={() => setOpenSession(s.id)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Mobilidade ── */}
        <TabsContent value="mobility" className="space-y-4">
          {/* Contexto */}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-medium text-foreground">Programa de hoje</div>
              <div className="text-xs text-muted-foreground">{contextLabel}</div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> ~{totalMin} min</span>
              <span>{mobilitySuggestions.length} exercícios</span>
            </div>
          </div>

          {/* Dor reportada */}
          {todayBio?.soreness_zones?.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
              <Flame className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-medium text-amber-500">Tensão/dor reportada: </span>
                <span className="text-muted-foreground">{(todayBio.soreness_zones as string[]).join(", ")}</span>
                <div className="mt-1 text-muted-foreground">Os exercícios abaixo priorizam essas zonas.</div>
              </div>
            </div>
          )}

          {/* Exercícios */}
          <div className="space-y-3">
            {mobilitySuggestions.map((s, i) => (
              <MobilityCard key={s.exercise.id} suggestion={s} index={i + 1} />
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border/40">
            Actualiza a biometria diária para sugestões personalizadas com base na tua recuperação.
          </p>
        </TabsContent>

        {/* ── Biblioteca ── */}
        <TabsContent value="library" className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("strength.lib.search")} className="pl-9" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {categories.map((c) => (
                <Button key={c} size="sm" variant={categoryFilter === c ? "default" : "outline"}
                  onClick={() => setCategoryFilter(c)}>
                  {c === "all" ? t("strength.lib.all") : c}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {filteredExercises.map((ex) => (
              <Card key={ex.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm text-foreground">{ex.name}</div>
                  <Badge variant="outline" className="text-[10px] capitalize">{ex.category}</Badge>
                </div>
                {ex.description && <p className="text-xs text-muted-foreground">{ex.description}</p>}
                {ex.cues && <p className="text-xs italic text-foreground/70">💡 {ex.cues}</p>}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {ex.equipment && <Badge variant="secondary" className="text-[9px]">{ex.equipment}</Badge>}
                  {ex.video_url && (
                    <a href={ex.video_url} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline">
                      <Video className="w-3 h-3" /> {t("strength.exercise.watchVideo")}
                    </a>
                  )}
                </div>
              </Card>
            ))}
            {filteredExercises.length === 0 && (
              <Card className="p-6 text-center text-sm text-muted-foreground sm:col-span-2">
                {t("strength.lib.noResults")}
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <StrengthSessionDialog
        open={!!openSession} onOpenChange={(o) => !o && setOpenSession(null)}
        sessionId={openSession} onChanged={fetchAll} />
      <NewStrengthSessionDialog
        open={newOpen} onOpenChange={setNewOpen} onCreated={fetchAll} />
    </div>
  );
}

// ── Card de exercício de mobilidade ──────────────────────────────────────────

function MobilityCard({ suggestion, index }: { suggestion: MobilitySuggestion; index: number }) {
  const { exercise, reason, urgency } = suggestion;
  const [expanded, setExpanded] = useState(false);

  const borderColors = {
    high: "border-amber-500/40 bg-amber-500/5",
    medium: "border-primary/30 bg-primary/5",
    low: "border-border/60 bg-card/40",
  };
  const badgeColors = {
    high: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    medium: "bg-primary/15 text-primary border-primary/30",
    low: "bg-muted text-muted-foreground border-border",
  };
  const badgeLabel = { high: "Prioritário", medium: "Recomendado", low: "Geral" };

  const durationLabel = exercise.duration_sec >= 60
    ? `${Math.round(exercise.duration_sec / 60)} min`
    : `${exercise.duration_sec} seg`;
  const setsLabel = exercise.sets > 1
    ? `${exercise.sets}× ${durationLabel} por lado`
    : `${durationLabel} por lado`;

  return (
    <Card className={`border ${borderColors[urgency]}`}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span className="text-xs font-bold text-muted-foreground mt-0.5 shrink-0 w-5">{index}.</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm text-foreground">{exercise.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{reason}</div>
            </div>
          </div>
          <button onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant="outline" className={`text-[10px] ${badgeColors[urgency]}`}>
            {badgeLabel[urgency]}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{setsLabel}</span>
          <Badge variant="outline" className="text-[10px]">
            {exercise.isActive ? "Activo" : "Estático"}
          </Badge>
        </div>

        {expanded && (
          <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
            <p className="text-sm text-foreground/90 leading-relaxed">{exercise.instructions}</p>
            <div className="flex items-start gap-1.5 bg-primary/10 rounded px-2 py-1.5">
              <span className="text-primary text-xs shrink-0">💡</span>
              <p className="text-xs text-primary/90 italic">{exercise.cue}</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function SessionCard({ s, dateLocale, onOpen }: { s: any; dateLocale: any; onOpen: () => void }) {
  return (
    <Card onClick={onOpen} className="p-3 cursor-pointer hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{s.session_type}</Badge>
            {s.phase && <Badge variant="outline" className="text-[10px]">{s.phase}</Badge>}
            {s.is_completed && (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> RPE {s.rpe ?? "—"}
              </Badge>
            )}
          </div>
          <div className="font-medium text-sm text-foreground">{s.title}</div>
          <div className="text-xs text-muted-foreground">
            {format(parseISO(s.session_date), "EEEE dd MMM", { locale: dateLocale })}
            {s.duration_min ? ` · ${s.duration_min} min` : ""}
          </div>
        </div>
      </div>
    </Card>
  );
}
