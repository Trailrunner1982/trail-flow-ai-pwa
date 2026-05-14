import { addDays, differenceInDays, format, startOfWeek, getDay } from "date-fns";

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
  raceName?: string;
  secondaryRaces?: { date: string; name: string; priority: "B" | "C" }[];
  availableRunDays?: number[];
  availableStrengthDays?: number[];
  longRunDay?: number;
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

export function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function paceForZone(basePaceSecPerKm: number, zone: Zone): number {
  const factors: Record<Zone, number> = {
    Z1: 1.20, Z2: 1.10, Z3: 1.00, Z4: 0.92, Z5: 0.85,
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
  weekIdx: number, totalWeeks: number,
  baselineKm: number, raceDistanceKm: number, weeksToRace: number,
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
  weekIdx: number, totalWeeks: number,
  raceVertM: number, weeksToRace: number,
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

function offsetForDayOfWeek(weekStart: Date, targetDow: number): number {
  const startDow = getDay(weekStart);
  let offset = targetDow - startDow;
  if (offset < 0) offset += 7;
  return offset;
}

function dateForDow(weekStart: Date, dow: number): string {
  const offset = offsetForDayOfWeek(weekStart, dow);
  const d = addDays(weekStart, offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function generatePlan(input: PlannerInput): PlannedWorkout[] {
  const {
    startDate, raceDate, raceDistanceKm, raceElevationM,
    terrainProfile, baselineKmPerWeek, baselineAvgPaceSecPerKm,
    raceName = "Prova", secondaryRaces = [],
    availableRunDays = [1, 2, 3, 4, 5, 6],
    availableStrengthDays = [2, 4],
    longRunDay = 6,
  } = input;

  const planStart = startOfWeek(startDate, { weekStartsOn: 1 });
  const raceDateLocal = raceDate instanceof Date ? raceDate : parseDateLocal(format(raceDate, "yyyy-MM-dd"));

  const totalDays = differenceInDays(raceDateLocal, planStart);
  if (totalDays <= 0) return [];
  const totalWeeks = Math.ceil(totalDays / 7);

  const secondaryRaceDates = new Set(secondaryRaces.map(r => r.date));
  const secondaryRaceMap = new Map(secondaryRaces.map(r => [r.date, r]));
  const minLongRunKm = Math.max(12, Math.round(raceDistanceKm * 0.25));

  const workouts: PlannedWorkout[] = [];
  const usedDates = new Set<string>();

  const addWorkout = (wo: PlannedWorkout) => {
    const key = `${wo.workout_date}-${wo.workout_type}`;
    if (usedDates.has(key)) return;
    usedDates.add(key);
    workouts.push(wo);
  };

  // Organizar dias disponíveis
  const runDaysWithoutLong = availableRunDays.filter(d => d !== longRunDay);
  const qualityDays = runDaysWithoutLong.slice(0, 2);
  const easyDays = runDaysWithoutLong.slice(2);
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const activeDays = new Set([...availableRunDays, ...availableStrengthDays]);
  const restDays = allDays.filter(d => !activeDays.has(d));

  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = addDays(planStart, w * 7);
    const weeksToRace = totalWeeks - w - 1;
    const phase = phaseForWeek(weeksToRace, totalWeeks);
    const targetKm = weeklyVolumeKm(w, totalWeeks, baselineKmPerWeek, raceDistanceKm, weeksToRace);
    const targetVert = weeklyVertM(w, totalWeeks, raceElevationM, weeksToRace);

    const progressRatio = Math.min(w / Math.max(totalWeeks - 2, 1), 1);
    const rawLongRunKm = Math.round(targetKm * 0.35);
    const scaledMin = Math.round(minLongRunKm * (0.60 + 0.40 * progressRatio));
    const longRunKm = Math.max(rawLongRunKm, scaledMin);
    const easyKm = Math.round(targetKm * 0.20);
    const vertKm = Math.round(targetKm * 0.18);
    const qualityKm = Math.round(targetKm * 0.15);
    const recoveryKm = Math.max(targetKm - longRunKm - easyKm - vertKm - qualityKm, 0);
    const isRepeatedBoutWeek = weeksToRace === 3;

    const addOnDay = (
      dow: number, type: WorkoutType, zone: Zone | null,
      title: string, desc: string,
      km: number | null = null, vert: number | null = null,
      dur: number | null = null, pace: number | null = null
    ) => {
      const dateStr = dateForDow(weekStart, dow);
      addWorkout({
        workout_date: dateStr, workout_type: type, zone,
        target_distance_km: km, target_elevation_m: vert,
        target_duration_min: dur, target_pace_sec_per_km: pace,
        title, description: desc, week_number: w + 1, phase,
      });
    };

    // Semana da prova
    if (weeksToRace === 0) {
      restDays.forEach(d => addOnDay(d, "rest", null, "Descanso", "Recuperação activa opcional."));
      if (qualityDays[0] !== undefined)
        addOnDay(qualityDays[0], "easy_z2", "Z2", "Soltar pernas 20 min", "Trote muito leve. Sem stress.", 4, 0, 20, baselineAvgPaceSecPerKm);
      if (easyDays[0] !== undefined)
        addOnDay(easyDays[0], "easy_z2", "Z2", "Activação 15 min + 3x100m", "Activação suave.", 3, 0, 18, baselineAvgPaceSecPerKm);
      const raceDateStr = format(raceDateLocal, "yyyy-MM-dd");
      workouts.push({
        workout_date: raceDateStr, workout_type: "race", zone: null,
        target_distance_km: raceDistanceKm, target_elevation_m: raceElevationM,
        target_duration_min: null, target_pace_sec_per_km: null,
        title: `🏁 ${raceName} — ${raceDistanceKm}km / ${raceElevationM}D+`,
        description: "Dia da prova! Executa o teu plano de nutrição. Começa conservador, acelera na segunda metade.",
        week_number: w + 1, phase: PHASES.RACE,
      });
      continue;
    }

    // Verificar provas secundárias
    const weekDaysDates = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "yyyy-MM-dd"));
    const secondaryInWeek = weekDaysDates.filter(d => secondaryRaceDates.has(d));

    // Descanso nos dias sem actividade
    restDays.forEach(d => addOnDay(d, "rest", null, "Descanso", "Recuperação activa opcional (mobilidade)."));

    // Qualidade
    if (qualityDays[0] !== undefined) {
      if (phase === PHASES.BASE) {
        addOnDay(qualityDays[0], "tempo", "Z3", `Tempo run ${qualityKm} km`,
          "Aquecimento 15min Z2 + bloco Z3 contínuo + 10min Z2.", qualityKm, 0, null, paceForZone(baselineAvgPaceSecPerKm, "Z3"));
      } else {
        addOnDay(qualityDays[0], "intervals", "Z4", `Intervalos ${qualityKm} km`,
          "Aquecimento 15min Z2 + 6x3min Z4 rec 2min Z1 + 10min Z2.", qualityKm, 0, null, paceF
