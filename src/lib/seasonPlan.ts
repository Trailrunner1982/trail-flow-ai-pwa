/**
 * src/lib/seasonPlan.ts
 *
 * Motor de planeamento de época — Trail Forge AI
 * Metodologia: Training for the Uphill Athlete + Lyss Method
 *
 * Princípios:
 * • 80/20 polarizado — 80% Z1/Z2, 20% Z4/Z5. Z3 só em Base moderado.
 * • D+ semanal progressivo por fase (Lyss Method)
 * • Periodização Base → Específico → Pico → Taper → Prova
 * • Repeated Bout Effect: semana 3 antes da prova
 * • Deload a cada 3ª semana (75% volume)
 * • Recovery começa no dia seguinte à prova — sem gap
 * • Todos os 7 dias têm sempre algo — nunca dias em branco
 * • Um dia nunca tem mais de um treino de corrida
 * • Força em ambos os dias configurados
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

// Dias após a prova antes de recomeçar preparação da próxima
function recovDaysFor(priority: Priority): number {
  return priority === "A" ? 13 : priority === "B" ? 4 : 1;
}

// ─── D+ semanal por fase (Lyss Method) ───────────────────────────────────────

function weeklyVertTarget(
  raceVertM: number,
  phase: string,
  progressRatio: number,
  volFactor: number,
): number {
  const baseVert = raceVertM > 0 ? raceVertM * 0.75 : 800;
  let phasePct: number;
  if (phase === "Base") phasePct = 0.30 + 0.10 * progressRatio;
  else if (phase === "Específico") phasePct = 0.50 + 0.20 * progressRatio;
  else if (phase === "Pico") phasePct = 0.80 + 0.20 * progressRatio;
  else if (phase === "Taper") phasePct = 0.40;
  else phasePct = 0.30;
  return Math.round(baseVert * phasePct * volFactor);
}

// ─── Volume semanal ───────────────────────────────────────────────────────────

function volFactorFor(weekIdx: number, weeksToEvent: number): number {
  if (weeksToEvent === 0) return 0.25;
  if (weeksToEvent === 1) return 0.55; // taper menos agressivo — TFUA -40%
  if (weeksToEvent === 2) return 0.70;
  if ((weekIdx + 1) % 3 === 0) return 0.75; // deload
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

  // ── Estrutura de dias ─────────────────────────────────────────────────────
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const activeDaysSet = new Set([...availableRunDays, ...availableStrengthDays]);
  const restDays = allDays.filter(d => !activeDaysSet.has(d));
  const runDaysWithoutLong = availableRunDays.filter(d => d !== longRunDay);
  const qualityDays = runDaysWithoutLong.slice(0, 2);
  const easyDays = runDaysWithoutLong.slice(2);
  const strengthDays = availableStrengthDays;

  const allEventDates = new Set(futureEvents.map(e => e.date));
  const allWorkouts: SeasonPlannedWorkout[] = [];

  // Controlo de duplicados — separado por tipo
  const usedRunDates = new Set<string>();
  const usedStrengthDates = new Set<string>();
  const usedRestDates = new Set<string>();

  const addW = (w: SeasonPlannedWorkout) => {
    if (w.workout_date < todayStr) return;

    const isStrength = w.workout_type === "strength" || w.workout_type === "strength_light";
    const isRest = w.workout_type === "rest";

    if (isStrength) {
      if (usedStrengthDates.has(w.workout_date)) return;
      usedStrengthDates.add(w.workout_date);
      allWorkouts.push(w);
      return;
    }

    if (isRest) {
      // Descanso só entra se não há treino de corrida nem já há descanso
      if (usedRunDates.has(w.workout_date)) return;
      if (usedRestDates.has(w.workout_date)) return;
      usedRestDates.add(w.workout_date);
      allWorkouts.push(w);
      return;
    }

    // Treino de corrida — um por dia, prevalece sobre descanso
    if (usedRunDates.has(w.workout_date)) return;
    // Remover descanso se existia neste dia
    const restIdx = allWorkouts.findIndex(
      x => x.workout_date === w.workout_date && x.workout_type === "rest"
    );
    if (restIdx !== -1) {
      allWorkouts.splice(restIdx, 1);
      usedRestDates.delete(w.workout_date);
    }
    usedRunDates.add(w.workout_date);
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
    progressRatio: number;
  }) {
    const {
      weekStart, weekNum, phase, isRecovery, isTaper, isRaceWeek, isRBEWeek,
      targetKm, targetVert, weekPace, event, endDateStr, progressRatio,
    } = opts;

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

    // Descanso nos dias de repouso — sempre
    restDays.forEach(d =>
      on(d, "rest", null, "Descanso", "Recuperação activa: mobilidade, foam roller, caminhada leve."));

    // ── SEMANA DA PROVA ──────────────────────────────────────────────────────
    if (isRaceWeek) {
      qualityDays[0] !== undefined && on(qualityDays[0], "easy_z2", "Z2", "Soltar pernas 20 min",
        "Trote muito leve Z2. Sem stress muscular. Mantém a rotina, não faças mais.", 4, 0, 20, paceForZone(weekPace, "Z2"));
      qualityDays[1] !== undefined && on(qualityDays[1], "rest", null, "Descanso", "Repouso activo pré-prova.");
      easyDays[0] !== undefined && on(easyDays[0], "easy_z2", "Z2", "Activação 15 min + strides",
        "10 min fácil Z2 + 4×20s strides com recuperação completa. Acorda as pernas sem as cansar.", 3, 0, 18, paceForZone(weekPace, "Z2"));
      easyDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso pré-prova."));
      strengthDays.forEach(d => on(d, "rest", null, "Descanso", "Sem força pré-prova. Repouso completo."));
      on(longRunDay, "rest", null, "Descanso", "Repouso pré-prova. Prepara o equipamento e a nutrição.");
      return;
    }

    // ── SEMANA DE RECUPERAÇÃO ────────────────────────────────────────────────
    if (isRecovery) {
      const nRunDays = Math.max(qualityDays.length + easyDays.length + 1, 1);
      const recovKmPerDay = Math.max(Math.round(targetKm / nRunDays), 5);
      qualityDays.forEach(d => on(d, "recovery", "Z1", `Recovery ${recovKmPerDay} km`,
        "Trote Z1 muito leve. Se houver dor ou fadiga, substitui por caminhada.\nRPE máximo 3/10 — o objectivo é recuperar, não treinar.",
        recovKmPerDay, 0, null, paceForZone(baselinePace, "Z1")));
      easyDays.forEach(d => on(d, "recovery", "Z1", `Recovery ${recovKmPerDay} km`,
        "Circulação activa Z1. RPE máximo 3/10.",
        recovKmPerDay, 0, null, paceForZone(baselinePace, "Z1")));
      const longRecovKm = Math.max(Math.round(targetKm * 0.35), 12);
      on(longRunDay, "easy_z2", "Z2", `Easy longo ${longRecovKm} km`,
        `Primeiro long run pós-prova — completamente conversacional Z2.\nPace: ${fmtPace(paceForZone(baselinePace, "Z2"))}. Sem pressão de ritmo.`,
        longRecovKm, 0, null, paceForZone(baselinePace, "Z2"));
      // Força só na 2ª semana de recuperação (leve)
      if (weekNum > 1) {
        strengthDays[0] !== undefined && on(strengthDays[0], "strength_light", null, "Mobilidade e força leve 20 min",
          "Mobilidade articular, alongamentos activos, core leve. Sem carga — o objectivo é mover, não carregar.");
        strengthDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Sem força em recuperação."));
      } else {
        strengthDays.forEach(d => on(d, "rest", null, "Descanso", "Sem força na 1ª semana de recuperação."));
      }
      return;
    }

    // ── SEMANA DE TAPER ──────────────────────────────────────────────────────
    // TFUA: -40% volume, manter intensidade
    if (isTaper) {
      const longKm = Math.max(Math.round(targetKm * 0.35), 14);
      const easyKm = Math.max(Math.round(targetKm * 0.20), 8);
      const qualKm = Math.max(Math.round(targetKm * 0.15), 6);

      // Taper mantém intensidade com intervalos curtos Z4
      qualityDays[0] !== undefined && on(qualityDays[0], "intervals", "Z4", `Intervalos curtos ${qualKm} km`,
        `Aquecimento 10 min Z2 + 4×2 min Z4 (rec 2 min Z1) + 10 min Z2.\nMantém a velocidade, reduz o volume. Pace Z4: ${fmtPace(paceForZone(weekPace, "Z4"))}.`,
        qualKm, 0, null, paceForZone(weekPace, "Z4"));
      qualityDays[1] !== undefined && on(qualityDays[1], "easy_z2", "Z2", `Easy Z2 ${easyKm} km`,
        `Conversacional Z2. Pace: ${fmtPace(paceForZone(weekPace, "Z2"))}.`,
        easyKm, 0, null, paceForZone(weekPace, "Z2"));
      easyDays[0] !== undefined && on(easyDays[0], "easy_z2", "Z2", `Easy ${easyKm} km`,
        `Leve Z2. Pace: ${fmtPace(paceForZone(weekPace, "Z2"))}.`,
        easyKm, 0, null, paceForZone(weekPace, "Z2"));
      easyDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso no taper."));
      strengthDays[0] !== undefined && on(strengthDays[0], "strength_light", null, "Força leve 20 min",
        "Activação: lunges, single leg deadlift, core. Sem carga pesada — manter o músculo, não fatigar.");
      strengthDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso no taper."));
      on(longRunDay, "long_run", "Z2", `Long Run taper ${longKm} km`,
        `Terreno semelhante ao da prova. Pace Z2: ${fmtPace(paceForZone(weekPace, "Z2"))}.\nRelax — confia no trabalho feito. As pernas estão prontas.`,
        longKm, Math.round(targetVert * 0.40), null, paceForZone(weekPace, "Z2"));
      return;
    }

    // ── SEMANA NORMAL ────────────────────────────────────────────────────────
    const longKm = Math.max(
      Math.round(targetKm * 0.35),
      event.distance_km > 0 ? Math.round(event.distance_km * 0.25) : 0,
      12,
    );
    const qualKm = Math.max(Math.round(targetKm * 0.14), 5);
    const easyKm = Math.max(Math.round(targetKm * 0.16), 6);
    const vertKm = Math.max(Math.round(targetKm * 0.16), 6);
    const usedKm = longKm + qualKm * qualityDays.length + easyKm + vertKm;
    const recovKm = Math.max(targetKm - usedKm, 0);

    // Qualidade: Base=tempo Z3, Específico/Pico=intervalos Z4 (80/20)
    if (qualityDays[0] !== undefined) {
      if (phase === "Base") {
        on(qualityDays[0], "tempo", "Z3", `Tempo run ${qualKm} km`,
          `Aquecimento 15 min Z2 + ${Math.max(qualKm - 5, 3)} km Z3 contínuo + 10 min Z2.\nPace Z3: ${fmtPace(paceForZone(weekPace, "Z3"))}. Sensação: difícil mas sustentável.`,
          qualKm, 0, null, paceForZone(weekPace, "Z3"));
      } else {
        on(qualityDays[0], "intervals", "Z4", `Intervalos ${qualKm} km`,
          `Aquecimento 15 min Z2 + 6×3 min Z4 (rec 2 min Z1) + 10 min Z2.\nPace Z4: ${fmtPace(paceForZone(weekPace, "Z4"))}. RPE 8-9/10. Recuperação COMPLETA entre repetições.`,
          qualKm, 0, null, paceForZone(weekPace, "Z4"));
      }
    }

    qualityDays[1] !== undefined && on(qualityDays[1], "easy_z2", "Z2", `Easy Z2 ${easyKm} km`,
      `Completamente conversacional Z2. Pace: ${fmtPace(paceForZone(weekPace, "Z2"))}.\nSe ultrapassares Z2, abranda — este treino serve para recuperar.`,
      easyKm, Math.round(targetVert * 0.08), null, paceForZone(weekPace, "Z2"));

    // Vert session (Lyss Method — D+ semanal progressivo)
    easyDays[0] !== undefined && on(easyDays[0], "vert_session", "Z3",
      `Sessão de Vert ${vertKm} km / ${Math.round(targetVert * 0.42)}D+`,
      `Foco no D+ da semana — ${Math.round(targetVert * 0.42)}m de ganho.\nPower-hike em rampas >12-15%. Corre nas suaves.\nSem terreno: passadeira a 10-15%, stair stepper, ou degraus.`,
      vertKm, Math.round(targetVert * 0.42), null, null);

    if (easyDays[1] !== undefined) {
      recovKm >= 5
        ? on(easyDays[1], "recovery", "Z1", `Recovery ${recovKm} km`,
            `Trote Z1 muito leve. RPE 2-3/10. Pace: ${fmtPace(paceForZone(weekPace, "Z1"))}.\nSe estiveres cansado, substitui por caminhada de 30-40 min.`,
            recovKm, 0, null, paceForZone(weekPace, "Z1"))
        : on(easyDays[1], "rest", null, "Descanso", "Recuperação activa opcional: mobilidade, foam roller.");
    }

    // Força — ambos os dias
    strengthDays[0] !== undefined && on(strengthDays[0], "strength", null, "Força — Pernas 35-45 min",
      "Agachamentos, lunges búlgaros, step-ups, single leg deadlift, elevações de calcanhar.\n3×10-12 rep. Cadeia posterior e estabilidade unilateral.\nEste trabalho protege os joelhos nas descidas e alimenta as subidas.");
    strengthDays[1] !== undefined && on(strengthDays[1], "strength", null, "Força — Core & Tronco 30 min",
      "Prancha, bird-dog, dead bug, hip thrust, rotações com elástico.\nCore forte = transferência de potência nas subidas + proteção em descidas técnicas.");

    // Long run — back-to-back possível se longRunDay for sábado ou domingo
    const longRunVert = Math.round(targetVert * 0.44);
    if (isRBEWeek) {
      on(longRunDay, "downhill_repeats", "Z3",
        `Long Run + Downhill Repeats ${longKm} km / ${longRunVert}D+`,
        `REPEATED BOUT EFFECT — A sessão mais importante do ciclo.\n\nLong run normal (${Math.round(longKm * 0.65)} km Z2) + nos últimos ${Math.round(longKm * 0.35)} km:\n4-6× descidas íngremes de 3-5 min, carregando intencionalmente os quadríceps.\n\nUma única sessão excêntrica protege as coxas nas 3-4 semanas seguintes.\nPace Z2: ${fmtPace(paceForZone(weekPace, "Z2"))}.`,
        longKm, longRunVert, null, paceForZone(weekPace, "Z2"));
    } else {
      const terrainDesc =
        event.terrain_profile === "rolling"
          ? `Trail ondulado — ritmo estável a ${fmtPace(paceForZone(weekPace, "Z2"))}. Foco em economia de movimento.`
          : event.terrain_profile === "big_climbs"
          ? `Trail com subidas longas — power-hike nas rampas >15%. Pace corrível: ${fmtPace(paceForZone(weekPace, "Z2"))}.`
          : event.terrain_profile === "sustained"
          ? `Subida sustentada — alterna corrida (${fmtPace(paceForZone(weekPace, "Z2"))}) e marcha rápida conforme o declive.`
          : `Long run terreno variado — aproxima-te do perfil da prova. Pace Z2: ${fmtPace(paceForZone(weekPace, "Z2"))}.`;
      on(longRunDay, "long_run", "Z2",
        `Long Run ${longKm} km / ${longRunVert}D+`,
        terrainDesc, longKm, longRunVert, null, paceForZone(weekPace, "Z2"));
    }
  }

  // ─── Evento de manutenção ─────────────────────────────────────────────────

  const MAINTENANCE_EVENT: SeasonEvent = {
    id: "maintenance",
    date: "9999-12-31",
    name: "Manutenção",
    priority: "C",
    distance_km: 0,
    elevation_gain_m: 800,
    terrain_profile: "mixed",
    goal_type: "finish",
    target_time_minutes: null,
    target_pace_sec_per_km: null,
  };

  // ─── Bloco de manutenção ──────────────────────────────────────────────────

  function generateMaintenanceBlock(fromDate: Date, toDate: Date, startWeekNum: number) {
    const totalDays = differenceInDays(toDate, fromDate);
    if (totalDays < 4) return;
    const totalWeeks = Math.ceil(totalDays / 7);
    const planStart = startOfWeek(fromDate, { weekStartsOn: 1 });
    const maintenanceKm = Math.max(baselineKm, 45);
    const toDateStr = format(toDate, "yyyy-MM-dd");

    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = addDays(planStart, w * 7);
      const volFactor = (w + 1) % 3 === 0 ? 0.75 : 1.0;
      const targetKm = Math.round(maintenanceKm * volFactor);
      const phase = w % 2 === 0 ? "Base" : "Específico";
      const targetVert = weeklyVertTarget(800, phase, 0.5, volFactor);

      generateWeek({
        weekStart, weekNum: startWeekNum + w, phase,
        isRecovery: false, isTaper: false, isRaceWeek: false, isRBEWeek: false,
        targetKm, targetVert, weekPace: baselinePace,
        event: MAINTENANCE_EVENT, endDateStr: toDateStr, progressRatio: 0.5,
      });
    }
  }

  // ─── Bloco de recuperação standalone ─────────────────────────────────────
  // Começa no dia seguinte à prova, cobre as semanas de recovery

  function generateRecoveryBlock(fromDate: Date, priority: Priority, startWeekNum: number): Date {
    const weeks = recovWeeksFor(priority);
    if (weeks === 0) return fromDate;

    const planStart = startOfWeek(fromDate, { weekStartsOn: 1 });
    const recovKmBase = Math.max(Math.round(baselineKm * 0.45), 22);
    // endDate cobre semanas completas a partir do planStart
    const endDate = addDays(planStart, weeks * 7);
    const endDateStr = format(endDate, "yyyy-MM-dd");

    for (let w = 0; w < weeks; w++) {
      const weekStart = addDays(planStart, w * 7);
      const targetKm = Math.round(recovKmBase * (w === 0 ? 0.55 : 0.75));

      generateWeek({
        weekStart, weekNum: startWeekNum + w, phase: "Recuperação",
        isRecovery: true, isTaper: false, isRaceWeek: false, isRBEWeek: false,
        targetKm, targetVert: 0, weekPace: baselinePace,
        event: MAINTENANCE_EVENT, endDateStr, progressRatio: 0,
      });
    }
    return endDate;
  }

  // ─── Loop principal ───────────────────────────────────────────────────────

  let blockStart = new Date(today);
  let globalWeekNum = 1;

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
    const peakKm = Math.max(
      baselineKm * 1.8,
      event.distance_km > 0 ? event.distance_km * 1.1 : baselineKm * 2,
    );

    // Registar a prova
    addW({
      workout_date: event.date, workout_type: "race", zone: null,
      target_distance_km: event.distance_km,
      target_elevation_m: event.elevation_gain_m,
      target_duration_min: event.target_time_minutes ?? null,
      target_pace_sec_per_km: event.goal_type === "target_pace" ? event.target_pace_sec_per_km : null,
      title: `🏁 ${event.priority === "A" ? "" : `Prova ${event.priority}: `}${event.name} — ${event.distance_km}km / ${event.elevation_gain_m}D+`,
      description: event.priority === "A"
        ? `${event.target_time_minutes ? `Objetivo: ${Math.floor(event.target_time_minutes / 60)}h${(event.target_time_minutes % 60).toString().padStart(2, "0")}. ` : ""}Dia da prova âncora!\nComeça conservador — os primeiros 40% são para guardar energia.\nPower-hike nas subidas >15% desde o início.`
        : event.priority === "B"
        ? "Prova importante — simulação de ritmo e nutrição. Começa 5-10% mais lento que o objetivo."
        : "Prova de treino (C). Experimenta equipamento e nutrição. Sem pressão de resultado.",
      week_number: 0, phase: "Prova", race_id: event.id,
    });

    const daysUntilEvent = differenceInDays(eventDate, blockStart);

    // Prova muito próxima — só registar e gerar recovery/manutenção
    if (daysUntilEvent < 3) {
      // Recovery começa no dia seguinte
      const recoveryStart = addDays(eventDate, 1);
      // Próximo bloco de preparação começa após recovery
      const nextBlockStart = addDays(eventDate, recovDaysFor(event.priority) + 1);
      const isLastEvent = ei === futureEvents.length - 1;

      if (recovWeeksFor(event.priority) > 0) {
        generateRecoveryBlock(recoveryStart, event.priority, globalWeekNum);
        globalWeekNum += recovWeeksFor(event.priority);
      }

      if (isLastEvent) {
        generateMaintenanceBlock(nextBlockStart, addDays(nextBlockStart, 12 * 7), globalWeekNum);
      } else {
        const nextEventDate = parseDateLocal(futureEvents[ei + 1].date);
        const nextRecovWeeks = recovWeeksFor(futureEvents[ei + 1].priority);
        const gapDays = differenceInDays(nextEventDate, nextBlockStart);
        const maintenanceEnd = addDays(nextBlockStart, Math.max(gapDays - nextRecovWeeks * 7, 0));
        if (differenceInDays(maintenanceEnd, nextBlockStart) > 3) {
          generateMaintenanceBlock(nextBlockStart, maintenanceEnd, globalWeekNum);
        }
      }

      blockStart = nextBlockStart;
      continue;
    }

    // Bloco de preparação para esta prova
    const totalWeeks = Math.ceil(daysUntilEvent / 7);
    const planStart = startOfWeek(blockStart, { weekStartsOn: 1 });
    // Semanas de recovery do bloco anterior (só se não for o 1º evento)
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
        ? Math.max(Math.round(baselineKm * volFactor), 15)
        : Math.round((baselineKm + (peakKm - baselineKm) * progressRatio) * volFactor);

      const targetVert = isRecovery
        ? 0
        : weeklyVertTarget(event.elevation_gain_m, phase, progressRatio, volFactor);

      const weekPace = isRecovery ? baselinePace : racePace;

      generateWeek({
        weekStart, weekNum: globalWeekNum + w, phase, isRecovery,
        isTaper: !isRecovery && weeksToEvent <= 2,
        isRaceWeek: weeksToEvent === 0,
        isRBEWeek: !isRecovery && weeksToEvent === 3,
        targetKm, targetVert, weekPace, event,
        endDateStr: event.date, progressRatio,
      });
    }

    globalWeekNum += totalWeeks;

    // Recovery começa no dia SEGUINTE à prova — sem gap
    const recoveryStart = addDays(eventDate, 1);
    // Próximo bloco de preparação começa após o período de recovery
    const nextBlockStart = addDays(eventDate, recovDaysFor(event.priority) + 1);
    const isLastEvent = ei === futureEvents.length - 1;

    // SEMPRE gerar recovery após prova A ou B
    if (recovWeeksFor(event.priority) > 0) {
      generateRecoveryBlock(recoveryStart, event.priority, globalWeekNum);
      globalWeekNum += recovWeeksFor(event.priority);
    }

    if (isLastEvent) {
      // Última prova — manutenção pós-época
      generateMaintenanceBlock(nextBlockStart, addDays(nextBlockStart, 12 * 7), globalWeekNum);
    } else {
      // Gap entre provas — manutenção
      const nextEventDate = parseDateLocal(futureEvents[ei + 1].date);
      const nextRecovWeeks = recovWeeksFor(futureEvents[ei + 1].priority);
      const gapDays = differenceInDays(nextEventDate, nextBlockStart);
      const maintenanceEnd = addDays(nextBlockStart, Math.max(gapDays - nextRecovWeeks * 7, 0));
      if (differenceInDays(maintenanceEnd, nextBlockStart) > 3) {
        generateMaintenanceBlock(nextBlockStart, maintenanceEnd, globalWeekNum);
      }
    }

    blockStart = nextBlockStart;
  }

  return allWorkouts.sort((a, b) => a.workout_date.localeCompare(b.workout_date));
}
