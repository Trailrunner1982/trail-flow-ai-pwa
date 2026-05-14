/**
 * src/lib/seasonPlan.ts
 *
 * Motor de planeamento de época — Trail Forge AI
 *
 * Princípios:
 * • O atleta tem SEMPRE treinos — com provas, sem provas, ou entre provas
 * • Todos os 7 dias da semana têm sempre algo (treino, força ou descanso)
 * • Um dia nunca tem mais de um treino de corrida
 * • Blocos de manutenção preenchem gaps entre provas e após a última prova
 * • Dois dias de força sempre nas semanas normais
 * • Recuperação pós-prova: A=2 sem, B=1 sem, C=0
 * • Taper: 2 semanas antes da prova
 * • Ciclos de 3 semanas: 2 build + 1 choque (75%)
 */

import { addDays, differenceInDays, format, startOfWeek, getDay } from "date-fns";
import { parseDateLocal, deriveRacePace, paceForZone, type GoalType } from "@/lib/planner";

export type Priority = "A" | "B" | "C";
export type Terrain = "rolling" | "big_climbs" | "sustained" | "mixed";
type Zone = "Z1" | "Z2" | "Z3" | "Z4" | "Z5";

export interface SeasonEvent {
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

export interface SeasonPlannedWorkout {
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
  race_id?: string | null;
}

export interface SeasonPlanInput {
  events: SeasonEvent[];
  baselineKm: number;
  baselinePace: number;
  availableRunDays: number[];
  availableStrengthDays: number[];
  longRunDay: number;
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

function dateForDow(weekStart: Date, dow: number): string {
  const s = getDay(weekStart);
  let o = dow - s;
  if (o < 0) o += 7;
  const d = addDays(weekStart, o);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtPace(secPerKm: number | null): string {
  if (!secPerKm || secPerKm <= 0) return "--";
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

// ─── Recuperação pós-prova ────────────────────────────────────────────────────

function recovWeeksFor(priority: Priority): number {
  return priority === "A" ? 2 : priority === "B" ? 1 : 0;
}

function recovDaysFor(priority: Priority): number {
  return priority === "A" ? 13 : priority === "B" ? 4 : 1;
}

// ─── Volume ───────────────────────────────────────────────────────────────────

function volFactorFor(weekIdx: number, weeksToEvent: number): number {
  if (weeksToEvent === 0) return 0.25;
  if (weeksToEvent === 1) return 0.45;
  if (weeksToEvent === 2) return 0.65;
  if ((weekIdx + 1) % 3 === 0) return 0.75;
  return 1.0;
}

// ─── Fase ─────────────────────────────────────────────────────────────────────

function getPhase(weeksToEvent: number, totalWeeks: number): string {
  if (weeksToEvent === 0) return "Prova";
  if (weeksToEvent <= 2) return "Taper";
  if (weeksToEvent <= 4) return "Pico";
  if (weeksToEvent <= Math.ceil(totalWeeks * 0.45)) return "Específico";
  return "Base";
}

// ─── Gerador principal ────────────────────────────────────────────────────────

export function generateSeasonPlan(input: SeasonPlanInput): SeasonPlannedWorkout[] {
  const { events, baselineKm, baselinePace, availableRunDays, availableStrengthDays, longRunDay } = input;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = format(today, "yyyy-MM-dd");

  const futureEvents = events
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Estrutura de dias (calculada uma vez) ─────────────────────────────────
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const activeDaysSet = new Set([...availableRunDays, ...availableStrengthDays]);
  const restDays = allDays.filter(d => !activeDaysSet.has(d));
  const runDaysWithoutLong = availableRunDays.filter(d => d !== longRunDay);
  const qualityDays = runDaysWithoutLong.slice(0, 2);  // primeiros 2 = qualidade
  const easyDays = runDaysWithoutLong.slice(2);         // restantes = easy/vert/recovery
  const strengthDays = availableStrengthDays;

  // Datas de todas as provas — nunca sobrepor com outro treino
  const allEventDates = new Set(futureEvents.map(e => e.date));

  const allWorkouts: SeasonPlannedWorkout[] = [];

  // CHAVE: só workout_date — garante que um dia nunca tem mais de um treino
  const usedDates = new Set<string>();

  const addW = (w: SeasonPlannedWorkout) => {
    if (w.workout_date < todayStr) return;
    if (usedDates.has(w.workout_date) && w.workout_type !== "strength" && w.workout_type !== "strength_light" && w.workout_type !== "rest") return;
    // Para força e descanso, usar chave composta (podem coexistir com... nada, na prática)
    // Descanso nunca sobrepõe treino já existente
if (w.workout_type === "rest" && usedDates.has(w.workout_date)) return;
const key = (w.workout_type === "strength" || w.workout_type === "strength_light")
  ? `${w.workout_date}-strength`
  : w.workout_date;
    if (usedDates.has(key)) return;
    usedDates.add(key);
    allWorkouts.push(w);
  };

  // ─── Gerador de semana ────────────────────────────────────────────────────

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
    endDateStr: string;
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
      if (type !== "race" && allEventDates.has(dateStr)) return;
      addW({
        workout_date: dateStr, workout_type: type as any, zone,
        target_distance_km: km, target_elevation_m: vert,
        target_duration_min: dur, target_pace_sec_per_km: pace,
        title, description: desc, week_number: weekNum, phase,
        race_id: event.id !== "maintenance" ? event.id : null,
      });
    };

    // Descanso nos dias de repouso — sempre, em qualquer fase
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
      // Força só na 2ª semana de recuperação (leve)
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
        `Aquecimento 10 min Z2 + ${Math.max(qualKm - 3, 2)} km Z3 + 5 min Z2.\nMantém a velocidade, reduz o volume. Pace Z3: ${fmtPace(paceForZone(weekPace, "Z3"))}.`,
        qualKm, 0, null, paceForZone(weekPace, "Z3"));
      qualityDays[1] !== undefined && on(qualityDays[1], "easy_z2", "Z2", `Easy Z2 ${easyKm} km`,
        `Conversacional. Pace: ${fmtPace(paceForZone(weekPace, "Z2"))}.`, easyKm, 0, null, paceForZone(weekPace, "Z2"));
      easyDays[0] !== undefined && on(easyDays[0], "easy_z2", "Z2", `Easy ${easyKm} km`,
        `Leve. Pace: ${fmtPace(paceForZone(weekPace, "Z2"))}.`, easyKm, 0, null, paceForZone(weekPace, "Z2"));
      easyDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso no taper."));
      strengthDays[0] !== undefined && on(strengthDays[0], "strength_light", null, "Força leve 20 min",
        "Activação muscular: lunges, single leg deadlift, core. Sem carga pesada.");
      strengthDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso no taper."));
      on(longRunDay, "long_run", "Z2", `Long Run taper ${longKm} km`,
        `Terreno semelhante ao da prova. Pace Z2: ${fmtPace(paceForZone(weekPace, "Z2"))}.\nRelax — confia no trabalho feito.`,
        longKm, Math.round(targetVert * 0.28), null, paceForZone(weekPace, "Z2"));
      return;
    }

