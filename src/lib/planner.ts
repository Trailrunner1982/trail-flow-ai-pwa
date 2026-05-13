import { addDays, differenceInDays, format, startOfWeek, parseISO } from "date-fns";

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

// Fix timezone — converte string yyyy-MM-dd para Date local sem shift UTC
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

export function generatePlan(input: PlannerInput): PlannedWorkout[] {
  const {
    startDate, raceDate, raceDistanceKm, raceElevationM,
    terrainProfile, baselineKmPerWeek, baselineAvgPaceSecPerKm,
    raceName = "Prova", secondaryRaces = [],
  } = input;

  // Fix timezone — usar datas locais
  const planStart = startOfWeek(startDate, { weekStartsOn: 1 });
  const raceDateLocal = raceDate instanceof Date ? raceDate : parseDateLocal(format(raceDate, "yyyy-MM-dd"));

  const totalDays = differenceInDays(raceDateLocal, planStart);
  if (totalDays <= 0) return [];
  const totalWeeks = Math.ceil(totalDays / 7);

  // Datas das provas secundárias para marcar no calendário
  const secondaryRaceDates = new Set(secondaryRaces.map(r => r.date));
  const secondaryRaceMap = new Map(secondaryRaces.map(r => [r.date, r]));

  const minLongRunKm = Math.max(12, Math.round(raceDistanceKm * 0.25));
  const workouts: PlannedWorkout[] = [];
  const usedDates = new Set<string>();

  const addWorkout = (wo: PlannedWorkout) => {
    // Evitar duplicados na mesma data com o mesmo tipo
    const key = `${wo.workout_date}-${wo.workout_type}`;
    if (usedDates.has(key)) return;
    usedDates.add(key);
    workouts.push(wo);
  };

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

    // Semana da prova principal
    if (weeksToRace === 0) {
      addWorkout(wk(weekStart, 0, "rest", null, "Descanso completo", "Hidratação e sono.", w + 1, phase));
      addWorkout(wk(weekStart, 1, "easy_z2", "Z2", "Soltar pernas 20 min", "Trote muito leve. Sem stress.", w + 1, phase, 4, 0, 20, baselineAvgPaceSecPerKm));
      addWorkout(wk(weekStart, 2, "rest", null, "Descanso", "Foco mental.", w + 1, phase));
      addWorkout(wk(weekStart, 3, "easy_z2", "Z2", "Activação 15 min + 3x100m", "Activação suave.", w + 1, phase, 3, 0, 18, baselineAvgPaceSecPerKm));
      addWorkout(wk(weekStart, 4, "rest", null, "Descanso pré-prova", "Preparar material.", w + 1, phase));

      // Dia da prova — usar a data exacta da prova A
      const raceDateStr = format(raceDateLocal, "yyyy-MM-dd");
      workouts.push({
        workout_date: raceDateStr,
        workout_type: "race",
        zone: null,
        target_distance_km: raceDistanceKm,
        target_elevation_m: raceElevationM,
        target_duration_min: null,
        target_pace_sec_per_km: null,
        title: `🏁 ${raceName} — ${raceDistanceKm}km / ${raceElevationM}D+`,
        description: "Dia da prova! Executa o teu plano de nutrição. Começa conservador, acelera na segunda metade. Diverte-te!",
        week_number: w + 1,
        phase: PHASES.RACE,
      });
      continue;
    }

    // Verificar se algum dia desta semana tem prova secundária
    const weekDaysDates = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "yyyy-MM-dd"));
    const secondaryInWeek = weekDaysDates.filter(d => secondaryRaceDates.has(d));

    addWorkout(wk(weekStart, 0, "rest", null, "Descanso", "Recuperação activa opcional (mobilidade).", w + 1, phase));

    if (phase === PHASES.BASE) {
      addWorkout(wk(weekStart, 1, "tempo", "Z3", `Tempo run ${qualityKm} km`, "Aquecimento 15min Z2 + bloco Z3 contínuo + 10min Z2.", w + 1, phase, qualityKm, 0, null, paceForZone(baselineAvgPaceSecPerKm, "Z3")));
    } else {
      addWorkout(wk(weekStart, 1, "intervals", "Z4", `Intervalos ${qualityKm} km`, "Aquecimento 15min Z2 + 6x3min Z4 rec 2min Z1 + 10min Z2.", w + 1, phase, qualityKm, 0, null, paceForZone(baselineAvgPaceSecPerKm, "Z4")));
    }

    addWorkout(wk(weekStart, 2, "easy_z2", "Z2", `Easy Z2 ${easyKm} km`, "Conversational. Mantém HR no topo de Z2.", w + 1, phase, easyKm, Math.round(targetVert * 0.10), null, paceForZone(baselineAvgPaceSecPerKm, "Z2")));
    addWorkout(wk(weekStart, 3, "vert_session", "Z3", `Sessão de Vert ${vertKm} km / ${Math.round(targetVert * 0.45)}D+`, "Foco no D+ da semana. Power-hike nas rampas acima de 12%, corre nas suaves.", w + 1, phase, vertKm, Math.round(targetVert * 0.45), null, null));
    addWorkout(wk(weekStart, 4, "strength", null, "Força 30-40 min", "Agachamentos, lunges, single leg, core. Foco em pernas e cadeia posterior.", w + 1, phase));

    // Se há prova B/C nesta semana, substitui o long run por "Prova B/C"
    if (secondaryInWeek.length > 0) {
      const secRaceDate = secondaryInWeek[0];
      const secRace = secondaryRaceMap.get(secRaceDate)!;
      workouts.push({
        workout_date: secRaceDate,
        workout_type: "race",
        zone: null,
        target_distance_km: null,
        target_elevation_m: null,
        target_duration_min: null,
        target_pace_sec_per_km: null,
        title: `🏁 Prova ${secRace.priority}: ${secRace.name}`,
        description: `Prova de prioridade ${secRace.priority}. Usa como treino de simulação de prova — começa controlado.`,
        week_number: w + 1,
        phase,
      });
    } else if (isRepeatedBoutWeek) {
      addWorkout(wk(weekStart, 5, "downhill_repeats", "Z3", `Long + Downhill Repeats ${longRunKm} km`,
        "Long run com foco excêntrico: nos últimos 30 min, faz 4-6x descidas íngremes 3-5 min cada carregando intencionalmente as pernas. Cria o Repeated Bout Effect.",
        w + 1, phase, longRunKm, Math.round(targetVert * 0.45), null, paceForZone(baselineAvgPaceSecPerKm, "Z2")));
    } else {
      addWorkout(wk(weekStart, 5, "long_run", "Z2", `Long Run ${longRunKm} km / ${Math.round(targetVert * 0.45)}D+`,
        describeLongRun(terrainProfile, longRunKm, Math.round(targetVert * 0.45)),
        w + 1, phase, longRunKm, Math.round(targetVert * 0.45), null, paceForZone(baselineAvgPaceSecPerKm, "Z2")));
    }

    if (recoveryKm > 0) {
      addWorkout(wk(weekStart, 6, "recovery", "Z1", `Recovery ${recoveryKm} km`, "Trote muito leve para promover circulação. RPE 2-3.", w + 1, phase, recoveryKm, 0, null, paceForZone(baselineAvgPaceSecPerKm, "Z1")));
    } else {
      addWorkout(wk(weekStart, 6, "cross_training", null, "Cross-training 30-45 min", "Bicicleta, natação ou caminhada opcional.", w + 1, phase));
    }
  }

  // Filtrar treinos APÓS a data da prova (não inclusive)
  const raceDateStr = format(raceDateLocal, "yyyy-MM-dd");
  return workouts.filter(wo => wo.workout_date <= raceDateStr);
}

function describeLongRun(profile: TerrainProfile, km: number, vert: number): string {
  if (profile === "rolling") return `Trail ondulado ${km} km / ${vert}D+. Mantém ritmo estável nas oscilações. Foco em economia de movimento.`;
  if (profile === "big_climbs") return `Trail com subidas longas ${km} km / ${vert}D+. Power-hike nas rampas acima de 15%, corre as planas.`;
  if (profile === "sustained") return `Subida sustentada moderada ${km} km / ${vert}D+. Alterna corrida e marcha conforme inclinação.`;
  return `Long run terreno variado ${km} km / ${vert}D+. Aproxima-te do perfil da tua prova âncora.`;
}

function wk(
  weekStart: Date, dayOffset: number,
  type: WorkoutType, zone: Zone | null,
  title: string, description: string,
  weekNumber: number, phase: string,
  km: number | null = null, vert: number | null = null,
  durationMin: number | null = null, pace: number | null = null,
): PlannedWorkout {
  // Fix timezone — usar date local sem UTC shift
  const d = addDays(weekStart, dayOffset);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    workout_date: dateStr,
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
  if (!secPerKm) return "--";
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export function formatDuration(minutes: number | null): string {
  if (!minutes) return "--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}
