import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Flame, ChevronDown, ChevronUp, Search } from "lucide-react";
import { format } from "date-fns";
import {
  getMobilitySuggestions,
  getRecoveryRoutine,
  totalRoutineMinutes,
  STRETCHING_LIBRARY,
  type MobilitySuggestion,
  type StretchExercise,
  type MuscleZone,
  type StretchTiming,
} from "@/lib/stretching";

const ZONE_LABELS: Record<MuscleZone, string> = {
  quadriceps: "Quadríceps",
  hamstrings: "Isquiotibiais",
  calves: "Gémeos",
  hip_flexors: "Flexores da anca",
  glutes: "Glúteos",
  it_band: "IT Band",
  lower_back: "Lombar",
  upper_back: "Dorsal",
  shoulders: "Ombros",
  ankles: "Tornozelos",
  feet: "Pés",
  full_body: "Corpo todo",
};

const TIMING_LABELS: Record<StretchTiming, string> = {
  before: "Pré-treino",
  after: "Pós-treino",
  anytime: "Qualquer altura",
};

export default function MobilityPage() {
  const { userId } = useEffectiveUser();
  const [todayBio, setTodayBio] = useState<any>(null);
  const [lastWorkout, setLastWorkout] = useState<any>(null);
  const [mobilitySuggestions, setMobilitySuggestions] = useState<MobilitySuggestion[]>([]);
  const [mobilityContext, setMobilityContext] = useState<"post_workout" | "recovery" | "general">("general");
  const [loading, setLoading] = useState(true);

  // Biblioteca
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<MuscleZone | "all">("all");
  const [timingFilter, setTimingFilter] = useState<StretchTiming | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "active" | "static">("all");

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");

    const [{ data: bio }, { data: lastW }] = await Promise.all([
      supabase.from("daily_biometrics").select("*").eq("user_id", userId)
        .eq("measurement_date", today).maybeSingle(),
      supabase.from("completed_workouts")
        .select("*, planned_workouts(workout_type, title)")
        .eq("user_id", userId)
        .order("workout_date", { ascending: false })
        .limit(1).maybeSingle(),
    ]);

    setTodayBio(bio);
    setLastWorkout(lastW);

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
        maxResults: 8,
      });
    } else if (sorenessZones && sorenessZones.length > 0) {
      context = "recovery";
      suggestions = getMobilitySuggestions({
        sorenessZones,
        timing: "anytime",
        maxResults: 8,
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const sorenessZones = todayBio?.soreness_zones as string[] | null;
  const totalMin = totalRoutineMinutes(mobilitySuggestions.map(s => s.exercise));
  const hasHighUrgency = mobilitySuggestions.some(s => s.urgency === "high");

  const contextInfo = {
    post_workout: {
      label: `Pós-treino — ${(lastWorkout as any)?.planned_workouts?.title ?? "último treino"}`,
      desc: "Programa de recuperação muscular baseado no treino de hoje.",
    },
    recovery: {
      label: "Recuperação activa",
      desc: "Exercícios prioritários para as zonas com tensão/dor reportada.",
    },
    general: {
      label: "Rotina base",
      desc: "Programa geral de mobilidade para trail runners.",
    },
  }[mobilityContext];

  const filteredLibrary = STRETCHING_LIBRARY.filter(ex => {
    const matchSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase()) ||
      ex.zones.some(z => ZONE_LABELS[z].toLowerCase().includes(search.toLowerCase()));
    const matchZone = zoneFilter === "all" || ex.zones.includes(zoneFilter);
    const matchTiming = timingFilter === "all" || ex.timing.includes(timingFilter);
    const matchType = typeFilter === "all" || (typeFilter === "active" ? ex.isActive : !ex.isActive);
    return matchSearch && matchZone && matchTiming && matchType;
  });

  const allZones = Array.from(new Set(STRETCHING_LIBRARY.flatMap(e => e.zones))) as MuscleZone[];

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted/30" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      <Tabs defaultValue="program">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="program">🧘 Programa de hoje</TabsTrigger>
          <TabsTrigger value="library">
            📚 Biblioteca ({STRETCHING_LIBRARY.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Programa de hoje ── */}
        <TabsContent value="program" className="space-y-4 mt-4">

          {/* Contexto */}
          <Card className="p-4 flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <div className="font-semibold text-foreground">{contextInfo.label}</div>
              <div className="text-sm text-muted-foreground">{contextInfo.desc}</div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                ~{totalMin} min
              </span>
              <span>{mobilitySuggestions.length} exercícios</span>
              {hasHighUrgency && (
                <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-xs">
                  Prioritário
                </Badge>
              )}
            </div>
          </Card>

          {/* Dor reportada */}
          {sorenessZones && sorenessZones.length > 0 && (
            <Card className="p-3 border-amber-500/40 flex items-start gap-3">
              <Flame className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-sm font-medium text-amber-500">Tensão/dor reportada: </span>
                <span className="text-sm text-foreground">{sorenessZones.join(", ")}</span>
                <div className="text-xs text-muted-foreground mt-1">Os exercícios abaixo priorizam estas zonas musculares.</div>
              </div>
            </Card>
          )}

          {/* Exercícios */}
          <div className="space-y-3">
            {mobilitySuggestions.map((s, i) => (
              <MobilityCard key={s.exercise.id} suggestion={s} index={i + 1} />
            ))}
          </div>

          {!sorenessZones?.length && mobilityContext === "general" && (
            <Card className="p-4 text-center space-y-1">
              <div className="text-sm font-medium text-foreground">Personaliza o programa</div>
              <p className="text-xs text-muted-foreground">
                Regista a biometria diária com as zonas de dor para receber sugestões específicas.
              </p>
            </Card>
          )}
        </TabsContent>

        {/* ── Biblioteca ── */}
        <TabsContent value="library" className="space-y-4 mt-4">
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar exercício ou zona muscular..." className="pl-9" />
            </div>

            <div className="flex gap-2 flex-wrap">
              {(["all", "before", "after", "anytime"] as const).map(t => (
                <Button key={t} size="sm" variant={timingFilter === t ? "default" : "outline"}
                  onClick={() => setTimingFilter(t)}>
                  {t === "all" ? "Todos" : TIMING_LABELS[t]}
                </Button>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              {(["all", "active", "static"] as const).map(t => (
                <Button key={t} size="sm" variant={typeFilter === t ? "default" : "outline"}
                  onClick={() => setTypeFilter(t)}>
                  {t === "all" ? "Activo + Estático" : t === "active" ? "Só activos" : "Só estáticos"}
                </Button>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant={zoneFilter === "all" ? "default" : "outline"}
                onClick={() => setZoneFilter("all")}>Todas as zonas</Button>
              {allZones.map(z => (
                <Button key={z} size="sm" variant={zoneFilter === z ? "default" : "outline"}
                  onClick={() => setZoneFilter(z)}>
                  {ZONE_LABELS[z]}
                </Button>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">{filteredLibrary.length} exercícios</div>

          <div className="space-y-3">
            {filteredLibrary.map((ex) => (
              <LibraryCard key={ex.id} exercise={ex} />
            ))}
            {filteredLibrary.length === 0 && (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                Nenhum exercício encontrado com esses filtros.
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Card exercício programa ───────────────────────────────────────────────────

function MobilityCard({ suggestion, index }: { suggestion: MobilitySuggestion; index: number }) {
  const { exercise, reason, urgency } = suggestion;
  const [expanded, setExpanded] = useState(false);

  const leftBorder = urgency === "high"
    ? "border-l-4 border-l-amber-500"
    : urgency === "medium"
    ? "border-l-4 border-l-primary"
    : "";

  const badgeStyle = urgency === "high"
    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
    : urgency === "medium"
    ? "bg-primary/15 text-primary border-primary/30"
    : "bg-muted text-muted-foreground border-border";

  const badgeLabel = urgency === "high" ? "Prioritário" : urgency === "medium" ? "Recomendado" : "Geral";

  const durationLabel = exercise.duration_sec >= 60
    ? `${Math.round(exercise.duration_sec / 60)} min`
    : `${exercise.duration_sec} seg`;
  const setsLabel = exercise.sets > 1
    ? `${exercise.sets}× ${durationLabel} por lado`
    : `${durationLabel} por lado`;

  return (
    <Card className={`overflow-hidden ${leftBorder}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-sm font-bold text-muted-foreground shrink-0 w-6 pt-0.5">{index}.</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">{exercise.name}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{reason}</div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className={`text-[10px] ${badgeStyle}`}>{badgeLabel}</Badge>
                <span className="text-xs text-muted-foreground">{setsLabel}</span>
                <Badge variant="outline" className="text-[10px]">
                  {exercise.isActive ? "⚡ Activo" : "🧘 Estático"}
                </Badge>
                {exercise.zones.slice(0, 2).map(z => (
                  <Badge key={z} variant="secondary" className="text-[10px]">{ZONE_LABELS[z]}</Badge>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
            <p className="text-sm text-foreground leading-relaxed">{exercise.instructions}</p>
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 flex items-start gap-2">
              <span className="text-primary text-sm shrink-0">💡</span>
              <p className="text-sm text-primary italic leading-relaxed">{exercise.cue}</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Card biblioteca ───────────────────────────────────────────────────────────

function LibraryCard({ exercise }: { exercise: StretchExercise }) {
  const [expanded, setExpanded] = useState(false);

  const durationLabel = exercise.duration_sec >= 60
    ? `${Math.round(exercise.duration_sec / 60)} min`
    : `${exercise.duration_sec} seg`;
  const setsLabel = exercise.sets > 1
    ? `${exercise.sets}× ${durationLabel} por lado`
    : `${durationLabel} por lado`;

  return (
    <Card className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">{exercise.name}</span>
              <Badge variant="outline" className="text-[10px]">
                {exercise.isActive ? "⚡ Activo" : "🧘 Estático"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {setsLabel}
              </span>
              {exercise.timing.map(t => (
                <Badge key={t} variant="outline" className="text-[10px] text-muted-foreground border-border/40">
                  {TIMING_LABELS[t]}
                </Badge>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {exercise.zones.map(z => (
                <Badge key={z} variant="secondary" className="text-[10px]">{ZONE_LABELS[z]}</Badge>
              ))}
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
            <p className="text-sm text-foreground leading-relaxed">{exercise.instructions}</p>
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 flex items-start gap-2">
              <span className="text-primary text-sm shrink-0">💡</span>
              <p className="text-sm text-primary italic leading-relaxed">{exercise.cue}</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
