/**
 * Trail Forge — Motor de Planeamento (Método Lyss + 80/20)
 *
 * Princípios baseados em:
 *  - "Training for the Uphill Athlete" (House, Johnston, Jornet)
 *  - "How to Train for Vert" — Dr. Alyssa Olenick / The Lyss Method
 *
 * Regras-chave:
 *  - 80% do volume em Z2 (baixa intensidade aeróbia)
 *  - 20% em intensidade (Z3-Z5)
 *  - D+ semanal: 50%-100% do D+ da prova âncora (Lyss)
 *  - Progressão de volume: aumento ~10% por semana, semana de descarga 4ª
 *  - Long run no fim-de-semana, replicando perfil da prova
 *  - Repeated Bout Effect: 1 sessão hard de descida 3-4 semanas antes da prova
 *  - Tapering nas últimas 2-3 semanas antes da Prova A
 *  - Time on feet > km para provas com muito desnível
 */

import { addDays, differenceInDays, format, startOfWeek, isBefore, isAfter } from "date-fns";

export type WorkoutType =
  | "easy_z2" | "long_run" | "tempo" | "intervals" | "hill_repeats"
  | "vert_session" | "downhill_repeats" | "recovery" | "rest"
  | "strength" | "cross_training" | "race";

export type Zone = "Z1" | "Z2" | "Z3" | "Z4" | "Z5";

export type TerrainProfile = "rolling" | "big_climbs" | "sustained" | "mixed";

export interface PlannerInput {
  startDate: Date;
  raceDate: Date;
  raceDistanceKm: number;
  raceElevationM: number;
  terrainProfile: TerrainProfile;
  baselineKmPerWeek: number;
  baselineAvgPaceSecPerKm: number; // pace base do atleta
}

export interface PlannedWorkout {
  workout_date: string; // YYYY-MM-DD
  workout_type: WorkoutType;
  zone: Zone | null;
  target_distance_km: number | null;
  target_elevation_m: number | null;
  target_duration_min: number | null;
  target_pace_sec_per_km: number | null;
  title: string;
  description: string;
  week_number: number;
  phase: string;
}

const PHASES = {
  BASE: "Base",
  BUILD: "Específico",
  PEAK: "Pico",
  TAPER: "Taper",
  RACE: "Prova",
} as const;

/** Escalonador de pace — deriva paces de cada zona a partir do pace base do atleta */
function paceForZone(basePaceSecPerKm: number, zone: Zone): number {
  const factors: Record<Zone, number> = {
    Z1: 1.20,  // ~20% mais lento que pace base
    Z2: 1.10,
    Z3: 1.00,
    Z4: 0.92,
    Z5: 0.85,
  };
  return Math.round(basePaceSecPerKm * factors[zone]);
}

/** Determina a fase da semana em função do nº de semanas até à prova */
function phaseForWeek(weeksToRace: number, totalWeeks: number): string {
  if (weeksToRace <= 1) return PHASES.TAPER;
  if (weeksToRace <= 2) return PHASES.TAPER;
  if (weeksToRace <= 4) return PHASES.PEAK;
  if (weeksToRace <= Math.ceil(totalWeeks * 0.45)) return PHASES.BUILD;
  return PHASES.BASE;
}

/** Volume semanal alvo com progressão e descargas a cada 4ª semana */
function weeklyVolumeKm(
  weekIdx: number,
  totalWeeks: number,
  baselineKm: number,
  raceDistanceKm: number,
  weeksToRace: number,
): number {
  // Pico de volume ~= max(2.5x baseline, raceDistance * 1.2), nunca subindo >10% por semana
  const peakVolume = Math.max(baselineKm * 2.0, raceDistanceKm * 1.2);
  const buildWeeks = Math.max(totalWeeks - 2, 1);
  const progressRatio = Math.min(weekIdx / buildWeeks, 1);
  let target = baselineKm + (peakVolume - baselineKm) * progressRatio;

  // Descarga a cada 4ª semana (-25%)
  if ((weekIdx + 1) % 4 === 0 && weeksToRace > 3) target *= 0.75;

  // Taper
  if (weeksToRace === 2) target *= 0.65;
  if (weeksToRace === 1) target *= 0.45;
  if (weeksToRace === 0) target *= 0.25;

  return Math.round(target);
}