    // ── SEMANA NORMAL ────────────────────────────────────────────────────────
    const longKm = Math.max(
      Math.round(targetKm * 0.35),
      event.distance_km > 0 ? Math.round(event.distance_km * 0.25) : 0,
  10, // mínimo absoluto de 10km para qualquer long run
);
    const qualKm = Math.round(targetKm * 0.15);
    const easyKm = Math.round(targetKm * 0.18);
    const vertKm = Math.round(targetKm * 0.18);
    const usedKm = longKm + qualKm * qualityDays.length + easyKm + vertKm;
    const recovKm = Math.max(targetKm - usedKm, 0);

    // Qualidade
    if (qualityDays[0] !== undefined) {
      if (phase === "Base") {
        on(qualityDays[0], "tempo", "Z3", `Tempo run ${qualKm} km`,
          `Aquecimento 15 min Z2 + ${Math.max(qualKm - 5, 2)} km Z3 contínuo + 10 min Z2.\nPace Z3: ${fmtPace(paceForZone(weekPace, "Z3"))}. Deves conseguir falar frases curtas.`,
          qualKm, 0, null, paceForZone(weekPace, "Z3"));
      } else {
        on(qualityDays[0], "intervals", "Z4", `Intervalos ${qualKm} km`,
          `Aquecimento 15 min Z2 + 6×3 min Z4 (rec 2 min Z1) + 10 min Z2.\nPace Z4: ${fmtPace(paceForZone(weekPace, "Z4"))}.`,
          qualKm, 0, null, paceForZone(weekPace, "Z4"));
      }
    }
    qualityDays[1] !== undefined && on(qualityDays[1], "easy_z2", "Z2", `Easy Z2 ${easyKm} km`,
      `Completamente conversacional. Pace: ${fmtPace(paceForZone(weekPace, "Z2"))}.\nSe ultrapassares o pace Z2, abranda.`,
      easyKm, Math.round(targetVert * 0.08), null, paceForZone(weekPace, "Z2"));

