import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Flag, Plus, Pencil, Trash2, Sparkles, MountainSnow, ShieldCheck, Loader2, Apple, Trophy, Calendar } from "lucide-react";
import { RaceFuelingDialog } from "@/components/RaceFuelingDialog";
import { format, differenceInWeeks, parseISO, addWeeks, addDays, differenceInDays, startOfWeek, getDay } from "date-fns";
import { pt, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { parseDateLocal, deriveRacePace, paceForZone, type GoalType } from "@/lib/planner";
import { useLanguage } from "@/lib/i18n";

type Priority = "A" | "B" | "C";
type Terrain = "rolling" | "big_climbs" | "sustained" | "mixed";
type RaceType = "official" | "training_goal";

interface Race {
  id: string;
  name: string;
  race_date: string;
  distance_km: number;
  elevation_gain_m: number;
  priority: Priority;
  goal_type: GoalType;
  terrain_profile: Terrain;
  target_time_minutes: number | null;
  target_pace_sec_per_km: number | null;
  notes: string | null;
  race_type: RaceType;
  itra_points: number | null;
  is_atrp: boolean | null;
  result_position: number | null;
  result_time_min: number | null;
}

interface PlannedWorkout {
  workout_date: string;
  workout_type: string;
  zone: string | null;
  target_distance_km: number | null;
  target_elevation_m: number | null;
  target_duration_min: number | null;
  target_pace_sec_per_km: number | null;
  title: string;
  description: string;
  week_number: number;
  phase: string;
  race_id?: string;
}

const emptyForm = {
  name: "",
  race_date: format(new Date(), "yyyy-MM-dd"),
  distance_km: "42",
  elevation_gain_m: "2000",
  priority: "A" as Priority,
  goal_type: "finish" as GoalType,
  terrain_profile: "mixed" as Terrain,
  target_time_minutes: "",
  target_pace_sec_per_km: "",
  notes: "",
  race_type: "official" as RaceType,
  itra_points: "",
  is_atrp: false,
  result_position: "",
  result_time_min: "",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  A: "bg-primary/20 text-primary border-primary/40",
  B: "bg-secondary text-foreground border-border",
  C: "bg-muted text-muted-foreground border-border",
};

const GOAL_LABELS: Record<GoalType, string> = {
  finish: "Terminar a distância",
  target_time: "Tempo alvo",
  target_pace: "Pace alvo",
  target_distance: "Distância alvo (sem tempo)",
  target_elevation: "Altimetria alvo (D+)",
};

// ── Helpers locais de data/dia ────────────────────────────────
function offsetForDow(weekStart: Date, dow: number): number {
  const s = getDay(weekStart);
  let o = dow - s;
  if (o < 0) o += 7;
  return o;
}

function dateForDow(weekStart: Date, dow: number): string {
  const d = addDays(weekStart, offsetForDow(weekStart, dow));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Planner de época ──────────────────────────────────────────
type Zone = "Z1" | "Z2" | "Z3" | "Z4" | "Z5";

interface SeasonEvent {
  id: string;
  date: string;
  name: string;
  priority: Priority;
  distance_km: number;
  elevation_gain_m: number;
  terrain_profile: string;
  goal_type: GoalType;
  target_time_minutes: number | null;
  target_pace_sec_per_km: number | null;
}

function generateSeasonPlan(params: {
  events: SeasonEvent[];
  baselineKm: number;
  baselinePace: number;
  availableRunDays: number[];
  availableStrengthDays: number[];
  longRunDay: number;
}): PlannedWorkout[] {
  const { events, baselineKm, baselinePace, availableRunDays, availableStrengthDays, longRunDay } = params;

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const futureEvents = events
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (futureEvents.length === 0) return [];

  const allWorkouts: PlannedWorkout[] = [];
  const usedDates = new Set<string>();

  const addW = (w: PlannedWorkout) => {
    const key = `${w.workout_date}-${w.workout_type}`;
    if (!usedDates.has(key)) { usedDates.add(key); allWorkouts.push(w); }
  };

  const runDaysWithoutLong = availableRunDays.filter(d => d !== longRunDay);
  const qualityDays = runDaysWithoutLong.slice(0, 2);
  const easyDays = runDaysWithoutLong.slice(2);
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const activeDays = new Set([...availableRunDays, ...availableStrengthDays]);
  const restDays = allDays.filter(d => !activeDays.has(d));

  let blockStart = today;

  for (let ei = 0; ei < futureEvents.length; ei++) {
    const event = futureEvents[ei];
    const eventDate = parseDateLocal(event.date);

    // Pace de treino derivado do objetivo desta prova específica
    const racePace = deriveRacePace(
      event.goal_type,
      event.target_time_minutes,
      event.target_pace_sec_per_km,
      event.distance_km,
      event.elevation_gain_m,
      baselinePace,
    );

    const totalDays = differenceInDays(eventDate, blockStart);
    if (totalDays < 3) {
      allWorkouts.push({
        workout_date: event.date,
        workout_type: "race",
        zone: null,
        target_distance_km: event.distance_km,
        target_elevation_m: event.elevation_gain_m,
        target_duration_min: event.target_time_minutes ?? null,
        target_pace_sec_per_km: event.goal_type === "target_pace" ? event.target_pace_sec_per_km : null,
        title: `🏁 ${event.priority === "A" ? "" : `Prova ${event.priority}: `}${event.name} — ${event.distance_km}km / ${event.elevation_gain_m}D+`,
        description: event.priority === "A"
          ? "Dia da prova âncora! Executa o teu plano de nutrição. Começa conservador."
          : `Prova de prioridade ${event.priority}. Usa como simulação — começa controlado.`,
        week_number: 0,
        phase: "Prova",
        race_id: event.id,
      });
      blockStart = addDays(eventDate, 1);
      continue;
    }

    const totalWeeks = Math.ceil(totalDays / 7);
    const planStart = startOfWeek(blockStart, { weekStartsOn: 1 });
    const recoveryWeeks = event.priority === "A" ? 2 : event.priority === "B" ? 1 : 0;

    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = addDays(planStart, w * 7);
      const weeksToEvent = totalWeeks - w - 1;

      if (format(addDays(weekStart, 6), "yyyy-MM-dd") < todayStr) continue;

      let phase = "Base";
      if (weeksToEvent <= 1) phase = "Taper";
      else if (weeksToEvent <= 3) phase = "Pico";
      else if (weeksToEvent <= Math.ceil(totalWeeks * 0.45)) phase = "Específico";

      let volFactor = 1.0;
      if (w < recoveryWeeks) volFactor = 0.5;
      if (weeksToEvent === 1) volFactor = 0.5;
      if (weeksToEvent === 0) volFactor = 0.25;
      if ((w + 1) % 4 === 0 && weeksToEvent > 3) volFactor = 0.75;

      const peakKm = Math.max(baselineKm * 1.8, event.distance_km * 1.1);
      const progressRatio = Math.min(Math.max(w - recoveryWeeks, 0) / Math.max(totalWeeks - recoveryWeeks - 2, 1), 1);
      const targetKm = Math.round((baselineKm + (peakKm - baselineKm) * progressRatio) * volFactor);
      const targetVert = Math.round(event.elevation_gain_m * (0.3 + 0.7 * progressRatio) * volFactor);

      const longRunKm = Math.max(Math.round(targetKm * 0.35), Math.round(event.distance_km * 0.25));
      const qualityKm = Math.round(targetKm * 0.15);
      const easyKm = Math.round(targetKm * 0.20);
      const vertKm = Math.round(targetKm * 0.18);
      const recovKm = Math.max(targetKm - longRunKm - qualityKm - easyKm - vertKm, 0);
      const isRBE = weeksToEvent === 3;

      // Nas semanas de recuperação pós-prova anterior usamos baselinePace (esforço leve)
      // Nas semanas normais usamos racePace (treino orientado ao objetivo)
      const weekPace = w < recoveryWeeks ? baselinePace : racePace;

      const addOnDay = (
        dow: number, type: string, zone: Zone | null,
        title: string, desc: string,
        km: number | null = null, vert: number | null = null,
        dur: number | null = null, pace: number | null = null,
      ) => {
        const dateStr = dateForDow(weekStart, dow);
        if (dateStr < todayStr || dateStr > event.date) return;
        addW({
          workout_date: dateStr, workout_type: type as any, zone,
          target_distance_km: km, target_elevation_m: vert,
          target_duration_min: dur, target_pace_sec_per_km: pace,
          title, description: desc, week_number: w + 1, phase,
          race_id: event.id,
        });
      };

      // ── Semana da prova ──
      if (weeksToEvent === 0) {
        restDays.forEach(d => addOnDay(d, "rest", null, "Descanso", "Recuperação activa opcional."));
        if (qualityDays[0] !== undefined)
          addOnDay(qualityDays[0], "easy_z2", "Z2", "Soltar pernas 20 min",
            "Trote muito leve. Sem stress.", 4, 0, 20, paceForZone(weekPace, "Z2"));
        if (easyDays[0] !== undefined)
          addOnDay(easyDays[0], "easy_z2", "Z2", "Activação 15 min",
            "Activação suave.", 3, 0, 18, paceForZone(weekPace, "Z2"));
        addW({
          workout_date: event.date,
          workout_type: "race",
          zone: null,
          target_distance_km: event.distance_km,
          target_elevation_m: event.elevation_gain_m,
          target_duration_min: event.target_time_minutes ?? null,
          target_pace_sec_per_km: event.goal_type === "target_pace" ? event.target_pace_sec_per_km : null,
          title: `🏁 ${event.priority === "A" ? "" : `Prova ${event.priority}: `}${event.name} — ${event.distance_km}km / ${event.elevation_gain_m}D+`,
          description: event.priority === "A"
            ? "Dia da prova âncora! Executa o teu plano de nutrição. Começa conservador, acelera na segunda metade."
            : `Prova de prioridade ${event.priority}. Usa como simulação — começa controlado.`,
          week_number: w + 1,
          phase: "Prova",
          race_id: event.id,
        });
        continue;
      }

      // ── Semanas de recuperação pós-prova anterior ──
      if (w < recoveryWeeks) {
        restDays.forEach(d => addOnDay(d, "rest", null, "Descanso", "Recuperação pós-prova."));
        availableRunDays.forEach(d =>
          addOnDay(d, "recovery", "Z1", `Recovery ${Math.round(easyKm * 0.5)} km`,
            "Trote muito leve. Recuperação activa.",
            Math.round(easyKm * 0.5), 0, null, paceForZone(baselinePace, "Z1")));
        continue;
      }

      // ── Semana normal ──
      restDays.forEach(d => addOnDay(d, "rest", null, "Descanso", "Recuperação activa opcional (mobilidade)."));

      if (qualityDays[0] !== undefined) {
        if (phase === "Base") {
          addOnDay(qualityDays[0], "tempo", "Z3", `Tempo run ${qualityKm} km`,
            `Aquecimento 15min Z2 + bloco Z3 contínuo + 10min Z2. Pace alvo: ${formatPaceLocal(paceForZone(weekPace, "Z3"))}.`,
            qualityKm, 0, null, paceForZone(weekPace, "Z3"));
        } else {
          addOnDay(qualityDays[0], "intervals", "Z4", `Intervalos ${qualityKm} km`,
            `Aquecimento 15min Z2 + 6x3min Z4 rec 2min Z1 + 10min Z2. Pace Z4: ${formatPaceLocal(paceForZone(weekPace, "Z4"))}.`,
            qualityKm, 0, null, paceForZone(weekPace, "Z4"));
        }
      }

      if (qualityDays[1] !== undefined)
        addOnDay(qualityDays[1], "easy_z2", "Z2", `Easy Z2 ${easyKm} km`,
          `Conversational. Mantém HR no topo de Z2. Pace: ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.`,
          easyKm, Math.round(targetVert * 0.10), null, paceForZone(weekPace, "Z2"));

      if (easyDays[0] !== undefined)
        addOnDay(easyDays[0], "vert_session", "Z3", `Sessão de Vert ${vertKm} km / ${Math.round(targetVert * 0.45)}D+`,
          "Foco no D+. Power-hike nas rampas acima de 12%.",
          vertKm, Math.round(targetVert * 0.45), null, null);

      if (availableStrengthDays[0] !== undefined)
        addOnDay(availableStrengthDays[0], "strength", null, "Força 30-40 min",
          "Agachamentos, lunges, single leg, core.");

      if (isRBE) {
        addOnDay(longRunDay, "downhill_repeats", "Z3", `Long + Downhill Repeats ${longRunKm} km`,
          "Nos últimos 30 min, 4-6x descidas íngremes. Repeated Bout Effect.",
          longRunKm, Math.round(targetVert * 0.45), null, paceForZone(weekPace, "Z2"));
      } else {
        const terrainDesc =
          event.terrain_profile === "rolling" ? `Trail ondulado — mantém ritmo estável a ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.` :
          event.terrain_profile === "big_climbs" ? `Subidas longas — power-hike acima de 15%. Pace corrível: ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.` :
          `Terreno variado — aproxima-te do perfil da prova. Pace Z2: ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.`;
        addOnDay(longRunDay, "long_run", "Z2", `Long Run ${longRunKm} km / ${Math.round(targetVert * 0.45)}D+`,
          terrainDesc, longRunKm, Math.round(targetVert * 0.45), null, paceForZone(weekPace, "Z2"));
      }

      if (recovKm > 0 && easyDays[1] !== undefined)
        addOnDay(easyDays[1], "recovery", "Z1", `Recovery ${recovKm} km`,
          `Trote muito leve. RPE 2-3. Pace: ${formatPaceLocal(paceForZone(weekPace, "Z1"))}.`,
          recovKm, 0, null, paceForZone(weekPace, "Z1"));
    }

    const recovDays = event.priority === "A" ? 14 : event.priority === "B" ? 5 : 2;
    blockStart = addDays(eventDate, recovDays + 1);
  }

  return allWorkouts;
}

function formatPaceLocal(secPerKm: number | null): string {
  if (!secPerKm) return "--";
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}
// ── Fim do planner ────────────────────────────────────────────

export default function RacesPage() {
  const { userId, canWrite } = useEffectiveUser();
  const { t, lang } = useLanguage();
  const dateLocale = lang === "en" ? enUS : pt;
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingEpoch, setGeneratingEpoch] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Race | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [viability, setViability] = useState<{ race: Race; result: any } | null>(null);
  const [fuelingRace, setFuelingRace] = useState<Race | null>(null);

  const fetchRaces = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("races").select("*").eq("user_id", userId).order("race_date", { ascending: true });
    if (error) toast.error(error.message);
    setRaces((data ?? []) as Race[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchRaces(); }, [fetchRaces]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };

  const openEdit = (r: Race) => {
    setEditing(r);
    setForm({
      name: r.name, race_date: r.race_date,
      distance_km: String(r.distance_km), elevation_gain_m: String(r.elevation_gain_m),
      priority: r.priority, goal_type: r.goal_type, terrain_profile: r.terrain_profile,
      target_time_minutes: r.target_time_minutes ? String(r.target_time_minutes) : "",
      target_pace_sec_per_km: r.target_pace_sec_per_km ? String(r.target_pace_sec_per_km) : "",
      notes: r.notes ?? "", race_type: r.race_type ?? "official",
      itra_points: r.itra_points ? String(r.itra_points) : "",
      is_atrp: r.is_atrp ?? false,
      result_position: r.result_position ? String(r.result_position) : "",
      result_time_min: r.result_time_min ? String(r.result_time_min) : "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!canWrite) return toast.error("Modo Espelho — leitura apenas");
    if (!form.name.trim()) return toast.error("Indica o nome da prova");
    setSaving(true);
    const payload = {
      user_id: userId, name: form.name.trim(), race_date: form.race_date,
      distance_km: Number(form.distance_km), elevation_gain_m: Number(form.elevation_gain_m),
      priority: form.race_type === "training_goal" ? "C" as Priority : form.priority,
      goal_type: form.goal_type, terrain_profile: form.terrain_profile,
      target_time_minutes: form.target_time_minutes ? Number(form.target_time_minutes) : null,
      target_pace_sec_per_km: form.target_pace_sec_per_km ? Number(form.target_pace_sec_per_km) : null,
      notes: form.notes || null, race_type: form.race_type,
      itra_points: form.itra_points ? Number(form.itra_points) : null,
      is_atrp: form.is_atrp,
      result_position: form.result_position ? Number(form.result_position) : null,
      result_time_min: form.result_time_min ? Number(form.result_time_min) : null,
    };
    const { error } = editing
      ? await supabase.from("races").update(payload).eq("id", editing.id)
      : await supabase.from("races").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Prova atualizada" : "Prova criada");
    setOpen(false);
    await fetchRaces();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("races").delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    toast.success("Prova removida");
    setDeleteId(null);
    fetchRaces();
  };

  const handleValidate = async (race: Race) => {
    if (!userId) return;
    setValidatingId(race.id);
    try {
      const { data: profile } = await supabase
        .from("profiles").select("baseline_km_per_week, baseline_avg_pace_sec_per_km").eq("id", userId).single();
      const sinceDate = new Date(); sinceDate.setDate(sinceDate.getDate() - 60);
      const { data: recent } = await supabase
        .from("completed_workouts").select("actual_distance_km").eq("user_id", userId)
        .gte("workout_date", format(sinceDate, "yyyy-MM-dd")).order("actual_distance_km", { ascending: false }).limit(1);
      const recent_long_run_km = recent?.[0]?.actual_distance_km ?? null;
      const weeks = differenceInWeeks(parseISO(race.race_date), new Date());
      const { data, error } = await supabase.functions.invoke("validate-race-goal", {
        body: {
          race,
          baseline_km_per_week: profile?.baseline_km_per_week,
          baseline_pace_sec_per_km: profile?.baseline_avg_pace_sec_per_km,
          weeks_until_race: weeks,
          recent_long_run_km,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setViability({ race, result: data.result });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro a validar");
    } finally {
      setValidatingId(null);
    }
  };

  const handleGenerateEpoch = async () => {
    if (!userId) return;
    if (!canWrite) return toast.error("Modo Espelho — leitura apenas");

    const futureRaces = races.filter(r => r.race_date >= format(new Date(), "yyyy-MM-dd"));
    if (futureRaces.length === 0) return toast.error("Não tens provas ou objetivos futuros!");

    setGeneratingEpoch(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("baseline_km_per_week, baseline_avg_pace_sec_per_km, available_run_days, available_strength_days, long_run_day")
        .eq("id", userId).single();

      const baselineKm = Number(profile?.baseline_km_per_week ?? 30);
      const baselinePace = Number(profile?.baseline_avg_pace_sec_per_km ?? 360);
      const availableRunDays = (profile?.available_run_days as number[]) ?? [1, 2, 3, 4, 5, 6];
      const availableStrengthDays = (profile?.available_strength_days as number[]) ?? [2, 4];
      const longRunDay = profile?.long_run_day ?? 6;

      const todayStr = format(new Date(), "yyyy-MM-dd");
      const { count } = await supabase.from("planned_workouts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("workout_date", todayStr);

      if ((count ?? 0) > 0) {
        if (!confirm(`Já existem ${count} treinos futuros. Substituir pelo novo plano de época?`)) {
          setGeneratingEpoch(false);
          return;
        }
        await supabase.from("planned_workouts").delete()
          .eq("user_id", userId).gte("workout_date", todayStr);
      }

      // Passa todos os campos do objetivo — agora o planner usa-os para calcular os paces certos
      const events: SeasonEvent[] = futureRaces.map(r => ({
        id: r.id,
        date: r.race_date,
        name: r.name,
        priority: r.priority,
        distance_km: r.distance_km,
        elevation_gain_m: r.elevation_gain_m,
        terrain_profile: r.terrain_profile,
        goal_type: r.goal_type,
        target_time_minutes: r.target_time_minutes ?? null,
        target_pace_sec_per_km: r.target_pace_sec_per_km ?? null,
      }));

      const generated = generateSeasonPlan({
        events,
        baselineKm,
        baselinePace,
        availableRunDays,
        availableStrengthDays,
        longRunDay,
      });

      if (generated.length === 0) {
        toast.error("Não foi possível gerar treinos. Verifica as datas das provas.");
        return;
      }

      const rows = generated.map(w => ({ ...w, user_id: userId }));
      const { error } = await supabase.from("planned_workouts").insert(rows as any);
      if (error) throw error;

      const lastEvent = futureRaces[futureRaces.length - 1];
      toast.success(`Plano de época gerado: ${rows.length} treinos até ${format(parseISO(lastEvent.race_date), "d MMM yyyy", { locale: pt })}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro a gerar plano de época");
    } finally {
      setGeneratingEpoch(false);
    }
  };

  if (loading) return <LoadingScreen />;

  const futureRaces = races.filter(r => r.race_date >= format(new Date(), "yyyy-MM-dd"));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Flag className="w-6 h-6 text-primary" /> {t("races.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("races.subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {futureRaces.length > 0 && (
            <Button variant="outline" onClick={handleGenerateEpoch} disabled={generatingEpoch}>
              {generatingEpoch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              {generatingEpoch ? "A gerar..." : "Gerar plano de época"}
            </Button>
          )}
          <Button onClick={openCreate}><Plus className="w-4 h-4" /> {t("common.new")}</Button>
        </div>
      </div>

      {races.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <MountainSnow className="w-10 h-10 text-primary mx-auto" />
          <div className="font-medium">{t("races.empty.title")}</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">{t("races.empty.text")}</p>
          <Button onClick={openCreate}><Plus className="w-4 h-4" /> {t("common.add")}</Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {races.map((r) => {
            const date = parseISO(r.race_date);
            const weeksAway = differenceInWeeks(date, new Date());
            const isPast = date < new Date();
            const hasResult = r.result_time_min || r.result_position || r.itra_points;
            return (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.race_type === "training_goal" ? (
                        <Badge variant="outline" className="bg-accent/30 border-border">{t("races.badge.goal")}</Badge>
                      ) : (
                        <Badge className={PRIORITY_COLORS[r.priority]} variant="outline">{t("races.badge.priority", { p: r.priority })}</Badge>
                      )}
                      {r.is_atrp && <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-500 border-orange-500/30">ATRP</Badge>}
                      <h3 className="font-semibold text-lg truncate">{r.name}</h3>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {format(date, "dd/MM/yyyy")}
                      {!isPast && weeksAway >= 0 && (
                        <span className="ml-2">· {weeksAway === 0 ? t("common.thisWeek") : `${weeksAway} ${t("common.weeks")}`}</span>
                      )}
                      {isPast && <span className="ml-2 text-destructive">· {t("common.past")}</span>}
                    </div>
                    <div className="flex gap-3 mt-2 text-sm flex-wrap">
                      {r.distance_km > 0 && <span><strong>{r.distance_km}</strong> km</span>}
                      {r.elevation_gain_m > 0 && <span><strong>{r.elevation_gain_m}</strong> D+</span>}
                      <span className="text-muted-foreground">{t(`races.goal.${r.goal_type}`)}</span>
                      {r.target_time_minutes && (
                        <span className="text-muted-foreground">{t("common.time")}: {Math.floor(r.target_time_minutes / 60)}h{(r.target_time_minutes % 60).toString().padStart(2, "0")}</span>
                      )}
                    </div>
                    {r.notes && <p className="text-sm text-muted-foreground mt-2">{r.notes}</p>}
                    {hasResult && (
                      <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-border/40">
                        <Trophy className="w-3.5 h-3.5 text-amber-500 mt-0.5" />
                        {r.result_time_min && (
                          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                            {Math.floor(r.result_time_min / 60)}h{(r.result_time_min % 60).toString().padStart(2, "0")}
                          </Badge>
                        )}
                        {r.result_position && <Badge variant="outline" className="text-xs">#{r.result_position}</Badge>}
                        {r.itra_points && (
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                            ITRA {r.itra_points} pts
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {!isPast && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleValidate(r)} disabled={validatingId === r.id}>
                          {validatingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                          {t("races.action.validate")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setFuelingRace(r)}>
                          <Apple className="w-4 h-4" /> {t("races.action.nutrition")}
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar prova" : "Nova prova"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={form.race_type} onValueChange={(v: RaceType) => setForm({ ...form, race_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="official">Prova oficial</SelectItem>
                  <SelectItem value="training_goal">Objetivo de treino</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={form.race_type === "official" ? "Ex: Trail do Marão" : "Ex: Correr 10K em Maio"} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.race_date} onChange={(e) => setForm({ ...form, race_date: e.target.value })} />
              </div>
              {form.race_type === "official" && (
                <div>
                  <Label>Prioridade</Label>
                  <Select value={form.priority} onValueChange={(v: Priority) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A — Objetivo principal</SelectItem>
                      <SelectItem value="B">B — Importante</SelectItem>
                      <SelectItem value="C">C — Treino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <Label>Objetivo</Label>
              <Select value={form.goal_type} onValueChange={(v: GoalType) => setForm({ ...form, goal_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_LABELS) as GoalType[]).map((g) => (
                    <SelectItem key={g} value={g}>{GOAL_LABELS[g]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Distância (km)</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={form.distance_km}
                  onChange={(e) => setForm({ ...form, distance_km: e.target.value })} />
              </div>
              <div>
                <Label>Altimetria D+ (m)</Label>
                <Input type="number" inputMode="numeric" value={form.elevation_gain_m}
                  onChange={(e) => setForm({ ...form, elevation_gain_m: e.target.value })} />
              </div>
            </div>
            {form.race_type === "official" && (
              <div>
                <Label>Tipo de terreno</Label>
                <Select value={form.terrain_profile} onValueChange={(v: Terrain) => setForm({ ...form, terrain_profile: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rolling">Ondulado</SelectItem>
                    <SelectItem value="big_climbs">Subidas grandes</SelectItem>
                    <SelectItem value="sustained">Subida sustentada</SelectItem>
                    <SelectItem value="mixed">Misto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.goal_type === "target_time" && (
              <div>
                <Label>Tempo alvo (minutos)</Label>
                <Input type="number" inputMode="numeric" value={form.target_time_minutes}
                  onChange={(e) => setForm({ ...form, target_time_minutes: e.target.value })}
                  placeholder="Ex: 300 = 5h" />
              </div>
            )}
            {form.goal_type === "target_pace" && (
              <div>
                <Label>Pace alvo (segundos por km)</Label>
                <Input type="number" inputMode="numeric" value={form.target_pace_sec_per_km}
                  onChange={(e) => setForm({ ...form, target_pace_sec_per_km: e.target.value })}
                  placeholder="Ex: 330 = 5:30/km" />
              </div>
            )}
            <div>
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3} placeholder="Link, perfil, comentários…" />
            </div>
            {form.race_type === "official" && (
              <div className="border-t border-border/40 pt-4 space-y-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" /> Resultado & ITRA
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tempo (min)</Label>
                    <Input type="number" inputMode="numeric" placeholder="ex: 185 = 3h05"
                      value={form.result_time_min} onChange={(e) => setForm({ ...form, result_time_min: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Posição geral</Label>
                    <Input type="number" inputMode="numeric" placeholder="ex: 42"
                      value={form.result_position} onChange={(e) => setForm({ ...form, result_position: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Pontos ITRA</Label>
                    <Input type="number" inputMode="numeric" placeholder="ex: 380"
                      value={form.itra_points} onChange={(e) => setForm({ ...form, itra_points: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input type="checkbox" id="is_atrp" checked={form.is_atrp}
                      onChange={(e) => setForm({ ...form, is_atrp: e.target.checked })}
                      className="w-4 h-4 accent-orange-500" />
                    <Label htmlFor="is_atrp" className="cursor-pointer text-sm">Prova ATRP</Label>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover prova?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viability} onOpenChange={(o) => !o && setViability(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Viabilidade — {viability?.race.name}
            </DialogTitle>
          </DialogHeader>
          {viability && (
            <div className="space-y-3">
              <Badge variant="outline" className={
                viability.result.verdict === "realistic" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" :
                viability.result.verdict === "stretch" ? "bg-amber-500/15 text-amber-400 border-amber-500/40" :
                "bg-destructive/15 text-destructive border-destructive/40"
              }>
                {viability.result.verdict === "realistic" ? "Realista" : viability.result.verdict === "stretch" ? "Ambicioso" : "Irreal"}
                {" · "}{viability.result.confidence}%
              </Badge>
              <p className="font-medium">{viability.result.headline}</p>
              <p className="text-sm text-muted-foreground">{viability.result.reasoning}</p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">km/sem alvo</div>
                  <div className="font-bold text-base">{viability.result.recommended_weekly_km}</div>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">Long run alvo</div>
                  <div className="font-bold text-base">{viability.result.recommended_long_run_km} km</div>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">Mín. semanas</div>
                  <div className="font-bold text-base">{viability.result.min_weeks_needed}</div>
                </div>
              </div>
              {viability.result.risks?.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Riscos</div>
                  <ul className="text-sm list-disc list-inside space-y-1">
                    {viability.result.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {(() => {
                const minWeeks = viability.result.min_weeks_needed;
                const weeksAway = differenceInWeeks(parseISO(viability.race.race_date), new Date());
                if (viability.result.verdict === "unrealistic" && minWeeks && minWeeks > weeksAway) {
                  const suggested = format(addWeeks(new Date(), Math.ceil(minWeeks)), "yyyy-MM-dd");
                  return (
                    <div className="border-t border-border/40 pt-3 space-y-2">
                      <div className="text-xs text-amber-500">
                        Precisas de pelo menos {minWeeks} semanas. Sugestão: <span className="font-mono font-bold">{suggested}</span>
                      </div>
                      <Button size="sm" variant="outline"
                        className="w-full border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                        onClick={async () => {
                          if (!canWrite) return toast.error("Modo Espelho — leitura apenas");
                          const { error } = await supabase.from("races").update({ race_date: suggested }).eq("id", viability.race.id);
                          if (error) return toast.error(error.message);
                          toast.success("Prova adiada para data sugerida");
                          setViability(null);
                          fetchRaces();
                        }}>
                        Adiar para {suggested}
                      </Button>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RaceFuelingDialog
        race={fuelingRace as any}
        open={!!fuelingRace}
        onOpenChange={(o) => !o && setFuelingRace(null)}
        onSaved={fetchRaces}
      />
    </div>
  );
}