/** D+ semanal alvo (regra Lyss: 50-100% do D+ da prova) */
function weeklyVertM(
  weekIdx: number,
  totalWeeks: number,
  raceVertM: number,
  weeksToRace: number,
): number {
  const buildWeeks = Math.max(totalWeeks - 2, 1);
  const progressRatio = Math.min(weekIdx / buildWeeks, 1);
  // Começa em 30%, sobe até 100% (cumprindo o intervalo Lyss 50-100%)
  let pct = 0.30 + 0.70 * progressRatio;

  if ((weekIdx + 1) % 4 === 0 && weeksToRace > 3) pct *= 0.65;
  if (weeksToRace === 2) pct *= 0.55;
  if (weeksToRace === 1) pct *= 0.30;
  if (weeksToRace === 0) pct *= 0.10;

  return Math.round(raceVertM * pct);
}

/** Gera o plano completo até à data da prova âncora */
export function generatePlan(input: PlannerInput): PlannedWorkout[] {
  const {
    startDate, raceDate, raceDistanceKm, raceElevationM,
    terrainProfile, baselineKmPerWeek, baselineAvgPaceSecPerKm,
  } = input;

  const planStart = startOfWeek(startDate, { weekStartsOn: 1 });
  const totalDays = differenceInDays(raceDate, planStart);
  if (totalDays <= 0) return [];
  const totalWeeks = Math.ceil(totalDays / 7);

  const workouts: PlannedWorkout[] = [];

  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = addDays(planStart, w * 7);
    const weeksToRace = totalWeeks - w - 1;
    const phase = phaseForWeek(weeksToRace, totalWeeks);
    const targetKm = weeklyVolumeKm(w, totalWeeks, baselineKmPerWeek, raceDistanceKm, weeksToRace);
    const targetVert = weeklyVertM(w, totalWeeks, raceElevationM, weeksToRace);

    // Distribuição típica semanal (80/20):
    // Mon: rest/recovery · Tue: quality (intervals/tempo) · Wed: easy Z2 · Thu: vert/hill
    // Fri: easy Z2 ou rest · Sat: long run · Sun: cross/recovery
    // Volume split aproximado:
    const longRunKm = Math.round(targetKm * 0.35);
    const easyKm = Math.round(targetKm * 0.20);
    const vertKm = Math.round(targetKm * 0.18);
    const qualityKm = Math.round(targetKm * 0.15);
    const recoveryKm = Math.max(targetKm - longRunKm - easyKm - vertKm - qualityKm, 0);

    // Repeated Bout Effect: forçar downhill_repeats 3-4 semanas antes da prova
    const isRepeatedBoutWeek = weeksToRace === 3;

    // Race week
    if (weeksToRace === 0) {
      workouts.push(
        wk(weekStart, 0, "rest", null, "Descanso completo", "Hidratação e sono.", w + 1, phase),
        wk(weekStart, 1, "easy_z2", "Z2", "Soltar pernas 20 min", "Trote muito leve. Sem stress.", w + 1, phase, 4, 0, 20, baselineAvgPaceSecPerKm),
        wk(weekStart, 2, "rest", null, "Descanso", "Foco mental.", w + 1, phase),
        wk(weekStart, 3, "easy_z2", "Z2", "Activação 15 min + 3x100m", "Activação suave.", w + 1, phase, 3, 0, 18, baselineAvgPaceSecPerKm),
        wk(weekStart, 4, "rest", null, "Descanso pré-prova", "Preparar material.", w + 1, phase),
        wk(weekStart, 5, "race", null, `🏁 PROVA: ${raceDistanceKm} km / ${raceElevationM} D+`, "Dia da prova. Vai!", w + 1, PHASES.RACE, raceDistanceKm, raceElevationM, null, null),
      );
      continue;
    }

    // Segunda — descanso/recuperação
    workouts.push(wk(weekStart, 0, "rest", null, "Descanso", "Recuperação activa opcional (mobilidade).", w + 1, phase));

    // Terça — Qualidade (20% intensidade)
    if (phase === PHASES.BASE) {
      workouts.push(wk(weekStart, 1, "tempo", "Z3", `Tempo run · ${qualityKm} km`, "Aquecimento 15min Z2 + bloco Z3 contínuo + 10min Z2.", w + 1, phase, qualityKm, 0, null, paceForZone(baselineAvgPaceSecPerKm, "Z3")));
    } else {
      workouts.push(wk(weekStart, 1, "intervals", "Z4", `Intervalos · ${qualityKm} km`, "Aquecimento 15min Z2 + 6x3min Z4 (rec 2min Z1) + 10min Z2.", w + 1, phase, qualityKm, 0, null, paceForZone(baselineAvgPaceSecPerKm, "Z4")));
    }

    // Quarta — easy Z2
    workouts.push(wk(weekStart, 2, "easy_z2", "Z2", `Easy Z2 · ${easyKm} km`, "Conversational. Mantém HR no topo de Z2.", w + 1, phase, easyKm, Math.round(targetVert * 0.10), null, paceForZone(baselineAvgPaceSecPerKm, "Z2")));

    // Quinta — Vertical (subidas) ou strength
    workouts.push(wk(weekStart, 3, "vert_session", "Z3", `Sessão de Vert · ${vertKm} km / ${Math.round(targetVert * 0.45)} D+`, "Foco no D+ da semana. Power-hike nas rampas >12%, corre nas suaves. Time on feet > pace.", w + 1, phase, vertKm, Math.round(targetVert * 0.45), null, null));

    // Sexta — recovery / strength curto
    workouts.push(wk(weekStart, 4, "strength", null, "Força · 30-40 min", "Agachamentos, lunges, single leg, core. Foco em pernas e cadeia posterior.", w + 1, phase));

    // Sábado — Long Run (replicando perfil da prova)
    if (isRepeatedBoutWeek) {
      // Sessão Lyss: hard downhill repeats para activar o Repeated Bout Effect
      workouts.push(wk(weekStart, 5, "downhill_repeats", "Z3", `🔻 Long + Downhill Repeats · ${longRunKm} km`,
        "Long run com foco eccentric: nos últimos 30 min, faz 4-6x descidas íngremes (3-5 min cada) carregando intencionalmente as pernas. Cria o Repeated Bout Effect (Método Lyss) — protege os quadríceps na prova.",
        w + 1, phase, longRunKm, Math.round(targetVert * 0.45), null, paceForZone(baselineAvgPaceSecPerKm, "Z2")));
    } else {
      const longDescription = describeLongRun(terrainProfile, longRunKm, Math.round(targetVert * 0.45));
      workouts.push(wk(weekStart, 5, "long_run", "Z2", `Long Run · ${longRunKm} km / ${Math.round(targetVert * 0.45)} D+`,
        longDescription, w + 1, phase, longRunKm, Math.round(targetVert * 0.45), null, paceForZone(baselineAvgPaceSecPerKm, "Z2")));
    }

    // Domingo — recovery ou cross
    if (recoveryKm > 0) {
      workouts.push(wk(weekStart, 6, "recovery", "Z1", `Recovery · ${recoveryKm} km`, "Trote muito leve para promover circulação. RPE 2-3.", w + 1, phase, recoveryKm, 0, null, paceForZone(baselineAvgPaceSecPerKm, "Z1")));
    } else {
      workouts.push(wk(weekStart, 6, "cross_training", null, "Cross-training 30-45 min", "Bicicleta, natação ou caminhada — opcional.", w + 1, phase));
    }
  }

  return workouts.filter(wo => !isAfter(new Date(wo.workout_date), raceDate));
}