    easyDays[0] !== undefined && on(easyDays[0], "vert_session", "Z3",
      `Sessão de Vert ${vertKm} km / ${Math.round(targetVert * 0.45)}D+`,
      "Power-hike em rampas >12%, corre nas suaves. Foco em acumular D+ sem destruir as pernas.",
      vertKm, Math.round(targetVert * 0.45), null, null);

    if (easyDays[1] !== undefined) {
      recovKm > 2
        ? on(easyDays[1], "recovery", "Z1", `Recovery ${recovKm} km`,
            `Trote muito leve. RPE 2-3/10. Pace: ${fmtPace(paceForZone(weekPace, "Z1"))}.`,
            recovKm, 0, null, paceForZone(weekPace, "Z1"))
        : on(easyDays[1], "rest", null, "Descanso", "Recuperação activa opcional.");
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
        `Long run normal + nos últimos 30 min: 4-6× descidas íngremes a ritmo controlado.\nRepeated Bout Effect — protege as coxas para a prova. Pace Z2: ${fmtPace(paceForZone(weekPace, "Z2"))}.`,
        longKm, Math.round(targetVert * 0.40), null, paceForZone(weekPace, "Z2"));
    } else {
      const terrainDesc =
        event.terrain_profile === "rolling"
          ? `Trail ondulado ${longKm} km / ${Math.round(targetVert * 0.42)}D+. Mantém ritmo estável a ${fmtPace(paceForZone(weekPace, "Z2"))}.\nFoco em economia de movimento.`
          : event.terrain_profile === "big_climbs"
          ? `Trail com subidas longas ${longKm} km / ${Math.round(targetVert * 0.42)}D+.\nPower-hike em rampas >15%. Pace corrível: ${fmtPace(paceForZone(weekPace, "Z2"))}.`
          : event.terrain_profile === "sustained"
          ? `Subida sustentada ${longKm} km / ${Math.round(targetVert * 0.42)}D+.\nAlterna corrida (${fmtPace(paceForZone(weekPace, "Z2"))}) e marcha rápida conforme o declive.`
          : `Long run terreno variado ${longKm} km / ${Math.round(targetVert * 0.42)}D+.\nAproxima-te do perfil da prova. Pace Z2: ${fmtPace(paceForZone(weekPace, "Z2"))}.`;
      on(longRunDay, "long_run", "Z2",
        `Long Run ${longKm} km / ${Math.round(targetVert * 0.42)}D+`,
        terrainDesc, longKm, Math.round(targetVert * 0.42), null, paceForZone(weekPace, "Z2"));
    }
  }

  // ─── Bloco de manutenção ──────────────────────────────────────────────────

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
      const volFactor = (w + 1) % 3 === 0 ? 0.75 : 1.0;
      const targetKm = Math.round(maintenanceKm * volFactor);
      const targetVert = Math.round(500 * volFactor);
      const phase = w % 2 === 0 ? "Base" : "Específico";

      generateWeek({
        weekStart, weekNum: startWeekNum + w, phase,
        isRecovery: false, isTaper: false, isRaceWeek: false, isRBEWeek: false,
        targetKm, targetVert, weekPace: baselinePace,
        event: MAINTENANCE_EVENT, endDateStr: toDateStr,
      });
    }
  }

  // ─── Bloco de recuperação pós-prova (standalone) ──────────────────────────
  // Usado após a última prova — as semanas de recovery do bloco seguinte
  // só existem quando há um próximo evento.

  function generateRecoveryBlock(fromDate: Date, priority: Priority, startWeekNum: number): Date {
    const weeks = recovWeeksFor(priority);
    if (weeks === 0) return fromDate;
    const planStart = startOfWeek(fromDate, { weekStartsOn: 1 });
    const recovKm = Math.round(baselineKm * 0.40);
    const endDate = addDays(planStart, weeks * 7);
    const endDateStr = format(endDate, "yyyy-MM-dd");

    for (let w = 0; w < weeks; w++) {
      const weekStart = addDays(planStart, w * 7);
      generateWeek({
        weekStart, weekNum: startWeekNum + w, phase: "Recuperação",
        isRecovery: true, isTaper: false, isRaceWeek: false, isRBEWeek: false,
        targetKm: Math.round(recovKm * (w === 0 ? 0.35 : 0.50)),
        targetVert: 0, weekPace: baselinePace,
        event: MAINTENANCE_EVENT, endDateStr,
      });
    }
    return endDate;
  }

  // ─── Loop principal ───────────────────────────────────────────────────────

  let blockStart = new Date(today);
  let globalWeekNum = 1;

  // Sem provas futuras — 16 semanas de manutenção
  if (futureEvents.length === 0) {
    generateMaintenanceBlock(today, addDays(today, 16 * 7), globalWeekNum);
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

    // Registar a prova
    addW({
      workout_date: event.date, workout_type: "race", zone: null,
      target_distance_km: event.distance_km, target_elevation_m: event.elevation_gain_m,
      target_duration_min: event.target_time_minutes ?? null,
      target_pace_sec_per_km: event.goal_type === "target_pace" ? event.target_pace_sec_per_km : null,
      title: `🏁 ${event.priority === "A" ? "" : `Prova ${event.priority}: `}${event.name} — ${event.distance_km}km / ${event.elevation_gain_m}D+`,
      description: event.priority === "A"
        ? `${event.target_time_minutes ? `Objetivo: ${Math.floor(event.target_time_minutes / 60)}h${(event.target_time_minutes % 60).toString().padStart(2, "0")}. ` : ""}Dia da prova âncora! Executa o plano de nutrição. Começa conservador — os primeiros 40% são para guardar energia.`
        : event.priority === "B"
        ? "Prova importante. Usa como simulação de ritmo e nutrição. Começa 5-10% mais lento que o objetivo."
        : "Prova de treino (C). Experimenta equipamento e nutrição. Sem pressão de resultado.",
      week_number: 0, phase: "Prova", race_id: event.id,
    });

    const daysUntilEvent = differenceInDays(eventDate, blockStart);

    if (daysUntilEvent < 3) {
      // Prova muito próxima — só registar
      const nextBlockStart = addDays(eventDate, recovDaysFor(event.priority) + 1);
      // Recovery standalone se for a última prova
      if (ei === futureEvents.length - 1) {
        const afterRecov = generateRecoveryBlock(nextBlockStart, event.priority, globalWeekNum);
        generateMaintenanceBlock(afterRecov, addDays(afterRecov, 12 * 7), globalWeekNum + recovWeeksFor(event.priority));
      }
      blockStart = nextBlockStart;
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
      const totalTrainingWeeks = Math.max(totalWeeks - recovWeeks, 1);
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
        weekStart, weekNum: globalWeekNum + w, phase, isRecovery,
        isTaper: !isRecovery && weeksToEvent <= 2,
        isRaceWeek: weeksToEvent === 0,
        isRBEWeek: !isRecovery && weeksToEvent === 3,
        targetKm, targetVert, weekPace, event,
        endDateStr: event.date,
      });
    }

    globalWeekNum += totalWeeks;

    const nextBlockStart = addDays(eventDate, recovDaysFor(event.priority) + 1);
    const isLastEvent = ei === futureEvents.length - 1;

    if (isLastEvent) {
      // Última prova: recovery explícito + manutenção pós-época
      const afterRecov = generateRecoveryBlock(nextBlockStart, event.priority, globalWeekNum);
      globalWeekNum += recovWeeksFor(event.priority);
      generateMaintenanceBlock(afterRecov, addDays(afterRecov, 12 * 7), globalWeekNum);
    } else {
      // Há próxima prova — gap de manutenção entre provas
      const nextEventDate = parseDateLocal(futureEvents[ei + 1].date);
      const nextRecovWeeks = recovWeeksFor(futureEvents[ei + 1].priority);
      const gapDays = differenceInDays(nextEventDate, nextBlockStart);
      // O próximo bloco já gera as suas próprias semanas de recovery internamente
      // Só gerar manutenção no gap que sobra
      const maintenanceEnd = addDays(nextBlockStart, Math.max(gapDays - nextRecovWeeks * 7, 0));
      if (differenceInDays(maintenanceEnd, nextBlockStart) > 3) {
        generateMaintenanceBlock(nextBlockStart, maintenanceEnd, globalWeekNum);
      }
    }

    blockStart = nextBlockStart;
  }

  return allWorkouts.sort((a, b) => a.workout_date.localeCompare(b.workout_date));
}
