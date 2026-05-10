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

import { addDays, differenceInDays, format, startOfWeek, isAfter } from "date-fns";

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
  baselineAvgPaceSecPerKm: number;
}

export interface PlannedWorkout {
  workout_date: string;
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

function paceForZone(basePaceSecPerKm: number, zone: Zone): number {
  const factors: Record<Zone, number> = {
    Z1: 1.20,
    Z2: 1.10,
    Z3: 1.00,
    Z4: 0.92,
    Z5: 0.85,
  };
  return Math.round(basePaceSecPerKm * factors[zone]);
}

function phaseForWeek(weeksToRace: number, totalWeeks: number): string {
  if (weeksToRace <= 2) return PHASES.TAPER;
  if (weeksToRace <= 4) return PHASES.PEAK;
  if (weeksToRace <= Math.ceil(totalWeeks * 0.45)) return PHASES.BUILD;
  return PHASES.BASE;
}

function weeklyVolumeKm(
  weekIdx: number,
  totalWeeks: number,
  baselineKm: number,
  raceDistanceKm: number,
  weeksToRace: number,
): number {
  const peakVolume = Math.max(baselineKm * 2.0, raceDistanceKm * 1.2);
  const buildWeeks = Math.max(totalWeeks - 2, 1);
  const progressRatio = Math.min(weekIdx / buildWeeks, 1);
  let target = baselineKm + (peakVolume - baselineKm) * progressRatio;

  if ((weekIdx + 1) % 4 === 0 && weeksToRace > 3) target *= 0.75;
  if (weeksToRace === 2) target *= 0.65;
  if (weeksToRace === 1) target *= 0.45;
  if (weeksToRace === 0) target *= 0.25;

  return Math.round(target);
}

function weeklyVertM(
  weekIdx: number,
  totalWeeks: number,
  raceVertM: number,
  weeksToRace: number,
): number {
  const buildWeeks = Math.max(totalWeeks - 2, 1);
  const progressRatio = Math.min(weekIdx / buildWeeks, 1);
  let pct = 0.30 + 0.70 * progressRatio;

  if ((weekIdx + 1) % 4 === 0 && weeksToRace > 3) pct *= 0.65;
  if (weeksToRace === 2) pct *= 0.55;
  if (weeksToRace === 1) pct *= 0.30;
  if (weeksToRace === 0) pct *= 0.10;

  return Math.round(raceVertM * pct);
}

export function generatePlan(input: PlannerInput): PlannedWorkout[] {
  const {
    startDate, raceDate, raceDistanceKm, raceElevationM,
    terrainProfile, baselineKmPerWeek, baselineAvgPaceSecPerKm,
  } = input;

  const planStart = startOfWeek(startDate, { weekStartsOn: 1 });
  const totalDays = differenceInDays(raceDate, planStart);
  if (totalDays <= 0) return [];
  const totalWeeks = Math.ceil(totalDays / 7);

  // Mínimo absoluto para long run: 12km ou 25% da distância da prova
  const minLongRunKm = Math.max(12, Math.round(raceDistanceKm * 0.25));

  const workouts: PlannedWorkout[] = [];

  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = addDays(planStart, w * 7);
    const weeksToRace = totalWeeks - w - 1;
    const phase = phaseForWeek(weeksToRace, totalWeeks);
    const targetKm = weeklyVolumeKm(w, totalWeeks, baselineKmPerWeek, raceDistanceKm, weeksToRace);
    const targetVert = weeklyVertM(w, totalWeeks, raceElevationM, weeksToRace);

    // Long run: mínimo de minLongRunKm, nunca mais que 40% do volume semanal
    // Nas primeiras semanas cresce gradualmente a partir de 60% do mínimo
    const progressRatio = Math.min(w / Math.max(totalWeeks - 2, 1), 1);
    const rawLongRunKm = Math.round(targetKm * 0.35);
    const scaledMin = Math.round(minLongRunKm * (0.60 + 0.40 * progressRatio));
    const longRunKm = Math.max(rawLongRunKm, scaledMin);

    const easyKm = Math.round(targetKm * 0.20);
    const vertKm = Math.round(targetKm * 0.18);
    const qualityKm = Math.round(targetKm * 0.15);
    const recoveryKm = Math.max(targetKm - longRunKm - easyKm - vertKm - qualityKm, 0);

    const isRepeatedBoutWeek = weeksToRace === 3;

    // Semana de prova
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

    // Segunda — descanso
    workouts.push(wk(weekStart, 0, "rest", null, "Descanso", "Recupera
