// Nutrition guidance for individual training sessions.
// Heuristics based on Uphill Athlete & sports-nutrition consensus
// (carbs/h scales with duration & intensity; pre/post fueling).

import type { CalendarPlannedWorkout } from "@/components/calendar/types";

export type NutritionSection = {
  title: string;
  items: string[];
};

export type WorkoutNutrition = {
  needed: boolean;          // is structured fueling worth it?
  intensity: "low" | "moderate" | "high";
  carbsPerHourG: [number, number]; // range during session
  fluidsMlPerHour: [number, number];
  sodiumMgPerHour: [number, number];
  sections: NutritionSection[];
  rationale: string;
};

const HIGH_INTENSITY_TYPES = new Set([
  "intervals", "tempo", "threshold", "vo2max", "race_specific", "race",
]);
const LONG_TYPES = new Set(["long_run", "long", "endurance", "race_specific", "race"]);

export function getWorkoutNutrition(w: CalendarPlannedWorkout): WorkoutNutrition {
  const dur = w.target_duration_min ?? 0;
  const km = w.target_distance_km ?? 0;
  const vert = w.target_elevation_m ?? 0;
  const type = (w.workout_type ?? "").toLowerCase();
  const zone = (w.zone ?? "").toLowerCase();

  const isLong = dur >= 90 || km >= 18 || LONG_TYPES.has(type);
  const isHighIntensity =
    HIGH_INTENSITY_TYPES.has(type) ||
    zone === "z4" || zone === "z5" ||
    (dur >= 45 && (zone === "z3"));
  const bigVert = vert >= 600;

  const intensity: "low" | "moderate" | "high" =
    isHighIntensity ? "high" : (isLong || bigVert ? "moderate" : "low");

  // Carb intake during session (g/h)
  let carbs: [number, number] = [0, 0];
  if (dur < 60 && intensity === "low") carbs = [0, 0];
  else if (dur < 75) carbs = [20, 30];
  else if (dur < 120) carbs = [30, 60];
  else if (dur < 180) carbs = [60, 80];
  else carbs = [80, 100]; // dual-source carbs (glucose+fructose)

  const fluids: [number, number] = bigVert || isHighIntensity ? [500, 800] : [400, 600];
  const sodium: [number, number] = bigVert || dur >= 120 ? [400, 800] : [200, 500];

  const needed = dur >= 60 || carbs[1] > 0;

  const sections: NutritionSection[] = [];

  // Pre
  if (intensity === "high" || isLong) {
    sections.push({
      title: "Antes (1–3h antes)",
      items: [
        intensity === "high"
          ? "Refeição leve rica em hidratos (1–1,5 g/kg) 2–3 h antes — pão/aveia/fruta + pouca gordura/proteína."
          : "Refeição com hidratos (1 g/kg) 1,5–2 h antes; baixa em fibra e gordura.",
        "15–30 min antes: 200–300 ml de água + opcional 15–30 g de hidratos rápidos (gel/banana) se vais para sessão dura ou longa.",
      ],
    });
  } else {
    sections.push({
      title: "Antes",
      items: [
        "Sessão curta/fácil — pode ser feita em jejum se for cedo, ou com snack leve (fruta/torrada) 30–60 min antes.",
        "Hidrata bem (300–500 ml de água nas 1–2 h antes).",
      ],
    });
  }

  // Durante
  const duringItems: string[] = [];
  if (carbs[1] === 0) {
    duringItems.push("Não é necessário fueling — só água a goles regulares.");
  } else {
    duringItems.push(
      `Hidratos: ${carbs[0]}–${carbs[1]} g/h (${approxFuelExamples(carbs[1])}).`,
      `Líquidos: ${fluids[0]}–${fluids[1]} ml/h em pequenos goles.`,
    );
    if (dur >= 120 || bigVert) {
      duringItems.push(
        `Sódio: ${sodium[0]}–${sodium[1]} mg/h (cápsulas de sal, bebida iso ou comida salgada).`,
        "Em sessões >2h30, mistura glucose+frutose (proporção ~2:1) para tolerar >60 g/h.",
      );
    }
    if (bigVert) {
      duringItems.push("Aproveita as subidas (mais lentas) para mastigar sólidos; nas descidas só líquido/gel.");
    }
  }
  sections.push({ title: "Durante", items: duringItems });

  // Pós
  const postItems: string[] = [];
  if (intensity === "high" || isLong) {
    postItems.push(
      "Janela 30–60 min: 1–1,2 g/kg de hidratos + 0,3 g/kg de proteína (ex: batido leite+banana+aveia, iogurte+granola, sandes peru).",
      "Reidrata: 1,2–1,5× o peso perdido em líquidos (com sódio).",
    );
  } else {
    postItems.push("Refeição equilibrada nas 2 h seguintes (hidratos + proteína + vegetais).");
  }
  sections.push({ title: "Depois", items: postItems });

  // Treina o intestino
  if (isLong || type === "race_specific") {
    sections.push({
      title: "Treino do intestino",
      items: [
        "Usa esta sessão para testar exatamente os géis/barras/bebida que vais usar na prova.",
        "Anota tolerância digestiva nas notas do treino.",
      ],
    });
  }

  const rationale = isHighIntensity
    ? "Sessão de alta intensidade — depende muito de glicogénio. Fueling antes e durante é rentável."
    : isLong
    ? "Sessão longa — esgotamento de glicogénio é o limitador. Treinar o intestino aqui paga na prova."
    : bigVert
    ? "Muito D+ aumenta gasto e desgaste — hidrata e leva snacks salgados."
    : "Sessão curta/fácil — foco em hidratação; fueling opcional.";

  return {
    needed,
    intensity,
    carbsPerHourG: carbs,
    fluidsMlPerHour: fluids,
    sodiumMgPerHour: sodium,
    sections,
    rationale,
  };
}

function approxFuelExamples(maxG: number): string {
  if (maxG <= 30) return "1 gel ou ½ barra";
  if (maxG <= 60) return "1–2 géis OU 1 barra + bebida iso";
  if (maxG <= 80) return "2 géis + bebida iso (~30 g)";
  return "géis duplos + bebida iso + sólido (banana/barra)";
}
