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

// ─── Helpers de data ──────────────────────────────────────────────────────────

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

function formatPaceLocal(secPerKm: number | null): string {
  if (!secPerKm || secPerKm <= 0) return "--";
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

// ─── Planner de época ─────────────────────────────────────────────────────────
//
// Princípios:
// • O atleta tem SEMPRE treinos — com provas, sem provas, ou entre provas
// • Todos os 7 dias da semana têm sempre algo (treino, força ou descanso)
// • Blocos de manutenção preenchem gaps entre provas e após a última prova
// • Dois dias de força sempre nas semanas normais
// • Recuperação pós-prova: A=2 sem, B=1 sem, C=0
// • Taper: 2 semanas antes da prova
// • Ciclos de 3 semanas: 2 build + 1 choque (75%)

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

// Quantas semanas de recuperação pós-prova
function recovWeeksFor(priority: Priority): number {
  return priority === "A" ? 2 : priority === "B" ? 1 : 0;
}

// Quantos dias de folga antes de recomeçar o bloco seguinte
function recovDaysFor(priority: Priority): number {
  return priority === "A" ? 13 : priority === "B" ? 4 : 1;
}

// Factor de volume por semana (dentro do bloco de treino, excluindo recovery)
function volFactorFor(weekIdx: number, weeksToEvent: number): number {
  if (weeksToEvent === 0) return 0.25;
  if (weeksToEvent === 1) return 0.45;
  if (weeksToEvent === 2) return 0.65;
  if ((weekIdx + 1) % 3 === 0) return 0.75; // choque a cada 3ª semana
  return 1.0;
}

function getPhase(weeksToEvent: number, totalWeeks: number): string {
  if (weeksToEvent === 0) return "Prova";
  if (weeksToEvent <= 2) return "Taper";
  if (weeksToEvent <= 4) return "Pico";
  if (weeksToEvent <= Math.ceil(totalWeeks * 0.45)) return "Específico";
  return "Base";
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
  today.setHours(0, 0, 0, 0);
  const todayStr = format(today, "yyyy-MM-dd");

  // Ordenar apenas eventos futuros
  const futureEvents = events
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Estrutura de dias — calculada uma vez
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const activeDaysSet = new Set([...availableRunDays, ...availableStrengthDays]);
  const restDays = allDays.filter(d => !activeDaysSet.has(d));
  const runDaysWithoutLong = availableRunDays.filter(d => d !== longRunDay);
  const qualityDays = runDaysWithoutLong.slice(0, 2);   // primeiros 2 dias de corrida = qualidade
  const easyDays = runDaysWithoutLong.slice(2);          // restantes = easy/vert/recovery
  const strengthDays = availableStrengthDays;            // ambos os dias de força

  // Datas de todas as provas para não sobrepor treinos
  const allEventDates = new Set(futureEvents.map(e => e.date));

  const allWorkouts: PlannedWorkout[] = [];
  const usedKeys = new Set<string>();

  const addW = (w: PlannedWorkout) => {
    if (w.workout_date < todayStr) return; // nunca antes de hoje
    const key = `${w.workout_date}-${w.workout_type}`;
    if (usedKeys.has(key)) return;
    usedKeys.add(key);
    allWorkouts.push(w);
  };

  // ─── Helper: gera uma semana completa ──────────────────────────────────────
  //
  // Garante que TODOS os 7 dias têm sempre algo.
  // on() nunca sobrepõe um dia de prova com outro tipo de treino.

  function generateWeek(opts: {
    weekStart: Date;
    weekNum: number;
    phase: string;
    isRecovery: boolean;
    isTaper: boolean;
    isRaceWeek: boolean;
    isRBEWeek: boolean;
    targetKm: number;
    targetVert: number;
    weekPace: number;
    event: SeasonEvent;
    endDateStr: string; // não gerar além desta data
  }) {
    const { weekStart, weekNum, phase, isRecovery, isTaper, isRaceWeek, isRBEWeek,
      targetKm, targetVert, weekPace, event, endDateStr } = opts;

    const on = (
      dow: number, type: string, zone: Zone | null,
      title: string, desc: string,
      km: number | null = null, vert: number | null = null,
      dur: number | null = null, pace: number | null = null,
    ) => {
      const dateStr = dateForDow(weekStart, dow);
      if (dateStr < todayStr || dateStr > endDateStr) return;
      if (type !== "race" && allEventDates.has(dateStr)) return; // não sobrepor prova
      addW({
        workout_date: dateStr, workout_type: type as any, zone,
        target_distance_km: km, target_elevation_m: vert,
        target_duration_min: dur, target_pace_sec_per_km: pace,
        title, description: desc, week_number: weekNum, phase,
        race_id: event.id,
      });
    };

    // Descanso em TODOS os dias de repouso — sempre, em qualquer fase
    restDays.forEach(d =>
      on(d, "rest", null, "Descanso", "Recuperação activa opcional: mobilidade, foam roller, caminhada leve."));

    // ── SEMANA DA PROVA ──────────────────────────────────────────────────────
    if (isRaceWeek) {
      qualityDays[0] !== undefined && on(qualityDays[0], "easy_z2", "Z2", "Soltar pernas 20 min",
        "Trote muito leve. Sem stress muscular. Mantém a rotina, não faças mais.", 4, 0, 20, paceForZone(weekPace, "Z2"));
      qualityDays[1] !== undefined && on(qualityDays[1], "rest", null, "Descanso", "Repouso activo pré-prova.");
      easyDays[0] !== undefined && on(easyDays[0], "easy_z2", "Z2", "Activação 15 min + strides",
        "10 min fácil + 4×20s em ritmo de corrida com recuperação total. Acorda as pernas.", 3, 0, 18, paceForZone(weekPace, "Z2"));
      easyDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso pré-prova."));
      strengthDays.forEach(d => on(d, "rest", null, "Descanso", "Sem força pré-prova. Repouso completo."));
      on(longRunDay, "rest", null, "Descanso", "Repouso pré-prova. Prepara o equipamento e a nutrição.");
      return;
    }

    // ── SEMANA DE RECUPERAÇÃO ────────────────────────────────────────────────
    if (isRecovery) {
      const nRunDays = Math.max(qualityDays.length + easyDays.length + 1, 1);
      const recovKmPerDay = Math.max(Math.round(targetKm / nRunDays), 4);
      qualityDays.forEach(d => on(d, "recovery", "Z1", `Recovery ${recovKmPerDay} km`,
        "Trote muito leve. Se houver dor ou fadiga, substitui por caminhada.", recovKmPerDay, 0, null, paceForZone(baselinePace, "Z1")));
      easyDays.forEach(d => on(d, "recovery", "Z1", `Recovery ${recovKmPerDay} km`,
        "Circulação activa. RPE máximo 3/10.", recovKmPerDay, 0, null, paceForZone(baselinePace, "Z1")));
      on(longRunDay, "easy_z2", "Z2", `Easy longo ${Math.round(targetKm * 0.35)} km`,
        "Primeiro long run pós-prova — completamente conversacional. Sem pressão de ritmo.",
        Math.round(targetKm * 0.35), 0, null, paceForZone(baselinePace, "Z2"));
      // Força só na 2ª semana de recuperação e apenas mobilidade leve
      if (weekNum > 1) {
        strengthDays[0] !== undefined && on(strengthDays[0], "strength_light", null, "Mobilidade e força leve 20 min",
          "Mobilidade articular, alongamentos activos, core leve. Sem carga pesada.");
        strengthDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Sem força em recuperação pós-prova."));
      } else {
        strengthDays.forEach(d => on(d, "rest", null, "Descanso", "Sem força na 1ª semana de recuperação."));
      }
      return;
    }

    // ── SEMANA DE TAPER ──────────────────────────────────────────────────────
    if (isTaper) {
      const longKm = Math.round(targetKm * 0.30);
      const easyKm = Math.round(targetKm * 0.20);
      const qualKm = Math.round(targetKm * 0.15);
      qualityDays[0] !== undefined && on(qualityDays[0], "tempo", "Z3", `Tempo curto ${qualKm} km`,
        `Aquecimento 10 min Z2 + ${Math.max(qualKm - 3, 2)} km Z3 + 5 min Z2.\nMantém a velocidade, reduz o volume. Pace Z3: ${formatPaceLocal(paceForZone(weekPace, "Z3"))}.`,
        qualKm, 0, null, paceForZone(weekPace, "Z3"));
      qualityDays[1] !== undefined && on(qualityDays[1], "easy_z2", "Z2", `Easy Z2 ${easyKm} km`,
        `Conversacional. Pace: ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.`,
        easyKm, 0, null, paceForZone(weekPace, "Z2"));
      easyDays[0] !== undefined && on(easyDays[0], "easy_z2", "Z2", `Easy ${easyKm} km`,
        `Leve. Pace: ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.`,
        easyKm, 0, null, paceForZone(weekPace, "Z2"));
      easyDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso no taper."));
      // Força leve apenas no 1º dia no taper
      strengthDays[0] !== undefined && on(strengthDays[0], "strength_light", null, "Força leve 20 min",
        "Activação muscular: lunges, single leg deadlift, core. Sem carga pesada, sem fadiga.");
      strengthDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso no taper."));
      on(longRunDay, "long_run", "Z2", `Long Run taper ${longKm} km`,
        `Terreno semelhante ao da prova. Pace Z2: ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.\nRelax — confia no trabalho feito.`,
        longKm, Math.round(targetVert * 0.28), null, paceForZone(weekPace, "Z2"));
      return;
    }

    // ── SEMANA NORMAL (Base / Específico / Pico) ─────────────────────────────
    const longKm = Math.max(Math.round(targetKm * 0.35), Math.round(event.distance_km * 0.25));
    const qualKm = Math.round(targetKm * 0.15);
    const easyKm = Math.round(targetKm * 0.18);
    const vertKm = Math.round(targetKm * 0.18);
    const usedKm = longKm + qualKm * qualityDays.length + easyKm + vertKm;
    const recovKm = Math.max(targetKm - usedKm, 0);

    // Qualidade
    if (qualityDays[0] !== undefined) {
      if (phase === "Base") {
        on(qualityDays[0], "tempo", "Z3", `Tempo run ${qualKm} km`,
          `Aquecimento 15 min Z2 + ${Math.max(qualKm - 5, 2)} km Z3 contínuo + 10 min Z2.\nPace Z3: ${formatPaceLocal(paceForZone(weekPace, "Z3"))}. Deves conseguir falar frases curtas.`,
          qualKm, 0, null, paceForZone(weekPace, "Z3"));
      } else {
        on(qualityDays[0], "intervals", "Z4", `Intervalos ${qualKm} km`,
          `Aquecimento 15 min Z2 + 6×3 min Z4 (rec 2 min Z1) + 10 min Z2.\nPace Z4: ${formatPaceLocal(paceForZone(weekPace, "Z4"))}.`,
          qualKm, 0, null, paceForZone(weekPace, "Z4"));
      }
    }
    qualityDays[1] !== undefined && on(qualityDays[1], "easy_z2", "Z2", `Easy Z2 ${easyKm} km`,
      `Completamente conversacional. Pace: ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.\nSe ultrapassares o pace Z2, abranda.`,
      easyKm, Math.round(targetVert * 0.08), null, paceForZone(weekPace, "Z2"));

    // Easy days: vert no primeiro, recovery no segundo (se existir)
    easyDays[0] !== undefined && on(easyDays[0], "vert_session", "Z3",
      `Sessão de Vert ${vertKm} km / ${Math.round(targetVert * 0.45)}D+`,
      "Power-hike em rampas >12%, corre nas suaves. Foco em acumular D+ sem destruir as pernas.",
      vertKm, Math.round(targetVert * 0.45), null, null);

    if (easyDays[1] !== undefined) {
      if (recovKm > 2) {
        on(easyDays[1], "recovery", "Z1", `Recovery ${recovKm} km`,
          `Trote muito leve. RPE 2-3/10. Pace: ${formatPaceLocal(paceForZone(weekPace, "Z1"))}.`,
          recovKm, 0, null, paceForZone(weekPace, "Z1"));
      } else {
        on(easyDays[1], "rest", null, "Descanso", "Recuperação activa opcional.");
      }
    }

    // Força — AMBOS os dias sempre nas semanas normais
    strengthDays[0] !== undefined && on(strengthDays[0], "strength", null, "Força — Pernas 35-45 min",
      "Agachamentos, lunges búlgaros, step-ups, single leg deadlift.\n3×10-12 rep. Cadeia posterior e estabilidade unilateral.");
    strengthDays[1] !== undefined && on(strengthDays[1], "strength", null, "Força — Core & Tronco 30 min",
      "Prancha, bird-dog, dead bug, hip thrust, rotações com elástico.\nCore forte = economia de corrida e proteção em descidas.");

    // Long run
    if (isRBEWeek) {
      on(longRunDay, "downhill_repeats", "Z3",
        `Long Run + Downhill Repeats ${longKm} km / ${Math.round(targetVert * 0.40)}D+`,
        `Long run normal + nos últimos 30 min: 4-6× descidas íngremes a ritmo controlado.\nRepeated Bout Effect — protege as coxas para a prova. Pace Z2: ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.`,
        longKm, Math.round(targetVert * 0.40), null, paceForZone(weekPace, "Z2"));
    } else {
      const terrainDesc =
        event.terrain_profile === "rolling"
          ? `Trail ondulado ${longKm} km / ${Math.round(targetVert * 0.42)}D+. Mantém ritmo estável a ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.\nFoco em economia de movimento.`
          : event.terrain_profile === "big_climbs"
          ? `Trail com subidas longas ${longKm} km / ${Math.round(targetVert * 0.42)}D+.\nPower-hike em rampas >15%. Pace corrível: ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.`
          : event.terrain_profile === "sustained"
          ? `Subida sustentada ${longKm} km / ${Math.round(targetVert * 0.42)}D+.\nAlterna corrida (${formatPaceLocal(paceForZone(weekPace, "Z2"))}) e marcha rápida conforme o declive.`
          : `Long run terreno variado ${longKm} km / ${Math.round(targetVert * 0.42)}D+.\nAproxima-te do perfil da prova. Pace Z2: ${formatPaceLocal(paceForZone(weekPace, "Z2"))}.`;
      on(longRunDay, "long_run", "Z2",
        `Long Run ${longKm} km / ${Math.round(targetVert * 0.42)}D+`,
        terrainDesc, longKm, Math.round(targetVert * 0.42), null, paceForZone(weekPace, "Z2"));
    }
  }

  // ─── Bloco de manutenção (sem prova à vista) ───────────────────────────────
  //
  // Usado para:
  //   • Período antes da 1ª prova se for muito curto para preparação real
  //   • Gap entre provas
  //   • Após a última prova (até fim do ano / 16 semanas)
  //
  // Volume estável a ~85% do baseline, qualidade genérica, sem pico, sem taper.

  const MAINTENANCE_EVENT: SeasonEvent = {
    id: "maintenance",
    date: "9999-12-31",
    name: "Manutenção",
    priority: "C",
    distance_km: 0,
    elevation_gain_m: 500,
    terrain_profile: "mixed",
    goal_type: "finish",
    target_time_minutes: null,
    target_pace_sec_per_km: null,
  };

  function generateMaintenanceBlock(fromDate: Date, toDate: Date, startWeekNum: number) {
    const totalDays = differenceInDays(toDate, fromDate);
    if (totalDays < 4) return;
    const totalWeeks = Math.ceil(totalDays / 7);
    const planStart = startOfWeek(fromDate, { weekStartsOn: 1 });
    const maintenanceKm = Math.round(baselineKm * 0.85);
    const toDateStr = format(toDate, "yyyy-MM-dd");

    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = addDays(planStart, w * 7);
      // Choque a cada 3ª semana também na manutenção
      const volFactor = (w + 1) % 3 === 0 ? 0.75 : 1.0;
      const targetKm = Math.round(maintenanceKm * volFactor);
      const targetVert = Math.round(500 * volFactor);
      // Alterna entre Base e Específico para manter estímulo
      const phase = w % 2 === 0 ? "Base" : "Específico";

      generateWeek({
        weekStart,
        weekNum: startWeekNum + w,
        phase,
        isRecovery: false,
        isTaper: false,
        isRaceWeek: false,
        isRBEWeek: false,
        targetKm,
        targetVert,
        weekPace: baselinePace,
        event: MAINTENANCE_EVENT,
        endDateStr: toDateStr,
      });
    }
  }

  // ─── Loop principal ────────────────────────────────────────────────────────

  let blockStart = new Date(today);
  let globalWeekNum = 1;

  // Se não há provas futuras, gerar 16 semanas de manutenção
  if (futureEvents.length === 0) {
    const maintenanceEnd = addDays(today, 16 * 7);
    generateMaintenanceBlock(today, maintenanceEnd, globalWeekNum);
    return allWorkouts.sort((a, b) => a.workout_date.localeCompare(b.workout_date));
  }

  for (let ei = 0; ei < futureEvents.length; ei++) {
    const event = futureEvents[ei];
    const eventDate = parseDateLocal(event.date);

    const racePace = deriveRacePace(
      event.goal_type, event.target_time_minutes, event.target_pace_sec_per_km,
      event.distance_km, event.elevation_gain_m, baselinePace,
    );
    const peakKm = Math.max(baselineKm * 1.8, event.distance_km * 1.1);

    // Registar a própria prova no calendário
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
        ? `${event.target_time_minutes ? `Objetivo: ${Math.floor(event.target_time_minutes / 60)}h${(event.target_time_minutes % 60).toString().padStart(2, "0")}. ` : ""}Dia da prova âncora! Executa o plano de nutrição. Começa conservador — os primeiros 40% são para guardar energia.`
        : event.priority === "B"
        ? "Prova importante. Usa como simulação de ritmo e nutrição. Começa 5-10% mais lento que o objetivo."
        : "Prova de treino (C). Experimenta equipamento e nutrição. Sem pressão de resultado.",
      week_number: 0,
      phase: "Prova",
      race_id: event.id,
    });

    const daysUntilEvent = differenceInDays(eventDate, blockStart);

    // Prova demasiado próxima (< 3 dias) — só registar e avançar
    if (daysUntilEvent < 3) {
      blockStart = addDays(eventDate, recovDaysFor(event.priority) + 1);
      continue;
    }

    const totalWeeks = Math.ceil(daysUntilEvent / 7);
    const planStart = startOfWeek(blockStart, { weekStartsOn: 1 });

    // Semanas de recuperação pós-prova anterior (só se não for o 1º evento)
    const recovWeeks = ei === 0 ? 0 : recovWeeksFor(event.priority);

    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = addDays(planStart, w * 7);
      const weeksToEvent = totalWeeks - w - 1;
      const isRecovery = w < recovWeeks;
      const phase = isRecovery ? "Recuperação" : getPhase(weeksToEvent, totalWeeks);

      const trainingWeekIdx = Math.max(w - recovWeeks, 0);
      const totalTrainingWeeks = totalWeeks - recovWeeks;
      const buildWeeks = Math.max(totalTrainingWeeks - 3, 1);
      const progressRatio = Math.min(trainingWeekIdx / buildWeeks, 1);

      const volFactor = isRecovery
        ? (w === 0 ? 0.35 : 0.50)
        : volFactorFor(trainingWeekIdx, weeksToEvent);

      const targetKm = isRecovery
        ? Math.round(baselineKm * volFactor)
        : Math.round((baselineKm + (peakKm - baselineKm) * progressRatio) * volFactor);

      const targetVert = Math.round(event.elevation_gain_m * (0.30 + 0.70 * progressRatio) * volFactor);
      const weekPace = isRecovery ? baselinePace : racePace;

      generateWeek({
        weekStart,
        weekNum: globalWeekNum + w,
        phase,
        isRecovery,
        isTaper: !isRecovery && weeksToEvent <= 2,
        isRaceWeek: weeksToEvent === 0,
        isRBEWeek: !isRecovery && weeksToEvent === 3,
        targetKm,
        targetVert,
        weekPace,
        event,
        endDateStr: event.date,
      });
    }

    globalWeekNum += totalWeeks;

    // Gap entre esta prova e a próxima — preencher com manutenção
    const nextBlockStart = addDays(eventDate, recovDaysFor(event.priority) + 1);
    const nextEventDate = ei + 1 < futureEvents.length
      ? parseDateLocal(futureEvents[ei + 1].date)
      : null;

    if (nextEventDate) {
      // Há prova a seguir — gap de manutenção antes de o próximo bloco começar
      const gapDays = differenceInDays(nextEventDate, nextBlockStart);
      // Só gera manutenção se o gap for maior que as semanas de recuperação
      // que o próximo bloco já vai gerar internamente
      const nextRecovWeeks = recovWeeksFor(futureEvents[ei + 1].priority);
      const maintenanceEnd = addDays(nextBlockStart, Math.max(gapDays - nextRecovWeeks * 7, 0));
      if (differenceInDays(maintenanceEnd, nextBlockStart) > 3) {
        generateMaintenanceBlock(nextBlockStart, maintenanceEnd, globalWeekNum);
      }
    } else {
      // Última prova — gerar 12 semanas de manutenção pós-época
      const postSeasonEnd = addDays(nextBlockStart, 12 * 7);
      generateMaintenanceBlock(nextBlockStart, postSeasonEnd, globalWeekNum);
    }

    blockStart = nextBlockStart;
  }

  return allWorkouts.sort((a, b) => a.workout_date.localeCompare(b.workout_date));
}

