// Nutrition guidance for individual training sessions.
// Heuristics based on Training for the Uphill Athlete & Lyss Method
// (carbs/h scales with duration & intensity; pre/post fueling).

import type { CalendarPlannedWorkout } from "@/components/calendar/types";

export type NutritionSection = {
  title: string;
  items: string[];
};

export type WorkoutNutrition = {
  needed: boolean;
  intensity: "low" | "moderate" | "high";
  carbsPerHourG: [number, number];
  fluidsMlPerHour: [number, number];
  sodiumMgPerHour: [number, number];
  sections: NutritionSection[];
  rationale: string;
};

// Alta intensidade — glicogénio é o limitador principal
const HIGH_INTENSITY_TYPES = new Set([
  "intervals",
  "tempo",
  "threshold",
  "vo2max",
  "race_specific",
  "race",
  "hill_repeats",       // subidas curtas Z4/Z5 — muito intenso
  "downhill_repeats",   // carga excêntrica + Z3/Z4
]);

// Sessões longas — depleção de glicogénio é o limitador
const LONG_TYPES = new Set([
  "long_run",
  "long",
  "endurance",
  "race_specific",
  "race",
  "vert_session",       // acumulação de D+ — tempo em pés elevado
]);

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
    (dur >= 45 && zone === "z3");
  const bigVert = vert >= 600;
  const isHillWork = type === "hill_repeats";
  const isDownhill = type === "downhill_repeats";

  const intensity: "low" | "moderate" | "high" =
    isHighIntensity ? "high" : (isLong || bigVert ? "moderate" : "low");

  // Carb intake during session (g/h)
  // Hill repeats e downhill são de alta intensidade independentemente da duração
  let carbs: [number, number] = [0, 0];
  if (dur < 60 && intensity === "low") {
    carbs = [0, 0];
  } else if (dur < 75) {
    carbs = [20, 30];
  } else if (dur < 120) {
    carbs = intensity === "high" ? [40, 60] : [30, 50];
  } else if (dur < 180) {
    carbs = [60, 80];
  } else {
    carbs = [80, 100]; // dual-source (glucose+frutose)
  }

  // Hill repeats curtos mas muito intensos — carbs mínimos durante, foco no antes
  if (isHillWork && dur < 75) carbs = [20, 40];

  const fluids: [number, number] = bigVert || isHighIntensity ? [500, 800] : [400, 600];
  const sodium: [number, number] = bigVert || dur >= 120 ? [400, 800] : [200, 500];

  const needed = dur >= 60 || carbs[1] > 0;

  const sections: NutritionSection[] = [];

  // ── PRÉ-TREINO ────────────────────────────────────────────────────────────
  if (intensity === "high" || isLong) {
    const preItems = [
      intensity === "high"
        ? "Refeição leve rica em hidratos (1–1,5 g/kg) 2–3h antes — pão/aveia/fruta + pouca gordura/proteína."
        : "Refeição com hidratos (1 g/kg) 1,5–2h antes; baixa em fibra e gordura.",
      "15–30 min antes: 200–300 ml água + opcional 15–30g hidratos rápidos (gel/banana) se vais para sessão dura ou longa.",
    ];
    if (isHillWork) {
      preItems.push("Hill repeats: garante que estás bem hidratado — a intensidade nas subidas aumenta muito a sudorese.");
    }
    if (isDownhill) {
      preItems.push("Downhill repeats: come bem antes — a carga excêntrica é muito elevada e precisas de energia para proteger o músculo.");
    }
    sections.push({ title: "Antes (1–3h antes)", items: preItems });
  } else {
    sections.push({
      title: "Antes",
      items: [
        "Sessão curta/fácil — pode ser feita em jejum se for cedo, ou com snack leve (fruta/torrada) 30–60 min antes.",
        "Hidrata bem (300–500 ml de água nas 1–2h antes).",
      ],
    });
  }

  // ── DURANTE ───────────────────────────────────────────────────────────────
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
    if (bigVert || type === "vert_session") {
      duringItems.push("Aproveita as subidas (mais lentas) para mastigar sólidos; nas descidas só líquido/gel.");
    }
    if (isHillWork) {
      duringItems.push("Nos intervalos de recuperação (a descer): gole de água ou bebida iso. Nas subidas: não comes — foca na técnica.");
    }
    if (isDownhill) {
      duringItems.push("Gel ou bebida iso a cada 30-40 min — a carga excêntrica é elevada mesmo que o pace seja lento.");
    }
  }
  sections.push({ title: "Durante", items: duringItems });

  // ── PÓS-TREINO ───────────────────────────────────────────────────────────
  const postItems: string[] = [];
  if (intensity === "high" || isLong) {
    postItems.push(
      "Janela 30–60 min: 1–1,2 g/kg de hidratos + 0,3 g/kg de proteína (ex: batido leite+banana+aveia, iogurte+granola, sandes peru).",
      "Reidrata: 1,2–1,5× o peso perdido em líquidos (com sódio).",
    );
    if (isDownhill) {
      postItems.push("Após downhill repeats: proteína extra (30-40g) para reparação muscular excêntrica — queijo cottage, frango, peixe.");
    }
    if (isHillWork) {
      postItems.push("Hill repeats esgotam muito o glicogénio muscular — come hidratos nas primeiras 2h mesmo que não tenhas fome.");
    }
  } else {
    postItems.push("Refeição equilibrada nas 2h seguintes (hidratos + proteína + vegetais).");
  }
  sections.push({ title: "Depois", items: postItems });

  // ── TREINAR O INTESTINO ───────────────────────────────────────────────────
  if (isLong || type === "race_specific" || type === "vert_session") {
    sections.push({
      title: "Treino do intestino",
      items: [
        "Usa esta sessão para testar os géis/barras/bebida que vais usar na prova.",
        "Anota a tolerância digestiva nas notas do treino — o que funciona em treino funciona na prova.",
      ],
    });
  }

  // ── RATIONALE ─────────────────────────────────────────────────────────────
  let rationale: string;
  if (isHillWork) {
    rationale = "Hill repeats — alta intensidade Z4/Z5 em subida. O glicogénio muscular é o limitador. Fueling antes é crítico.";
  } else if (isDownhill) {
    rationale = "Downhill repeats — carga excêntrica elevada mesmo em ritmo moderado. Proteína pós-treino é essencial para recuperação muscular.";
  } else if (type === "vert_session") {
    rationale = "Sessão de vert — tempo em pés elevado com D+ contínuo. Treina o intestino e pratica comer em movimento nas subidas.";
  } else if (isHighIntensity) {
    rationale = "Sessão de alta intensidade — depende muito de glicogénio. Fueling antes e durante é rentável.";
  } else if (isLong) {
    rationale = "Sessão longa — esgotamento de glicogénio é o limitador. Treinar o intestino aqui paga na prova.";
  } else if (bigVert) {
    rationale = "Muito D+ aumenta gasto e desgaste — hidrata e leva snacks salgados.";
  } else {
    rationale = "Sessão curta/fácil — foco em hidratação; fueling opcional.";
  }

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
  return "géis duplos + bebida iso + sólido (banana/barra/tâmaras)";
}
