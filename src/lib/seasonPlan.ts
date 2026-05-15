/**
 * src/lib/seasonPlan.ts
 *
 * Motor de planeamento de época — Trail Forge AI
 * Metodologia: Training for the Uphill Athlete (House/Johnston/Jornet) + Lyss Method
 *
 * Princípios aplicados:
 * • TEMPO como métrica principal (time on feet) — distância é estimativa
 * • 80/20 polarizado — 80% Z1/Z2, 20% Z4/Z5. Z3 só em Base.
 * • Aquecimento + bloco principal + arrefecimento contabilizados no target_duration_min
 * • D+ semanal progressivo por fase (Lyss: Base 30-40%, Build 50-70%, Peak 80-100%)
 * • Hill repeats nas fases Específico/Pico (alterna com intervalos)
 * • Back-to-back long runs nas semanas de Pico para provas >42km
 * • Repeated Bout Effect: semana 3 antes da prova
 * • Deload a cada 3ª semana (75% volume)
 * • Recovery começa no dia seguinte à prova — sem gap
 * • Todos os 7 dias têm sempre algo
 * • Um dia nunca tem mais de um treino de corrida
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
  baselinePace: number;       // seg/km pace base do atleta
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

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
}

// ─── Conversão tempo ↔ distância ─────────────────────────────────────────────
// Distância é estimativa a partir do tempo e do pace de zona

function estKm(durationMin: number, paceSecPerKm: number): number {
  if (!paceSecPerKm || paceSecPerKm <= 0) return 0;
  return Math.round((durationMin * 60 / paceSecPerKm) * 10) / 10;
}

// Volume semanal base em minutos
function kmToMinutes(km: number, paceSecPerKm: number): number {
  return Math.round(km * paceSecPerKm / 60);
}

// ─── Recuperação pós-prova ────────────────────────────────────────────────────

function recovWeeksFor(priority: Priority): number {
  return priority === "A" ? 2 : priority === "B" ? 1 : 0;
}

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
  let pct: number;
  if (phase === "Base")       pct = 0.30 + 0.10 * progressRatio;
  else if (phase === "Específico") pct = 0.50 + 0.20 * progressRatio;
  else if (phase === "Pico")  pct = 0.80 + 0.20 * progressRatio;
  else if (phase === "Taper") pct = 0.40;
  else pct = 0.25;
  return Math.round(baseVert * pct * volFactor);
}

// ─── Volume semanal ───────────────────────────────────────────────────────────

function volFactorFor(weekIdx: number, weeksToEvent: number): number {
  if (weeksToEvent === 0) return 0.25;
  if (weeksToEvent === 1) return 0.55; // taper: -45% (TFUA recomenda -40 a -60%)
  if (weeksToEvent === 2) return 0.70;
  if ((weekIdx + 1) % 3 === 0) return 0.75; // deload a cada 3ª semana
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

  // Volume base em minutos/semana
  const baselineMinutes = kmToMinutes(baselineKm, baselinePace);

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

  // Dia antes do longRunDay para back-to-back (se disponível para corrida)
  const longRunDayIdx = availableRunDays.indexOf(longRunDay);
  const backToBackDay = longRunDayIdx > 0 ? availableRunDays[longRunDayIdx - 1] : null;

  const allEventDates = new Set(futureEvents.map(e => e.date));
  const allWorkouts: SeasonPlannedWorkout[] = [];

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
      if (usedRunDates.has(w.workout_date)) return;
      if (usedRestDates.has(w.workout_date)) return;
      usedRestDates.add(w.workout_date);
      allWorkouts.push(w);
      return;
    }

    // Treino de corrida — um por dia, prevalece sobre descanso
    if (usedRunDates.has(w.workout_date)) return;
    const restIdx = allWorkouts.findIndex(x => x.workout_date === w.workout_date && x.workout_type === "rest");
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
    isBackToBack: boolean;
    targetMinutes: number;
    targetVert: number;
    weekPace: number;
    event: SeasonEvent;
    endDateStr: string;
    progressRatio: number;
    qualityIdx: number; // alterna tipos de qualidade entre semanas
  }) {
    const {
      weekStart, weekNum, phase, isRecovery, isTaper, isRaceWeek, isRBEWeek,
      isBackToBack, targetMinutes, targetVert, weekPace, event, endDateStr,
      progressRatio, qualityIdx,
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

    // Descanso nos dias de repouso
    restDays.forEach(d =>
      on(d, "rest", null, "Descanso", "Recuperação activa: mobilidade, foam roller, caminhada leve."));

    // ── SEMANA DA PROVA ──────────────────────────────────────────────────────
    if (isRaceWeek) {
      // Soltar pernas — 20 min muito leve
      qualityDays[0] !== undefined && on(qualityDays[0], "easy_z2", "Z2", "Soltar pernas 20 min",
        `Z2 muito leve — trote conversacional. Não faças mais do que o planeado.\nTotal: 20 min | Pace: ${fmtPace(paceForZone(weekPace, "Z2"))}.`,
        estKm(20, paceForZone(weekPace, "Z2")), 0, 20, paceForZone(weekPace, "Z2"));
      qualityDays[1] !== undefined && on(qualityDays[1], "rest", null, "Descanso", "Repouso activo pré-prova.");
      // Activação — 15 min + strides
      easyDays[0] !== undefined && on(easyDays[0], "easy_z2", "Z2", "Activação 15 min + strides",
        "10 min Z2 fácil + 4×20s strides com recuperação completa (60s caminhar entre cada).\nAcorda as pernas sem as cansar. Total: ~18 min.",
        estKm(18, paceForZone(weekPace, "Z2")), 0, 18, paceForZone(weekPace, "Z2"));
      easyDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso pré-prova."));
      strengthDays.forEach(d => on(d, "rest", null, "Descanso", "Sem força pré-prova. Repouso completo."));
      on(longRunDay, "rest", null, "Descanso", "Repouso pré-prova. Prepara o equipamento, a nutrição e o drop bag.");
      return;
    }

    // ── SEMANA DE RECUPERAÇÃO ────────────────────────────────────────────────
    if (isRecovery) {
      const nRunDays = Math.max(qualityDays.length + easyDays.length + 1, 1);
      const recovMinPerDay = Math.max(Math.round(targetMinutes / nRunDays), 20);
      const recovKmPerDay = estKm(recovMinPerDay, paceForZone(baselinePace, "Z1"));

      qualityDays.forEach(d => on(d, "recovery", "Z1", `Recovery ${fmtDur(recovMinPerDay)}`,
        `Z1 muito leve — se houver dor ou fadiga, substitui por caminhada.\nRPE máximo 3/10. O objectivo é recuperar, não treinar.\nTotal: ${fmtDur(recovMinPerDay)} | Pace: ${fmtPace(paceForZone(baselinePace, "Z1"))}.`,
        recovKmPerDay, 0, recovMinPerDay, paceForZone(baselinePace, "Z1")));

      easyDays.forEach(d => on(d, "recovery", "Z1", `Recovery ${fmtDur(recovMinPerDay)}`,
        `Circulação activa Z1. RPE máximo 3/10.\nTotal: ${fmtDur(recovMinPerDay)}.`,
        recovKmPerDay, 0, recovMinPerDay, paceForZone(baselinePace, "Z1")));

      // Long run de recuperação — pelo menos 50 min
      const longRecovMin = Math.max(Math.round(targetMinutes * 0.40), 50);
      const longRecovKm = estKm(longRecovMin, paceForZone(baselinePace, "Z2"));
      on(longRunDay, "easy_z2", "Z2", `Easy longo ${fmtDur(longRecovMin)}`,
        `Primeiro long run pós-prova — completamente conversacional Z2.\nSem pressão de ritmo ou distância. Ouve o corpo.\nPace: ${fmtPace(paceForZone(baselinePace, "Z2"))} | Total: ${fmtDur(longRecovMin)}.`,
        longRecovKm, 0, longRecovMin, paceForZone(baselinePace, "Z2"));

      // Força só na 2ª semana de recuperação (leve)
      if (weekNum > 1) {
        strengthDays[0] !== undefined && on(strengthDays[0], "strength_light", null, "Mobilidade e activação 20 min",
          "Mobilidade articular, alongamentos activos, core leve.\nSem carga — o objectivo é mover, não carregar. Duração: 20 min.");
        strengthDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Sem força em recuperação."));
      } else {
        strengthDays.forEach(d => on(d, "rest", null, "Descanso", "Sem força na 1ª semana de recuperação."));
      }
      return;
    }

    // ── SEMANA DE TAPER ──────────────────────────────────────────────────────
    if (isTaper) {
      // TFUA: -40 a -55% volume, manter intensidade
      const longMin = Math.max(Math.round(targetMinutes * 0.35), 60);
      const easyMin = Math.max(Math.round(targetMinutes * 0.18), 30);

      // Intervalos curtos Z4 — mantém a velocidade no taper
      const warmupMin = 15; const workMin = 4 * 2; const recMin = 4 * 2; const coolMin = 10;
      const intervalTotalMin = warmupMin + workMin + recMin + coolMin; // ~43 min
      if (qualityDays[0] !== undefined) {
        on(qualityDays[0], "intervals", "Z4", `Intervalos curtos ${fmtDur(intervalTotalMin)}`,
          `AQUECIMENTO: 15 min Z2 progressivo.\nBLOCO: 4×2 min Z4 (rec 2 min Z1 caminhar entre cada).\nARREFECIMENTO: 10 min Z1/Z2.\n\nMantém a velocidade, reduz o volume. Pace Z4: ${fmtPace(paceForZone(weekPace, "Z4"))}.\nTotal: ${fmtDur(intervalTotalMin)}.`,
          estKm(intervalTotalMin, paceForZone(weekPace, "Z2")), 0, intervalTotalMin, paceForZone(weekPace, "Z4"));
      }
      if (qualityDays[1] !== undefined) {
        on(qualityDays[1], "easy_z2", "Z2", `Easy Z2 ${fmtDur(easyMin)}`,
          `Z2 conversacional. Pace: ${fmtPace(paceForZone(weekPace, "Z2"))}.\nTotal: ${fmtDur(easyMin)}.`,
          estKm(easyMin, paceForZone(weekPace, "Z2")), 0, easyMin, paceForZone(weekPace, "Z2"));
      }
      easyDays[0] !== undefined && on(easyDays[0], "easy_z2", "Z2", `Easy ${fmtDur(easyMin)}`,
        `Leve Z2. Pace: ${fmtPace(paceForZone(weekPace, "Z2"))}. Total: ${fmtDur(easyMin)}.`,
        estKm(easyMin, paceForZone(weekPace, "Z2")), 0, easyMin, paceForZone(weekPace, "Z2"));
      easyDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso no taper."));
      strengthDays[0] !== undefined && on(strengthDays[0], "strength_light", null, "Activação muscular 20 min",
        "Lunges, single leg deadlift, core, elevações de calcanhar.\nSem carga — activar, não fatigar. Duração: 20 min.");
      strengthDays.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso no taper."));

      const longVertTaper = Math.round(targetVert * 0.40);
      const longKmTaper = estKm(longMin, paceForZone(weekPace, "Z2"));
      on(longRunDay, "long_run", "Z2", `Long Run taper ${fmtDur(longMin)}`,
        `Terreno semelhante ao da prova. Z2 completamente controlado.\nPace: ${fmtPace(paceForZone(weekPace, "Z2"))} | D+: ${longVertTaper}m | Total: ${fmtDur(longMin)}.\nRelax — o trabalho está feito. As pernas estão prontas.`,
        longKmTaper, longVertTaper, longMin, paceForZone(weekPace, "Z2"));
      return;
    }

    // ── SEMANA NORMAL ────────────────────────────────────────────────────────

    // Distribuição do tempo semanal (80/20 polarizado):
    // Long run: 35-40% do tempo total
    // Qualidade (2 sessões): ~20% total
    // Easy Z2: ~15%
    // Vert session: ~15%
    // Recovery: restante

    const longMin = Math.max(Math.round(targetMinutes * 0.38), 75);
    const qualMin = Math.max(Math.round(targetMinutes * 0.10), 40); // por sessão de qualidade
    const easyMin = Math.max(Math.round(targetMinutes * 0.14), 35);
    const vertMin = Math.max(Math.round(targetMinutes * 0.14), 35);
    const assignedMin = longMin + qualMin * qualityDays.length + easyMin + vertMin;
    const recovMin = Math.max(targetMinutes - assignedMin, 0);

    // ── Qualidade ─────────────────────────────────────────────────────────────
    // Base: Tempo run Z3 (construir LT2 — TFUA permite em Base)
    // Específico: alterna Intervalos Z4 e Hill Repeats
    // Pico: alterna Uphill Intervals e Intervalos Z4

    if (qualityDays[0] !== undefined) {
      if (phase === "Base") {
        // Tempo run com aquecimento + arrefecimento
        const warmup = 15; const mainBlock = Math.max(qualMin - 25, 10); const cooldown = 10;
        const totalMin = warmup + mainBlock + cooldown;
        on(qualityDays[0], "tempo", "Z3", `Tempo run ${fmtDur(totalMin)}`,
          `AQUECIMENTO: ${warmup} min Z2 progressivo (começa leve, termina no topo de Z2).\nBLOCO PRINCIPAL: ${mainBlock} min Z3 contínuo.\nARREFECIMENTO: ${cooldown} min Z1/Z2.\n\nSensação Z3: difícil mas sustentável — frases curtas apenas.\nPace Z3: ${fmtPace(paceForZone(weekPace, "Z3"))} | Total: ${fmtDur(totalMin)}.`,
          estKm(totalMin, paceForZone(weekPace, "Z3")), 0, totalMin, paceForZone(weekPace, "Z3"));

      } else if (phase === "Específico") {
        // Alterna intervalos Z4 e hill repeats (baseado no índice da semana)
        if (qualityIdx % 2 === 0) {
          // Intervalos Z4 — VO2max
          const sets = 6; const setMin = 3; const recMin2 = 2;
          const warmup = 15; const work = sets * setMin; const rec = (sets - 1) * recMin2; const cooldown = 10;
          const totalMin = warmup + work + rec + cooldown;
          on(qualityDays[0], "intervals", "Z4", `Intervalos ${fmtDur(totalMin)}`,
            `AQUECIMENTO: ${warmup} min Z2 progressivo.\nBLOCO: ${sets}×${setMin} min Z4 com ${recMin2} min Z1 (caminhar) de recuperação entre cada.\nARREFECIMENTO: ${cooldown} min Z1/Z2.\n\nPace Z4: ${fmtPace(paceForZone(weekPace, "Z4"))} | RPE: 8-9/10 nos intervalos.\nRecuperação COMPLETA — não cortes o tempo de descanso.\nTotal: ${fmtDur(totalMin)}.`,
            estKm(totalMin, paceForZone(weekPace, "Z2")), 0, totalMin, paceForZone(weekPace, "Z4"));
        } else {
          // Hill repeats — potência em subida (TFUA: fundamental para trail)
          const sets = 8; const setMin2 = 1; const recMin3 = 2;
          const warmup = 15; const work = sets * setMin2; const rec = sets * recMin3; const cooldown = 10;
          const totalMin = warmup + work + rec + cooldown;
          on(qualityDays[0], "hill_repeats", "Z4", `Hill Repeats ${fmtDur(totalMin)}`,
            `AQUECIMENTO: ${warmup} min Z2 em terreno plano.\nBLOCO: ${sets}×${setMin2} min em subida íngreme (>10% declive) a Z4/Z5.\nRecuperação: ${recMin3} min a descer a caminhar (controlo excêntrico).\nARREFECIMENTO: ${cooldown} min Z1 plano.\n\nFoco na potência de subida — não no pace. RPE: 8-9/10 nas subidas.\nSem terreno? Passadeira a 10-15% inclinação.\nTotal: ${fmtDur(totalMin)}.`,
            estKm(totalMin, paceForZone(weekPace, "Z2")), Math.round(targetVert * 0.15), totalMin, paceForZone(weekPace, "Z4"));
        }

      } else {
        // Pico: alterna uphill intervals longos e intervalos Z4
        if (qualityIdx % 2 === 0) {
          // Uphill intervals — específico de prova (TFUA: Specific phase)
          const sets = 4; const setMin3 = 5; const recMin4 = 3;
          const warmup = 15; const work = sets * setMin3; const rec = (sets - 1) * recMin4; const cooldown = 10;
          const totalMin = warmup + work + rec + cooldown;
          on(qualityDays[0], "hill_repeats", "Z4", `Uphill Intervals ${fmtDur(totalMin)}`,
            `AQUECIMENTO: ${warmup} min Z2 progressivo.\nBLOCO: ${sets}×${setMin3} min em subida moderada-íngreme (6-12%) a Z4.\nRecuperação: ${recMin4} min a descer controlado (excêntrico).\nARREFECIMENTO: ${cooldown} min Z1.\n\nEste é o treino mais específico para a tua prova — simula as subidas longas.\nAlterna corrida e power-hike conforme o declive e o RPE.\nTotal: ${fmtDur(totalMin)}.`,
            estKm(totalMin, paceForZone(weekPace, "Z2")), Math.round(targetVert * 0.25), totalMin, paceForZone(weekPace, "Z4"));
        } else {
          // Intervalos Z4 clássicos
          const sets = 6; const setMin4 = 3; const recMin5 = 2;
          const warmup = 15; const work = sets * setMin4; const rec = (sets - 1) * recMin5; const cooldown = 10;
          const totalMin = warmup + work + rec + cooldown;
          on(qualityDays[0], "intervals", "Z4", `Intervalos ${fmtDur(totalMin)}`,
            `AQUECIMENTO: ${warmup} min Z2.\nBLOCO: ${sets}×${setMin4} min Z4 (rec ${recMin5} min Z1).\nARREFECIMENTO: ${cooldown} min Z1/Z2.\n\nPace Z4: ${fmtPace(paceForZone(weekPace, "Z4"))} | Total: ${fmtDur(totalMin)}.`,
            estKm(totalMin, paceForZone(weekPace, "Z2")), 0, totalMin, paceForZone(weekPace, "Z4"));
        }
      }
    }

    // Easy Z2
    if (qualityDays[1] !== undefined) {
      on(qualityDays[1], "easy_z2", "Z2", `Easy Z2 ${fmtDur(easyMin)}`,
        `Z2 completamente conversacional — 80% da semana é isto.\nPace: ${fmtPace(paceForZone(weekPace, "Z2"))} | Total: ${fmtDur(easyMin)}.\nSe ultrapassares Z2, abranda — este treino serve para recuperar e construir base aeróbica.`,
        estKm(easyMin, paceForZone(weekPace, "Z2")), Math.round(targetVert * 0.08), easyMin, paceForZone(weekPace, "Z2"));
    }

    // Vert session — foco no D+ semanal (Lyss Method)
    if (easyDays[0] !== undefined) {
      const vertSessionVert = Math.round(targetVert * 0.42);
      on(easyDays[0], "vert_session", "Z2", `Sessão de Vert ${fmtDur(vertMin)}`,
        `Foco em acumular D+ — ${vertSessionVert}m de elevação nesta sessão.\n\nESTRATÉGIA:\n• Power-hike em rampas >12-15% (é mais eficiente do que correr)\n• Corre nas secções suaves e planas\n• Treina a transição corrida/caminhada — competência chave em trail\n\nSem terreno? Passadeira a 10-15%, stair stepper, ou degraus.\nTotal: ${fmtDur(vertMin)} | D+ alvo: ${vertSessionVert}m.`,
        estKm(vertMin, paceForZone(weekPace, "Z2")), vertSessionVert, vertMin, null);
    }

    // Recovery ou descanso no segundo easy day
    if (easyDays[1] !== undefined) {
      if (recovMin >= 20) {
        on(easyDays[1], "recovery", "Z1", `Recovery ${fmtDur(recovMin)}`,
          `Z1 muito leve. RPE 2-3/10.\nPace: ${fmtPace(paceForZone(weekPace, "Z1"))} | Total: ${fmtDur(recovMin)}.\nSe estiveres cansado, substitui por caminhada de 30-40 min.`,
          estKm(recovMin, paceForZone(weekPace, "Z1")), 0, recovMin, paceForZone(weekPace, "Z1"));
      } else {
        on(easyDays[1], "rest", null, "Descanso", "Recuperação activa: mobilidade, foam roller.");
      }
    }

    // ── Força ─────────────────────────────────────────────────────────────────
    strengthDays[0] !== undefined && on(strengthDays[0], "strength", null, "Força — Pernas 40 min",
      "AQUECIMENTO: 5 min mobilidade articular.\n\nBLOCO PRINCIPAL (3×10-12 rep cada):\n• Agachamento goblet ou barra\n• Lunges búlgaros\n• Step-ups com peso\n• Single leg deadlift\n• Elevações de calcanhar\n\nFoco na cadeia posterior e estabilidade unilateral.\nEste trabalho protege os joelhos nas descidas e alimenta as subidas.\nDuração: 40 min.");
    strengthDays[1] !== undefined && on(strengthDays[1], "strength", null, "Força — Core & Estabilidade 30 min",
      "AQUECIMENTO: 5 min mobilidade.\n\nBLOCO (3 séries):\n• Prancha frontal e lateral 30-45s\n• Bird-dog 10 rep/lado\n• Dead bug 10 rep/lado\n• Hip thrust 12 rep\n• Pallof press 10 rep/lado\n• Rotações com elástico\n\nCore forte = transferência de potência nas subidas + proteção em descidas técnicas.\nDuração: 30 min.");

    // ── Long run ──────────────────────────────────────────────────────────────
    const longVertMain = Math.round(targetVert * 0.44);
    const longKmMain = estKm(longMin, paceForZone(weekPace, "Z2"));

    if (isRBEWeek) {
      // Repeated Bout Effect — 3 semanas antes da prova
      const rbeDescMin = Math.round(longMin * 0.65);
      const rbeIntMin = Math.round(longMin * 0.35);
      on(longRunDay, "downhill_repeats", "Z2",
        `Long Run + Downhill Repeats ${fmtDur(longMin)}`,
        `REPEATED BOUT EFFECT — A sessão mais importante do ciclo de treino.\n\nFASE 1 — Long run normal: ${fmtDur(rbeDescMin)} Z2.\nPace: ${fmtPace(paceForZone(weekPace, "Z2"))}.\n\nFASE 2 — Downhill repeats: nos últimos ${fmtDur(rbeIntMin)}:\n4-6× descidas íngremes de 3-5 min, carregando INTENCIONALMENTE os quadríceps.\nRecupera a subir devagar entre cada.\n\nPORQUÊ: uma única sessão excêntrica intensa protege as coxas nas 3-4 semanas seguintes.\nResultado na prova: drasticamente menos dores musculares nas descidas.\n\nTotal: ${fmtDur(longMin)} | D+: ${longVertMain}m.`,
        longKmMain, longVertMain, longMin, paceForZone(weekPace, "Z2"));

    } else if (isBackToBack && event.distance_km >= 42) {
      // Back-to-back long runs — para provas de ultra (>42km)
      // Sábado: easy longo moderado; Domingo: long run principal
      const b2bDay = backToBackDay;
      const b2bMin = Math.round(longMin * 0.55); // 55% no dia anterior
      const b2bKm = estKm(b2bMin, paceForZone(weekPace, "Z2"));
      const b2bVert = Math.round(longVertMain * 0.40);

      if (b2bDay !== null) {
        on(b2bDay, "easy_z2", "Z2", `Back-to-Back Dia 1 — Easy longo ${fmtDur(b2bMin)}`,
          `BACK-TO-BACK — Dia 1 de 2. Treino com pernas pré-fatigadas.\n\nZ2 completamente conversacional. Não tentes ir mais rápido.\nO objectivo é acumular tempo nos pés com pernas cansadas — exactamente como numa ultra.\nPace: ${fmtPace(paceForZone(weekPace, "Z2"))} | D+: ${b2bVert}m | Total: ${fmtDur(b2bMin)}.`,
          b2bKm, b2bVert, b2bMin, paceForZone(weekPace, "Z2"));
      }

      on(longRunDay, "long_run", "Z2",
        `Back-to-Back Dia 2 — Long Run ${fmtDur(longMin)}`,
        `BACK-TO-BACK — Dia 2 de 2. Este é o treino mais importante da semana.\n\nCorres com pernas fatigadas do dia anterior — é esse o ponto.\nMantém Z2 mesmo que o ritmo seja mais lento. Não pares para descansar.\nPower-hike nas subidas >12%.\n\nPace: ${fmtPace(paceForZone(weekPace, "Z2"))} | D+: ${longVertMain}m | Total: ${fmtDur(longMin)}.`,
        longKmMain, longVertMain, longMin, paceForZone(weekPace, "Z2"));

    } else {
      // Long run normal
      const terrainDesc =
        event.terrain_profile === "rolling"
          ? `Trail ondulado — mantém ritmo estável.\nFoco em economia de movimento: braços baixos, passada eficiente, cadência 170-180 passos/min.\nNão aceleres nas descidas — guarda as pernas para a segunda metade.`
          : event.terrain_profile === "big_climbs"
          ? `Trail com subidas longas — power-hike nas rampas >15% (é mais rápido e eficiente do que correr).\nTreina a transição corrida/caminhada — esta competência decide a prova.`
          : event.terrain_profile === "sustained"
          ? `Subida sustentada — alterna corrida e marcha rápida conforme o declive.\nNunca pares completamente — marcha rápida e intencional quando não consegues correr.`
          : `Long run em terreno variado — aproxima-te do perfil da prova.\nAlterna corrida e power-hike conforme o terreno.`;

      on(longRunDay, "long_run", "Z2",
        `Long Run ${fmtDur(longMin)}`,
        `${terrainDesc}\n\nPace Z2: ${fmtPace(paceForZone(weekPace, "Z2"))} | D+: ${longVertMain}m | Total: ${fmtDur(longMin)}.`,
        longKmMain, longVertMain, longMin, paceForZone(weekPace, "Z2"));
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
    const maintenanceMinutes = Math.max(baselineMinutes, 270); // mínimo 4h30/semana
    const toDateStr = format(toDate, "yyyy-MM-dd");

    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = addDays(planStart, w * 7);
      const volFactor = (w + 1) % 3 === 0 ? 0.75 : 1.0;
      const targetMinutes2 = Math.round(maintenanceMinutes * volFactor);
      const phase = w % 2 === 0 ? "Base" : "Específico";
      const targetVert = weeklyVertTarget(800, phase, 0.5, volFactor);

      generateWeek({
        weekStart, weekNum: startWeekNum + w, phase,
        isRecovery: false, isTaper: false, isRaceWeek: false, isRBEWeek: false,
        isBackToBack: false,
        targetMinutes: targetMinutes2, targetVert, weekPace: baselinePace,
        event: MAINTENANCE_EVENT, endDateStr: toDateStr, progressRatio: 0.5,
        qualityIdx: w,
      });
    }
  }

  // ─── Bloco de recuperação standalone ─────────────────────────────────────

  function generateRecoveryBlock(fromDate: Date, priority: Priority, startWeekNum: number): Date {
    const weeks = recovWeeksFor(priority);
    if (weeks === 0) return fromDate;

    const planStart = startOfWeek(fromDate, { weekStartsOn: 1 });
    const recovBase = Math.max(Math.round(baselineMinutes * 0.45), 120); // mínimo 2h/semana
    const endDate = addDays(planStart, weeks * 7);
    const endDateStr = format(endDate, "yyyy-MM-dd");

    for (let w = 0; w < weeks; w++) {
      const weekStart = addDays(planStart, w * 7);
      const targetMinutes3 = Math.round(recovBase * (w === 0 ? 0.55 : 0.75));

      generateWeek({
        weekStart, weekNum: startWeekNum + w, phase: "Recuperação",
        isRecovery: true, isTaper: false, isRaceWeek: false, isRBEWeek: false,
        isBackToBack: false,
        targetMinutes: targetMinutes3, targetVert: 0, weekPace: baselinePace,
        event: MAINTENANCE_EVENT, endDateStr, progressRatio: 0,
        qualityIdx: w,
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
    // Volume de pico baseado no tempo de prova (se disponível) ou na distância
    const peakMinutes = event.target_time_minutes
      ? Math.max(baselineMinutes * 1.6, event.target_time_minutes * 0.8)
      : Math.max(baselineMinutes * 1.8, kmToMinutes(event.distance_km * 1.1, racePace));

    // Registar a prova
    addW({
      workout_date: event.date, workout_type: "race", zone: null,
      target_distance_km: event.distance_km,
      target_elevation_m: event.elevation_gain_m,
      target_duration_min: event.target_time_minutes ?? null,
      target_pace_sec_per_km: event.goal_type === "target_pace" ? event.target_pace_sec_per_km : null,
      title: `🏁 ${event.priority === "A" ? "" : `Prova ${event.priority}: `}${event.name} — ${event.distance_km}km / ${event.elevation_gain_m}D+`,
      description: event.priority === "A"
        ? `${event.target_time_minutes ? `Objetivo: ${fmtDur(event.target_time_minutes)}. ` : ""}Dia da prova âncora!\n\nESTRATÉGIA:\n• Começa conservador — os primeiros 40% são para guardar energia\n• Power-hike nas subidas >15% desde o início\n• Executa o plano de nutrição: come antes de ter fome, bebe antes de ter sede\n• A segunda metade da prova é onde ganhas (ou perdes) posições`
        : event.priority === "B"
        ? "Prova importante — simulação de ritmo e nutrição.\nComeça 5-10% mais lento que o objetivo. Pratica a estratégia de power-hike."
        : "Prova de treino (C). Experimenta equipamento e nutrição. Sem pressão de resultado.",
      week_number: 0, phase: "Prova", race_id: event.id,
    });

    const daysUntilEvent = differenceInDays(eventDate, blockStart);

    if (daysUntilEvent < 3) {
      const recoveryStart = addDays(eventDate, 1);
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

    const totalWeeks = Math.ceil(daysUntilEvent / 7);
    const planStart = startOfWeek(blockStart, { weekStartsOn: 1 });
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

      const targetMinutes4 = isRecovery
        ? Math.max(Math.round(baselineMinutes * volFactor), 90)
        : Math.round((baselineMinutes + (peakMinutes - baselineMinutes) * progressRatio) * volFactor);

      const targetVert = isRecovery
        ? 0
        : weeklyVertTarget(event.elevation_gain_m, phase, progressRatio, volFactor);

      const weekPace = isRecovery ? baselinePace : racePace;

      // Back-to-back só nas semanas de Pico para provas longas
      const doBackToBack = phase === "Pico" && event.distance_km >= 42 && backToBackDay !== null;

      generateWeek({
        weekStart, weekNum: globalWeekNum + w, phase, isRecovery,
        isTaper: !isRecovery && weeksToEvent <= 2,
        isRaceWeek: weeksToEvent === 0,
        isRBEWeek: !isRecovery && weeksToEvent === 3,
        isBackToBack: doBackToBack,
        targetMinutes: targetMinutes4, targetVert, weekPace, event,
        endDateStr: event.date, progressRatio,
        qualityIdx: trainingWeekIdx,
      });
    }

    globalWeekNum += totalWeeks;

    // Recovery imediato após a prova — sem gap
    const recoveryStart = addDays(eventDate, 1);
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
  }

  return allWorkouts.sort((a, b) => a.workout_date.localeCompare(b.workout_date));
}