// ─── Fim do planner ───────────────────────────────────────────────────────────

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

    setGeneratingEpoch(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("baseline_km_per_week, baseline_avg_pace_sec_per_km, available_run_days, available_strength_days, long_run_day")
        .eq("id", userId).single();

      const baselineKm = Number(profile?.baseline_km_per_week ?? 30);
      const baselinePace = Number(profile?.baseline_avg_pace_sec_per_km ?? 360);
      const availableRunDays = (profile?.available_run_days as number[]) ?? [1, 3, 5, 0];
      const availableStrengthDays = (profile?.available_strength_days as number[]) ?? [2, 4];
      const longRunDay = profile?.long_run_day ?? 0;

      const todayStr = format(new Date(), "yyyy-MM-dd");

      // Verificar treinos futuros existentes
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

      // Todas as provas futuras — incluindo as sem data futura
      // O planner gera manutenção mesmo que não haja provas
      const futureRaces = races.filter(r => r.race_date >= todayStr);

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
        events,          // pode ser [] — gera manutenção na mesma
        baselineKm,
        baselinePace,
        availableRunDays,
        availableStrengthDays,
        longRunDay,
      });

      if (generated.length === 0) {
        toast.error("Não foi possível gerar treinos.");
        return;
      }

      // Inserir em batches de 500
      const rows = generated.map(w => ({ ...w, user_id: userId }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("planned_workouts").insert(rows.slice(i, i + 500) as any);
        if (error) throw error;
      }

      const lastDate = rows[rows.length - 1].workout_date;
      toast.success(`Plano de época gerado: ${rows.length} treinos até ${format(parseISO(lastDate), "d MMM yyyy", { locale: pt })}`);
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

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Flag className="w-6 h-6 text-primary" /> {t("races.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("races.subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Botão sempre visível — gera manutenção mesmo sem provas */}
          <Button variant="outline" onClick={handleGenerateEpoch} disabled={generatingEpoch}>
            {generatingEpoch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            {generatingEpoch ? "A gerar..." : "Gerar plano de época"}
          </Button>
          <Button onClick={openCreate}><Plus className="w-4 h-4" /> {t("common.new")}</Button>
        </div>
      </div>

      {/* ── Lista vazia ── */}
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
                        <span className="text-muted-foreground">
                          {t("common.time")}: {Math.floor(r.target_time_minutes / 60)}h{(r.target_time_minutes % 60).toString().padStart(2, "0")}
                        </span>
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

      {/* ── Dialog criar/editar prova ── */}
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
                <Label>Tempo alvo (minutos totais)</Label>
                <Input type="number" inputMode="numeric" value={form.target_time_minutes}
                  onChange={(e) => setForm({ ...form, target_time_minutes: e.target.value })}
                  placeholder="Ex: 300 = 5h00" />
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

      {/* ── Confirmar apagar ── */}
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

      {/* ── Dialog viabilidade ── */}
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

      {/* ── Nutrição por prova ── */}
      <RaceFuelingDialog
        race={fuelingRace as any}
        open={!!fuelingRace}
        onOpenChange={(o) => !o && setFuelingRace(null)}
        onSaved={fetchRaces}
      />
    </div>
  );
}
