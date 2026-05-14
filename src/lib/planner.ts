import { addDays, differenceInDays, format, startOfWeek, getDay } from "date-fns";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type WorkoutType =
  | "easy_z2" | "long_run" | "tempo" | "intervals" | "hill_repeats"
  | "vert_session" | "downhill_repeats" | "recovery" | "rest"
  | "strength" | "strength_light" | "cross_training" | "race";

export type Zone = "Z1" | "Z2" | "Z3" | "Z4" | "Z5";
export type TerrainProfile = "rolling" | "big_climbs" | "sustained" | "mixed";
export type GoalType = "finish" | "target_time" | "target_pace" | "target_distance" | "target_elevation";
export type Priority = "A" | "B" | "C";

export interface SeasonEvent {
  id: string;
  date: string;
  name: string;
  priority: Priority;
  distance_km: number;
  elevation_gain_m: number;
  terrain_profile: TerrainProfile;
  goal_type: GoalType;
  target_time_minutes: number | null;
  target_pace_sec_per_km: number | null;
}

export interface SeasonPlanInput {
  events: SeasonEvent[];
  baselineKm: number;
  baselinePace: number;
  availableRunDays: number[];
  availableStrengthDays: number[];
  longRunDay: number;
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
  race_id: string;
}

type Phase = "Recuperação" | "Base" | "Específico" | "Pico" | "Taper" | "Prova";

// ─── Utilitários de data ──────────────────────────────────────────────────────

export function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateForDow(weekStart: Date, dow: number): string {
  const s = getDay(weekStart);
  let o = dow - s;
  if (o < 0) o += 7;
  return toDateStr(addDays(weekStart, o));
}

// ─── Pace / zona ─────────────────────────────────────────────────────────────

const ZONE_FACTORS: Record<Zone, number> = {
  Z1: 1.25, Z2: 1.12, Z3: 1.00, Z4: 0.91, Z5: 0.84,
};

export function paceForZone(basePace: number, zone: Zone): number {
  return Math.round(basePace * ZONE_FACTORS[zone]);
}

export function deriveRacePace(
  goalType: GoalType,
  targetTimeMinutes: number | null | undefined,
  targetPaceSecPerKm: number | null | undefined,
  distanceKm: number,
  elevationM: number,
  baselinePace: number,
): number {
  if (goalType === "target_pace" && targetPaceSecPerKm && targetPaceSecPerKm > 0)
    return targetPaceSecPerKm;
  if (goalType === "target_time" && targetTimeMinutes && targetTimeMinutes > 0 && distanceKm > 0) {
    const equivalentKm = distanceKm + elevationM / 100;
    return Math.round((targetTimeMinutes * 60) / equivalentKm);
  }
  return baselinePace;
}

// ─── Formatação ───────────────────────────────────────────────────────────────