function describeLongRun(profile: TerrainProfile, km: number, vert: number): string {
  switch (profile) {
    case "rolling":
      return `Trail ondulado. Mantém ritmo estável nas oscilações. ${vert} D+ distribuídos. Foco em economia.`;
    case "big_climbs":
      return `Trail com subidas longas e secções planas. Power-hike nas rampas >15%, corre as planas. Pratica transição.`;
    case "sustained":
      return `Subida sustentada moderada (8-12%). Alterna corrida/marcha conforme inclinação. Constrói força específica.`;
    default:
      return `Long run mixed terrain. Tenta aproximar-te do perfil da tua prova âncora.`;
  }
}

function wk(
  weekStart: Date, dayOffset: number,
  type: WorkoutType, zone: Zone | null,
  title: string, description: string,
  weekNumber: number, phase: string,
  km: number | null = null, vert: number | null = null,
  durationMin: number | null = null, pace: number | null = null,
): PlannedWorkout {
  return {
    workout_date: format(addDays(weekStart, dayOffset), "yyyy-MM-dd"),
    workout_type: type,
    zone,
    target_distance_km: km,
    target_elevation_m: vert,
    target_duration_min: durationMin,
    target_pace_sec_per_km: pace,
    title,
    description,
    week_number: weekNumber,
    phase,
  };
}

export function formatPace(secPerKm: number | null): string {
  if (!secPerKm) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export function formatDuration(minutes: number | null): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}