export function formatPace(secPerKm: number | null): string {
  if (!secPerKm || secPerKm <= 0) return "--";
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

const fp = formatPace;
const fd = formatDuration;

// ─── Recuperação pós-prova ────────────────────────────────────────────────────

function recoveryWeeksAfter(priority: Priority): number {
  return priority === "A" ? 2 : priority === "B" ? 1 : 0;
}

function recoveryDaysAfter(priority: Priority): number {
  return priority === "A" ? 13 : priority === "B" ? 4 : 1;
}

// ─── Fase ─────────────────────────────────────────────────────────────────────

function getPhase(weeksToEvent: number, totalWeeks: number): Phase {
  if (weeksToEvent === 0) return "Prova";
  if (weeksToEvent <= 2) return "Taper";
  if (weeksToEvent <= 4) return "Pico";
  if (weeksToEvent <= Math.ceil(totalWeeks * 0.45)) return "Específico";
  return "Base";
}

// ─── Volume ──────────────────────────────────────────────────────────────────

function calcVolFactor(weekIdx: number, weeksToEvent: number): number {
  if (weeksToEvent === 0) return 0.25;
  if (weeksToEvent === 1) return 0.45;
  if (weeksToEvent === 2) return 0.65;
  if ((weekIdx + 1) % 3 === 0) return 0.75; // choque a cada 3ª semana
  return 1.0;
}

// ─── Gerador principal ────────────────────────────────────────────────────────

export function generateSeasonPlan(input: SeasonPlanInput): PlannedWorkout[] {
  const { events, baselineKm, baselinePace, availableRunDays, availableStrengthDays, longRunDay } = input;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  const futureEvents = events
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (futureEvents.length === 0) return [];

  // Estrutura de dias da semana
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const activeDaysSet = new Set([...availableRunDays, ...availableStrengthDays]);
  const restDays = allDays.filter(d => !activeDaysSet.has(d));
  const runDaysWithoutLong = availableRunDays.filter(d => d !== longRunDay);
  const qualitySlots = runDaysWithoutLong.slice(0, 2);
  const easySlots = runDaysWithoutLong.slice(2);
  const strengthSlots = availableStrengthDays;

  const allEventDates = new Set(futureEvents.map(e => e.date));
  const allWorkouts: PlannedWorkout[] = [];
  const usedKeys = new Set<string>();

  const addW = (w: PlannedWorkout) => {
    if (w.workout_date < todayStr) return;
    const key = `${w.workout_date}-${w.workout_type}`;
    if (usedKeys.has(key)) return;
    usedKeys.add(key);
    allWorkouts.push(w);
  };

  let blockStart = new Date(today);

  for (let ei = 0; ei < futureEvents.length; ei++) {
    const event = futureEvents[ei];
    const eventDate = parseDateLocal(event.date);

    const racePace = deriveRacePace(
      event.goal_type, event.target_time_minutes, event.target_pace_sec_per_km,
      event.distance_km, event.elevation_gain_m, baselinePace,
    );
    const peakKm = Math.max(baselineKm * 1.8, event.distance_km * 1.1);

    // Registar a própria prova
    addW({
      workout_date: event.date,
      workout_type: "race",
      zone: null,
      target_distance_km: event.distance_km,
      target_elevation_m: event.elevation_gain_m,
      target_duration_min: event.target_time_minutes ?? null,
      target_pace_sec_per_km: event.goal_type === "target_pace" ? event.target_pace_sec_per_km : null,
      title: buildRaceTitle(event),
      description: buildRaceDescription(event),
      week_number: 0,
      phase: "Prova",
      race_id: event.id,
    });

    const daysUntilEvent = differenceInDays(eventDate, blockStart);
    if (daysUntilEvent < 3) {
      blockStart = addDays(eventDate, recoveryDaysAfter(event.priority) + 1);
      continue;
    }

    const totalWeeks = Math.ceil(daysUntilEvent / 7);
    const planStart = startOfWeek(blockStart, { weekStartsOn: 1 });
    const recovWeeks = ei === 0 ? 0 : recoveryWeeksAfter(event.priority);

    for (let w = 0; w < totalWeeks; w++) {
      const weekStart = addDays(planStart, w * 7);
      const weeksToEvent = totalWeeks - w - 1;
      const isRecoveryWeek = w < recovWeeks;
      const phase: Phase = isRecoveryWeek ? "Recuperação" : getPhase(weeksToEvent, totalWeeks);

      const trainingWeekIdx = Math.max(w - recovWeeks, 0);
      const totalTrainingWeeks = totalWeeks - recovWeeks;
      const buildWeeks = Math.max(totalTrainingWeeks - 3, 1);
      const progressRatio = Math.min(trainingWeekIdx / buildWeeks, 1);

      const volFactor = isRecoveryWeek
        ? (w === 0 ? 0.35 : 0.50)
        : calcVolFactor(trainingWeekIdx, weeksToEvent);

      const targetKm = isRecoveryWeek
        ? Math.round(baselineKm * volFactor)
        : Math.round((baselineKm + (peakKm - baselineKm) * progressRatio) * volFactor);

      const targetVert = Math.round(event.elevation_gain_m * (0.30 + 0.70 * progressRatio) * volFactor);
      const weekPace = isRecoveryWeek ? baselinePace : racePace;

      // Helper local: adiciona treino num dia da semana
      const on = (
        dow: number, type: WorkoutType, zone: Zone | null,
        title: string, desc: string,
        km: number | null = null, vert: number | null = null,
        dur: number | null = null, pace: number | null = null,
      ) => {
        const dateStr = dateForDow(weekStart, dow);
        if (type !== "race" && allEventDates.has(dateStr)) return; // não sobrepor prova
        addW({ workout_date: dateStr, workout_type: type, zone, target_distance_km: km, target_elevation_m: vert, target_duration_min: dur, target_pace_sec_per_km: pace, title, description: desc, week_number: w + 1, phase, race_id: event.id });
      };

      // Descanso em todos os dias de repouso — sempre, em qualquer fase
      restDays.forEach(d => on(d, "rest", null, "Descanso", "Recuperação activa opcional: mobilidade, foam roller."));

      // ── SEMANA DA PROVA ──────────────────────────────────────
      if (weeksToEvent === 0) {
        qualitySlots[0] !== undefined && on(qualitySlots[0], "easy_z2", "Z2", "Soltar pernas 20 min",
          "Trote muito leve. Sem stress muscular. Mantém a rotina.", 4, 0, 20, paceForZone(weekPace, "Z2"));
        qualitySlots[1] !== undefined && on(qualitySlots[1], "rest", null, "Descanso", "Repouso activo pré-prova.");
        easySlots[0] !== undefined && on(easySlots[0], "easy_z2", "Z2", "Activação 15 min + strides",
          "10 min fácil + 4×20s em ritmo de corrida. Acorda as pernas.", 3, 0, 18, paceForZone(weekPace, "Z2"));
        easySlots.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso pré-prova."));
        strengthSlots.forEach(d => on(d, "rest", null, "Descanso", "Sem força pré-prova."));
        on(longRunDay, "rest", null, "Descanso", "Repouso pré-prova. Prepara o equipamento.");
        continue;
      }

      // ── SEMANA DE RECUPERAÇÃO ────────────────────────────────
      if (isRecoveryWeek) {
        const nRunDays = qualitySlots.length + easySlots.length + 1;
        const recovKmPerDay = Math.max(Math.round(targetKm / nRunDays), 4);
        qualitySlots.forEach(d => on(d, "recovery", "Z1", `Recovery ${recovKmPerDay} km`,
          "Trote muito leve. Se houver dor, substitui por caminhada.", recovKmPerDay, 0, null, paceForZone(baselinePace, "Z1")));
        easySlots.forEach(d => on(d, "recovery", "Z1", `Recovery ${recovKmPerDay} km`,
          "Circulação activa. RPE máx. 3/10.", recovKmPerDay, 0, null, paceForZone(baselinePace, "Z1")));
        on(longRunDay, "easy_z2", "Z2", `Easy longo ${Math.round(targetKm * 0.35)} km`,
          "Primeiro long run pós-prova — completamente conversacional.", Math.round(targetKm * 0.35), 0, null, paceForZone(baselinePace, "Z2"));
        // Força só na 2ª semana de recuperação e apenas 1 dia (leve)
        if (w >= 1 && strengthSlots[0] !== undefined)
          on(strengthSlots[0], "strength_light", null, "Mobilidade e força leve 20 min",
            "Mobilidade articular, alongamentos activos, core leve. Sem carga.");
        else
          strengthSlots.forEach(d => on(d, "rest", null, "Descanso", "Sem força em recuperação pós-prova."));
        continue;
      }

      // ── SEMANA DE TAPER ──────────────────────────────────────
      if (weeksToEvent <= 2) {
        const longKm = Math.round(targetKm * 0.30);
        const easyKm = Math.round(targetKm * 0.20);
        const qualKm = Math.round(targetKm * 0.15);
        qualitySlots[0] !== undefined && on(qualitySlots[0], "tempo", "Z3", `Tempo curto ${qualKm} km`,
          `Aquecimento 10 min Z2 + ${Math.max(qualKm - 3, 2)} km Z3 + 5 min Z2.\nMantém a velocidade, reduz volume. Pace Z3: ${fp(paceForZone(weekPace, "Z3"))}.`,
          qualKm, 0, null, paceForZone(weekPace, "Z3"));
        qualitySlots[1] !== undefined && on(qualitySlots[1], "easy_z2", "Z2", `Easy Z2 ${easyKm} km`,
          `Conversacional. Pace: ${fp(paceForZone(weekPace, "Z2"))}.`, easyKm, 0, null, paceForZone(weekPace, "Z2"));
        easySlots[0] !== undefined && on(easySlots[0], "easy_z2", "Z2", `Easy ${easyKm} km`,
          `Leve. Pace: ${fp(paceForZone(weekPace, "Z2"))}.`, easyKm, 0, null, paceForZone(weekPace, "Z2"));
        easySlots.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso no taper."));
        // Força leve só no primeiro dia de força
        strengthSlots[0] !== undefined && on(strengthSlots[0], "strength_light", null, "Força leve 20 min",
          "Activação: lunges, single leg, core. Sem carga pesada.");
        strengthSlots.slice(1).forEach(d => on(d, "rest", null, "Descanso", "Repouso no taper."));
        on(longRunDay, "long_run", "Z2", `Long Run taper ${longKm} km`,
          `Terreno semelhante ao da prova. Pace Z2: ${fp(paceForZone(weekPace, "Z2"))}.\nRelax — confia no trabalho feito.`,
          longKm, Math.round(targetVert * 0.30), null, paceForZone(weekPace, "Z2"));
        continue;
      }

      // ── SEMANA NORMAL ────────────────────────────────────────
      const longKm = Math.max(Math.round(targetKm * 0.35), Math.round(event.distance_km * 0.25));
      const qualKm = Math.round(targetKm * 0.15);
      const easyKm = Math.round(targetKm * 0.18);
      const vertKm = Math.round(targetKm * 0.18);
      const assignedKm = longKm + qualKm * qualitySlots.length + easyKm + vertKm;
      const recovKm = Math.max(targetKm - assignedKm, 0);
      const isRBEWeek = weeksToEvent === 3;

      // Qualidade
      if (qualitySlots[0] !== undefined) {
        if (phase === "Base")
          on(qualitySlots[0], "tempo", "Z3", `Tempo run ${qualKm} km`,
            `Aquecimento 15 min Z2 + ${Math.max(qualKm - 5, 2)} km Z3 contínuo + 10 min Z2.\nPace Z3: ${fp(paceForZone(weekPace, "Z3"))}. Deves conseguir falar frases curtas.`,
            qualKm, 0, null, paceForZone(weekPace, "Z3"));
        else
          on(qualitySlots[0], "intervals", "Z4", `Intervalos ${qualKm} km`,
            `Aquecimento 15 min Z2 + 6×3 min Z4 (rec 2 min Z1) + 10 min Z2.\nPace Z4: ${fp(paceForZone(weekPace, "Z4"))}.`,
            qualKm, 0, null, paceForZone(weekPace, "Z4"));
      }
      qualitySlots[1] !== undefined && on(qualitySlots[1], "easy_z2", "Z2", `Easy Z2 ${easyKm} km`,
        `Completamente conversacional. Pace: ${fp(paceForZone(weekPace, "Z2"))}. Se ultrapassares, abranda.`,
        easyKm, Math.round(targetVert * 0.08), null, paceForZone(weekPace, "Z2"));

      // Easy days
      easySlots[0] !== undefined && on(easySlots[0], "vert_session", "Z3",
        `Sessão de Vert ${vertKm} km / ${Math.round(targetVert * 0.45)}D+`,
        "Power-hike em rampas >12%, corre nas suaves. Foco em acumular D+ sem destruir as pernas.",
        vertKm, Math.round(targetVert * 0.45), null, null);

      if (easySlots[1] !== undefined) {
        if (recovKm > 2)
          on(easySlots[1], "recovery", "Z1", `Recovery ${recovKm} km`,
            `Trote muito leve. RPE 2-3/10. Pace: ${fp(paceForZone(weekPace, "Z1"))}.`,
            recovKm, 0, null, paceForZone(weekPace, "Z1"));
        else
          on(easySlots[1], "rest", null, "Descanso", "Recuperação activa opcional.");
      }

      // Força — ambos os dias sempre nas semanas normais
      strengthSlots[0] !== undefined && on(strengthSlots[0], "strength", null, "Força — Pernas 35-45 min",
        "Agachamentos, lunges búlgaros, step-ups, single leg deadlift.\n3×10-12 rep. Cadeia posterior e estabilidade unilateral.");
      strengthSlots[1] !== undefined && on(strengthSlots[1], "strength", null, "Força — Core & Tronco 30 min",
        "Prancha, bird-dog, dead bug, hip thrust, rotações com elástico.\nCore forte = economia de corrida em descidas.");

      // Long run
      if (isRBEWeek)
        on(longRunDay, "downhill_repeats", "Z3",
          `Long Run + Downhill Repeats ${longKm} km / ${Math.round(targetVert * 0.40)}D+`,
          `Long run normal + nos últimos 30 min: 4-6× descidas íngremes controladas.\nRepeated Bout Effect — protege as coxas para a prova. Pace Z2: ${fp(paceForZone(weekPace, "Z2"))}.`,
          longKm, Math.round(targetVert * 0.40), null, paceForZone(weekPace, "Z2"));
      else
        on(longRunDay, "long_run", "Z2",
          `Long Run ${longKm} km / ${Math.round(targetVert * 0.42)}D+`,
          buildLongRunDesc(event.terrain_profile, longKm, Math.round(targetVert * 0.42), weekPace),
          longKm, Math.round(targetVert * 0.42), null, paceForZone(weekPace, "Z2"));
    }

    blockStart = addDays(eventDate, recoveryDaysAfter(event.priority) + 1);
  }

  return allWorkouts.sort((a, b) => a.workout_date.localeCompare(b.workout_date));
}

// ─── Textos ───────────────────────────────────────────────────────────────────

function buildRaceTitle(e: SeasonEvent): string {
  return e.priority === "A"
    ? `🏁 ${e.name} — ${e.distance_km}km / ${e.elevation_gain_m}D+`
    : `🏁 Prova ${e.priority}: ${e.name} — ${e.distance_km}km / ${e.elevation_gain_m}D+`;
}

function buildRaceDescription(e: SeasonEvent): string {
  const goalLine = e.target_time_minutes
    ? `Objetivo: ${fd(e.target_time_minutes)}. `
    : e.target_pace_sec_per_km
    ? `Pace alvo: ${fp(e.target_pace_sec_per_km)}. `
    : "";
  if (e.priority === "A")
    return `${goalLine}Dia da prova âncora! Executa o plano de nutrição. Começa conservador — os primeiros 40% da distância são para guardar energia.`;
  if (e.priority === "B")
    return `${goalLine}Prova importante. Usa como simulação de ritmo e nutrição. Começa 5-10% mais lento que o objetivo.`;
  return `Prova de treino (C). Experimenta equipamento e nutrição. Sem pressão de resultado.`;
}

function buildLongRunDesc(profile: TerrainProfile, km: number, vert: number, racePace: number): string {
  const p = fp(paceForZone(racePace, "Z2"));
  switch (profile) {
    case "rolling":
      return `Trail ondulado ${km} km / ${vert}D+. Mantém ritmo estável a ${p}.\nFoco em economia de movimento — braços baixos, passada eficiente.`;
    case "big_climbs":
      return `Trail com subidas longas ${km} km / ${vert}D+.\nPower-hike em rampas >15%. Pace corrível: ${p}.`;
    case "sustained":
      return `Subida sustentada ${km} km / ${vert}D+.\nAlterna corrida (${p}) e marcha rápida conforme o declive.`;
    default:
      return `Long run terreno variado ${km} km / ${vert}D+. Aproxima-te do perfil da prova.\nPace Z2: ${p}.`;
  }
}

// ─── Compatibilidade com generatePlan ────────────────────────────────────────

export interface PlannerInput {
  startDate: Date;
  raceDate: Date;
  raceDistanceKm: number;
  raceElevationM: number;
  terrainProfile: TerrainProfile;
  baselineKmPerWeek: number;
  baselineAvgPaceSecPerKm: number;
  raceName?: string;
  goalType?: GoalType;
  targetTimeMinutes?: number | null;
  targetPaceSecPerKm?: number | null;
  secondaryRaces?: { date: string; name: string; priority: "B" | "C" }[];
  availableRunDays?: number[];
  availableStrengthDays?: number[];
  longRunDay?: number;
}

export function generatePlan(input: PlannerInput): PlannedWorkout[] {
  const events: SeasonEvent[] = [
    {
      id: "single",
      date: toDateStr(input.raceDate),
      name: input.raceName ?? "Prova",
      priority: "A",
      distance_km: input.raceDistanceKm,
      elevation_gain_m: input.raceElevationM,
      terrain_profile: input.terrainProfile,
      goal_type: input.goalType ?? "finish",
      target_time_minutes: input.targetTimeMinutes ?? null,
      target_pace_sec_per_km: input.targetPaceSecPerKm ?? null,
    },
    ...(input.secondaryRaces ?? []).map(r => ({
      id: r.date, date: r.date, name: r.name, priority: r.priority,
      distance_km: 0, elevation_gain_m: 0, terrain_profile: "mixed" as TerrainProfile,
      goal_type: "finish" as GoalType, target_time_minutes: null, target_pace_sec_per_km: null,
    })),
  ];
  return generateSeasonPlan({
    events,
    baselineKm: input.baselineKmPerWeek,
    baselinePace: input.baselineAvgPaceSecPerKm,
    availableRunDays: input.availableRunDays ?? [1, 2, 3, 4, 5, 6],
    availableStrengthDays: input.availableStrengthDays ?? [2, 4],
    longRunDay: input.longRunDay ?? 0,
  });
}
