/**
 * src/lib/stretching.ts
 *
 * Biblioteca de mobilidade e alongamentos para trail running.
 * Baseada em: Training for the Uphill Athlete + Lyss Method + fisioterapia desportiva.
 *
 * Cada exercício tem:
 * - zones: zonas musculares alvo
 * - workoutTypes: tipos de treino onde é mais relevante
 * - timing: quando fazer (before/after/anytime)
 * - priority: relevância quando há dor nessa zona (1=sempre, 2=recomendado, 3=opcional)
 */

export type MuscleZone =
  | "quadriceps"
  | "hamstrings"
  | "calves"
  | "hip_flexors"
  | "glutes"
  | "it_band"
  | "lower_back"
  | "upper_back"
  | "shoulders"
  | "ankles"
  | "feet"
  | "full_body";

export type StretchTiming = "before" | "after" | "anytime";

export interface StretchExercise {
  id: string;
  name: string;
  zones: MuscleZone[];
  workoutTypes: string[]; // workout_type do planner
  timing: StretchTiming[];
  duration_sec: number;
  sets: number;
  instructions: string;
  cue: string; // dica rápida
  priority: 1 | 2 | 3;
  isActive: boolean; // true = mobilidade activa, false = alongamento estático
}

export const STRETCHING_LIBRARY: StretchExercise[] = [
  // ── QUADRÍCEPS ──────────────────────────────────────────────────────────────
  {
    id: "quad_standing",
    name: "Alongamento quadríceps em pé",
    zones: ["quadriceps"],
    workoutTypes: ["long_run", "downhill_repeats", "intervals", "hill_repeats", "race"],
    timing: ["after", "anytime"],
    duration_sec: 45,
    sets: 2,
    instructions:
      "Em pé, dobra o joelho e agarra o pé com a mão do mesmo lado. Puxa o calcanhar em direcção ao glúteo. Mantém os joelhos juntos e o tronco erecto. Segura 45 seg por lado.",
    cue: "Joelhos juntos — não deixes o joelho abrir para o lado.",
    priority: 1,
    isActive: false,
  },
  {
    id: "quad_prone",
    name: "Quadríceps em decúbito ventral",
    zones: ["quadriceps", "hip_flexors"],
    workoutTypes: ["long_run", "downhill_repeats", "intervals"],
    timing: ["after"],
    duration_sec: 60,
    sets: 2,
    instructions:
      "Deita-te de barriga para baixo. Dobra um joelho e agarra o tornozelo com a mão. Mantém os quadris no chão — não deixes a anca levantar. Segura 60 seg por lado.",
    cue: "Quadris no chão — a amplitude vem da extensão da anca, não da lombar.",
    priority: 1,
    isActive: false,
  },
  {
    id: "quad_couch_stretch",
    name: "Couch Stretch (psoas-ilíaco + quadríceps)",
    zones: ["quadriceps", "hip_flexors"],
    workoutTypes: ["long_run", "intervals", "vert_session", "strength"],
    timing: ["after", "anytime"],
    duration_sec: 90,
    sets: 2,
    instructions:
      "Coloca o joelho traseiro encostado à parede (ou sofá), pé para cima. A perna da frente em ângulo de 90°. Mantém o tronco erecto e o core activado. Empurra os quadris para a frente lentamente. 90 seg por lado.",
    cue: "É o melhor alongamento para o flexor da anca — fundamental para trail.",
    priority: 1,
    isActive: false,
  },

  // ── ISQUIOTIBIAIS ────────────────────────────────────────────────────────────
  {
    id: "hamstring_standing",
    name: "Isquiotibiais em pé (inclinação)",
    zones: ["hamstrings", "lower_back"],
    workoutTypes: ["long_run", "tempo", "intervals", "recovery"],
    timing: ["after", "anytime"],
    duration_sec: 45,
    sets: 2,
    instructions:
      "Em pé, coloca um pé à frente com o calcanhar no chão e a ponta do pé levantada. Inclina o tronco para a frente a partir das ancas (não da lombar). Mantém as costas rectas. Segura 45 seg por lado.",
    cue: "Dobra a partir das ancas, não da cintura — costas rectas.",
    priority: 1,
    isActive: false,
  },
  {
    id: "hamstring_floor",
    name: "Isquiotibiais no chão (perna estendida)",
    zones: ["hamstrings"],
    workoutTypes: ["long_run", "downhill_repeats", "recovery", "rest"],
    timing: ["after", "anytime"],
    duration_sec: 60,
    sets: 2,
    instructions:
      "Sentado no chão, uma perna estendida e a outra dobrada com a planta do pé na coxa. Inclina o tronco para a perna estendida a partir das ancas. Podes usar uma toalha em volta do pé. 60 seg por lado.",
    cue: "Não arredondas as costas — o alongamento deve sentir-se na parte posterior da coxa.",
    priority: 1,
    isActive: false,
  },
  {
    id: "nordic_hamstring_eccentric",
    name: "Excêntrico isquiotibiais (Nordic curl)",
    zones: ["hamstrings"],
    workoutTypes: ["strength", "strength_light"],
    timing: ["after"],
    duration_sec: 5,
    sets: 3,
    instructions:
      "Ajoelha-te com os tornozelos presos (podes usar um parceiro ou o sofá). Com o corpo erecto, desce lentamente para a frente controlando com os isquiotibiais. Usa as mãos para travar no final. Sobe com as mãos e repete. 3×5 repetições.",
    cue: "Fundamental para prevenir lesões nos isquiotibiais em descidas de trail.",
    priority: 2,
    isActive: true,
  },

  // ── GÉMEOS E TORNOZELO ────────────────────────────────────────────────────────
  {
    id: "calf_wall",
    name: "Gémeos na parede",
    zones: ["calves", "ankles"],
    workoutTypes: ["long_run", "hill_repeats", "vert_session", "intervals", "race"],
    timing: ["after", "anytime"],
    duration_sec: 45,
    sets: 2,
    instructions:
      "Em pé contra uma parede, coloca um pé atrás com o calcanhar no chão. Dobra o joelho da frente e mantém o de trás esticado. Segura 45 seg, depois dobra ligeiramente o joelho traseiro (para o solhar) mais 30 seg. Troca de lado.",
    cue: "Dois músculos diferentes: joelho esticado = gémeo, joelho ligeiramente dobrado = solhar.",
    priority: 1,
    isActive: false,
  },
  {
    id: "ankle_circles",
    name: "Círculos de tornozelo + mobilidade",
    zones: ["ankles", "feet"],
    workoutTypes: ["long_run", "vert_session", "hill_repeats", "race"],
    timing: ["before", "after", "anytime"],
    duration_sec: 30,
    sets: 2,
    instructions:
      "Sentado ou em pé, levanta um pé e faz círculos amplos com o tornozelo — 10 vezes para cada direcção. Depois faz movimentos de dorsiflexão (puxar o pé para cima) e flexão plantar (apontar o pé). 30 seg por pé.",
    cue: "Tornozelos móveis = menos risco de entorse em terreno técnico.",
    priority: 2,
    isActive: true,
  },
  {
    id: "foot_rolling",
    name: "Rolar a planta do pé (bola ou garrafa)",
    zones: ["feet"],
    workoutTypes: ["long_run", "vert_session", "race"],
    timing: ["after", "anytime"],
    duration_sec: 60,
    sets: 1,
    instructions:
      "Em pé, coloca uma bola de ténis (ou garrafa de água congelada) sob o pé. Aplica pressão moderada e rola do calcanhar até aos dedos, pausando nos pontos de tensão. 60 seg por pé.",
    cue: "Garrafa congelada é anti-inflamatória — ideal após provas ou treinos longos.",
    priority: 2,
    isActive: true,
  },

  // ── FLEXORES DA ANCA ─────────────────────────────────────────────────────────
  {
    id: "hip_flexor_lunge",
    name: "Alongamento flexor da anca em lunge",
    zones: ["hip_flexors", "quadriceps"],
    workoutTypes: ["long_run", "vert_session", "intervals", "strength"],
    timing: ["after", "anytime"],
    duration_sec: 60,
    sets: 2,
    instructions:
      "Ajoelha-te com um joelho no chão (coloca uma almofada se necessário). A perna da frente a 90°. Empurra os quadris para a frente até sentires o alongamento na frente da coxa traseira. Podes levantar o braço do mesmo lado para aumentar. 60 seg por lado.",
    cue: "O flexor da anca encurtado limita a passada nas subidas — alonga-o diariamente.",
    priority: 1,
    isActive: false,
  },
  {
    id: "pigeon_pose",
    name: "Pombo (glúteo e piriforme)",
    zones: ["glutes", "hip_flexors", "it_band"],
    workoutTypes: ["long_run", "downhill_repeats", "vert_session", "strength"],
    timing: ["after", "anytime"],
    duration_sec: 90,
    sets: 2,
    instructions:
      "No chão, coloca uma perna à frente dobrada (pé para o lado oposto) e a outra estendida para trás. Inclina o tronco para a frente sobre a perna dobrada. Se for difícil, usa a versão deitado (figura 4 no chão). 90 seg por lado.",
    cue: "Fundamental pós-downhill — o piriforme fica muito tenso nas descidas.",
    priority: 1,
    isActive: false,
  },

  // ── GLÚTEOS ──────────────────────────────────────────────────────────────────
  {
    id: "glute_bridge",
    name: "Ponte de glúteos (activação)",
    zones: ["glutes", "lower_back", "hamstrings"],
    workoutTypes: ["strength", "strength_light", "recovery", "rest"],
    timing: ["before", "anytime"],
    duration_sec: 5,
    sets: 3,
    instructions:
      "Deita-te de costas com os joelhos dobrados e os pés no chão. Empurra os quadris para cima contraindo os glúteos no topo. Segura 2 seg no topo. Baixa controlado. 3×15 repetições.",
    cue: "Activa os glúteos antes de correr — previne lesões no joelho e lombar.",
    priority: 2,
    isActive: true,
  },
  {
    id: "clamshell",
    name: "Abertura de perna (Clamshell)",
    zones: ["glutes", "it_band"],
    workoutTypes: ["strength", "strength_light", "recovery"],
    timing: ["before", "anytime"],
    duration_sec: 5,
    sets: 3,
    instructions:
      "Deita-te de lado com os joelhos dobrados a 90° e os pés juntos. Abre o joelho de cima como uma amêijoa, sem mover os quadris. Segura 2 seg no topo. 3×15 por lado. Podes adicionar elástico nos joelhos.",
    cue: "Glúteo médio fraco = joelho em valgo nas descidas. Este exercício é preventivo.",
    priority: 2,
    isActive: true,
  },

  // ── BANDA ILIOTIBIAL (IT BAND) ────────────────────────────────────────────────
  {
    id: "it_band_cross",
    name: "Cruzamento de pernas (IT Band)",
    zones: ["it_band", "glutes"],
    workoutTypes: ["long_run", "downhill_repeats", "intervals"],
    timing: ["after", "anytime"],
    duration_sec: 45,
    sets: 2,
    instructions:
      "Em pé, cruza a perna direita à frente da esquerda. Inclina o tronco para a esquerda com o braço esquerdo levantado. Deves sentir o alongamento na parte lateral da coxa direita. 45 seg por lado.",
    cue: "IT Band é ligamento, não músculo — não estiques com força. Pressão suave e sustentada.",
    priority: 2,
    isActive: false,
  },
  {
    id: "foam_roll_it",
    name: "Foam roller lateral da coxa",
    zones: ["it_band", "quadriceps"],
    workoutTypes: ["long_run", "downhill_repeats", "race"],
    timing: ["after"],
    duration_sec: 60,
    sets: 1,
    instructions:
      "Deitado de lado, coloca o foam roller sob a coxa lateral. Usa os braços para controlar a pressão. Rola lentamente do joelho até à anca, pausando 3-5 seg nos pontos dolorosos. 60 seg por lado.",
    cue: "Faz pressão moderada — demasiada pressão directa no IT Band pode irritar.",
    priority: 2,
    isActive: true,
  },

  // ── LOMBAR ────────────────────────────────────────────────────────────────────
  {
    id: "cat_cow",
    name: "Gato-Vaca (mobilidade lombar)",
    zones: ["lower_back", "upper_back"],
    workoutTypes: ["long_run", "vert_session", "strength", "recovery", "rest"],
    timing: ["before", "after", "anytime"],
    duration_sec: 5,
    sets: 2,
    instructions:
      "A quatro apoios. Inspira e arqueia as costas para baixo (vaca — barriga desce, cabeça sobe). Expira e arqueia as costas para cima (gato — barriga sobe, cabeça desce). Movimento lento e controlado. 2×10 repetições.",
    cue: "Sincroniza com a respiração — é mobilidade, não alongamento. Não forces a amplitude.",
    priority: 1,
    isActive: true,
  },
  {
    id: "child_pose",
    name: "Posição da criança",
    zones: ["lower_back", "glutes", "shoulders"],
    workoutTypes: ["long_run", "strength", "vert_session", "recovery"],
    timing: ["after", "anytime"],
    duration_sec: 60,
    sets: 2,
    instructions:
      "Ajoelha-te e senta nos calcanhares. Estende os braços à frente no chão e baixa o tronco. Para alongar mais os lados, caminha as mãos para um lado e depois para o outro. 60 seg no centro + 30 seg de cada lado.",
    cue: "Posição de descanso — ideal para descomprimir a lombar após treinos longos.",
    priority: 1,
    isActive: false,
  },
  {
    id: "supine_twist",
    name: "Rotação lombar deitado",
    zones: ["lower_back", "glutes", "it_band"],
    workoutTypes: ["long_run", "strength", "recovery", "rest"],
    timing: ["after", "anytime"],
    duration_sec: 45,
    sets: 2,
    instructions:
      "Deita-te de costas. Dobra um joelho e leva-o para o lado oposto com a mão. O ombro do mesmo lado mantém-se no chão. Estende o braço para o lado e olha para ele. 45 seg por lado.",
    cue: "Não forces — deixa o peso do joelho fazer o trabalho. Respira fundo.",
    priority: 1,
    isActive: false,
  },

  // ── DORSAL E OMBROS ────────────────────────────────────────────────────────────
  {
    id: "thoracic_rotation",
    name: "Rotação torácica (mobilidade)",
    zones: ["upper_back", "shoulders"],
    workoutTypes: ["strength", "vert_session", "long_run"],
    timing: ["before", "anytime"],
    duration_sec: 5,
    sets: 2,
    instructions:
      "A quatro apoios. Coloca uma mão atrás da cabeça. Roda o cotovelo para cima apontando ao tecto, abrindo o peito. Segura 2 seg no topo e roda para baixo. 2×10 por lado.",
    cue: "Dorsal rígido = má mecânica de corrida com bastões. Mobilidade torácica melhora a eficiência.",
    priority: 3,
    isActive: true,
  },
  {
    id: "doorway_chest",
    name: "Abertura de peito na porta",
    zones: ["upper_back", "shoulders"],
    workoutTypes: ["strength", "long_run"],
    timing: ["after", "anytime"],
    duration_sec: 30,
    sets: 2,
    instructions:
      "Coloca os antebraços nos lados de uma porta com os cotovelos a 90°. Avança um passo e deixa o peso do corpo abrir o peito. Segura 30 seg. Experimenta em alturas diferentes (alta, média, baixa).",
    cue: "Desfaz horas de postura curvada — ideal após treinos com bastões.",
    priority: 3,
    isActive: false,
  },

  // ── MOBILIDADE GERAL / PRÉ-TREINO ─────────────────────────────────────────────
  {
    id: "leg_swings_forward",
    name: "Balanços de perna (frente/trás)",
    zones: ["hip_flexors", "hamstrings", "glutes"],
    workoutTypes: ["long_run", "intervals", "hill_repeats", "vert_session", "race"],
    timing: ["before"],
    duration_sec: 30,
    sets: 1,
    instructions:
      "Em pé com uma mão num apoio. Balança uma perna para a frente e para trás com amplitude crescente. 15 balanços por perna, depois lateral (15 por perna). Total: 30 seg por perna.",
    cue: "Mobilidade activa — não é um alongamento estático. Aumenta a amplitude progressivamente.",
    priority: 1,
    isActive: true,
  },
  {
    id: "leg_swings_lateral",
    name: "Balanços laterais de perna",
    zones: ["glutes", "it_band", "hip_flexors"],
    workoutTypes: ["long_run", "intervals", "hill_repeats", "race"],
    timing: ["before"],
    duration_sec: 30,
    sets: 1,
    instructions:
      "Em pé com as mãos num apoio. Balança uma perna de lado para lado cruzando à frente do corpo. 15 balanços por perna com amplitude crescente.",
    cue: "Activa o glúteo médio antes de correr em terreno irregular.",
    priority: 1,
    isActive: true,
  },
  {
    id: "hip_circles",
    name: "Círculos de anca",
    zones: ["hip_flexors", "glutes", "lower_back"],
    workoutTypes: ["long_run", "vert_session", "strength", "recovery"],
    timing: ["before", "anytime"],
    duration_sec: 30,
    sets: 2,
    instructions:
      "Em pé com as mãos nas ancas. Faz círculos amplos com os quadris — 10 para cada lado. Aumenta a amplitude progressivamente. Mantém os pés no chão e os joelhos ligeiramente dobrados.",
    cue: "Anca móvel = passada mais eficiente nas subidas.",
    priority: 2,
    isActive: true,
  },
  {
    id: "inchworm",
    name: "Inchworm (activação geral)",
    zones: ["hamstrings", "lower_back", "shoulders", "full_body"],
    workoutTypes: ["long_run", "intervals", "hill_repeats", "race"],
    timing: ["before"],
    duration_sec: 5,
    sets: 1,
    instructions:
      "Em pé, dobra-te para tocar no chão com as mãos. Caminha as mãos para a frente até à posição de prancha. Faz uma flexão (opcional). Caminha os pés até às mãos. Levanta-te devagar. 8 repetições.",
    cue: "Activação completa em 2 minutos — ideal quando o tempo é curto.",
    priority: 1,
    isActive: true,
  },
  {
    id: "world_greatest_stretch",
    name: "World's Greatest Stretch",
    zones: ["hip_flexors", "glutes", "hamstrings", "upper_back", "full_body"],
    workoutTypes: ["long_run", "intervals", "vert_session", "race"],
    timing: ["before", "anytime"],
    duration_sec: 5,
    sets: 2,
    instructions:
      "A partir de uma posição de lunge (perna direita à frente). Coloca a mão direita no chão ao lado do pé direito. Roda o tronco abrindo o braço esquerdo ao tecto. Depois leva a mão ao tornozelo esticando a perna. 5 repetições por lado.",
    cue: "O melhor alongamento pré-treino — trabalha tudo numa só sequência.",
    priority: 1,
    isActive: true,
  },
  {
    id: "downward_dog",
    name: "Cão virado para baixo",
    zones: ["hamstrings", "calves", "lower_back", "shoulders"],
    workoutTypes: ["long_run", "vert_session", "recovery", "rest"],
    timing: ["after", "anytime"],
    duration_sec: 45,
    sets: 2,
    instructions:
      "Posição de prancha, empurra os quadris para cima formando um triângulo invertido. Alterna pressionar os calcanhares no chão (um de cada vez) para alongar os gémeos. Mantém os joelhos ligeiramente dobrados se os isquiotibiais forem tensos. 45 seg.",
    cue: "Anda de bicicleta com os calcanhares — activa os gémeos alternadamente.",
    priority: 1,
    isActive: true,
  },

  // ── RESPIRAÇÃO E RECUPERAÇÃO ────────────────────────────────────────────────
  {
    id: "diaphragmatic_breathing",
    name: "Respiração diafragmática",
    zones: ["full_body"],
    workoutTypes: ["recovery", "rest", "long_run"],
    timing: ["after", "anytime"],
    duration_sec: 300,
    sets: 1,
    instructions:
      "Deita-te de costas com os joelhos dobrados. Coloca uma mão no peito e outra na barriga. Inspira pelo nariz durante 4 seg (a barriga deve subir, não o peito). Segura 2 seg. Expira pela boca durante 6 seg. 5 minutos.",
    cue: "Activa o sistema parassimpático — acelera a recuperação após treinos intensos.",
    priority: 2,
    isActive: false,
  },
];

// ── Mapeamento de zonas de dor da biometria para zonas musculares ─────────────
// soreness_zones da biometria é um array de strings livres — mapeamos para MuscleZone

const SORENESS_TO_ZONE: Record<string, MuscleZone[]> = {
  // Português
  "quadriceps": ["quadriceps"],
  "quads": ["quadriceps"],
  "coxa": ["quadriceps", "hamstrings"],
  "coxa anterior": ["quadriceps"],
  "coxa posterior": ["hamstrings"],
  "isquiotibiais": ["hamstrings"],
  "gémeos": ["calves"],
  "gemeos": ["calves"],
  "panturrilha": ["calves"],
  "tornozelo": ["ankles"],
  "pé": ["feet"],
  "pe": ["feet"],
  "anca": ["hip_flexors", "glutes"],
  "glúteo": ["glutes"],
  "gluteo": ["glutes"],
  "it band": ["it_band"],
  "band": ["it_band"],
  "lombar": ["lower_back"],
  "costas": ["lower_back", "upper_back"],
  "dorsal": ["upper_back"],
  "ombro": ["shoulders"],
  "joelho": ["quadriceps", "it_band", "calves"],
  // English fallback
  "hamstrings": ["hamstrings"],
  "calves": ["calves"],
  "ankle": ["ankles"],
  "foot": ["feet"],
  "hip": ["hip_flexors", "glutes"],
  "glute": ["glutes"],
  "lower back": ["lower_back"],
  "back": ["lower_back", "upper_back"],
  "shoulder": ["shoulders"],
  "knee": ["quadriceps", "it_band"],
};

function parseSorenessZones(sorenessZones: string[] | null | undefined): MuscleZone[] {
  if (!sorenessZones || sorenessZones.length === 0) return [];
  const zones = new Set<MuscleZone>();
  for (const zone of sorenessZones) {
    const lower = zone.toLowerCase().trim();
    for (const [key, mapped] of Object.entries(SORENESS_TO_ZONE)) {
      if (lower.includes(key)) {
        mapped.forEach(z => zones.add(z));
      }
    }
  }
  return Array.from(zones);
}

// ── Função principal: sugestões de mobilidade ─────────────────────────────────

export interface MobilitySuggestion {
  exercise: StretchExercise;
  reason: string;
  urgency: "high" | "medium" | "low";
}

export function getMobilitySuggestions(opts: {
  workoutType?: string | null;
  workoutDurationMin?: number | null;
  rpe?: number | null;
  sorenessZones?: string[] | null;
  timing?: StretchTiming;
  maxResults?: number;
}): MobilitySuggestion[] {
  const {
    workoutType,
    workoutDurationMin,
    rpe,
    sorenessZones,
    timing = "after",
    maxResults = 6,
  } = opts;

  const sorenessMusclezones = parseSorenessZones(sorenessZones);
  const isIntense = rpe != null && rpe >= 7;
  const isLong = (workoutDurationMin ?? 0) >= 90;

  const scored: { exercise: StretchExercise; score: number; reason: string; urgency: "high" | "medium" | "low" }[] = [];

  for (const ex of STRETCHING_LIBRARY) {
    // Filtrar por timing
    if (!ex.timing.includes(timing) && timing !== "anytime") continue;

    let score = 0;
    let reason = "";
    let urgency: "high" | "medium" | "low" = "low";

    // Dor na zona — prioridade máxima
    const hasSoreness = ex.zones.some(z => sorenessMusclezones.includes(z));
    if (hasSoreness) {
      score += 100 * ex.priority;
      reason = `Alivia a dor/tensão reportada`;
      urgency = "high";
    }

    // Relevante para o tipo de treino
    if (workoutType && ex.workoutTypes.includes(workoutType)) {
      score += 40;
      if (!reason) {
        reason = `Recomendado após ${workoutType.replace(/_/g, " ")}`;
        urgency = urgency === "high" ? "high" : "medium";
      }
    }

    // Treino intenso ou longo
    if (isIntense && ex.priority === 1) {
      score += 20;
      if (!reason) { reason = "Treino intenso — recuperação activa importante"; urgency = "medium"; }
    }
    if (isLong && ex.zones.some(z => ["quadriceps", "hamstrings", "calves", "hip_flexors"].includes(z))) {
      score += 15;
      if (!reason) { reason = "Sessão longa — previne rigidez muscular"; urgency = "medium"; }
    }

    // Prioridade base
    score += (4 - ex.priority) * 10;

    if (score > 0) {
      scored.push({ exercise: ex, score, reason: reason || "Mobilidade geral recomendada", urgency });
    }
  }

  // Ordenar por score e limitar resultados
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ exercise, reason, urgency }) => ({ exercise, reason, urgency }));
}

// ── Programa pré-treino (5-10 min) ────────────────────────────────────────────

export function getWarmupRoutine(workoutType: string): StretchExercise[] {
  return STRETCHING_LIBRARY
    .filter(ex =>
      ex.timing.includes("before") &&
      ex.isActive &&
      (ex.workoutTypes.includes(workoutType) || ex.workoutTypes.includes("long_run"))
    )
    .slice(0, 5);
}

// ── Programa pós-treino (10-15 min) ───────────────────────────────────────────

export function getCooldownRoutine(workoutType: string, sorenessZones?: string[]): StretchExercise[] {
  const suggestions = getMobilitySuggestions({
    workoutType,
    timing: "after",
    sorenessZones,
    maxResults: 7,
  });
  return suggestions.map(s => s.exercise);
}

// ── Programa de recuperação activa (dias de descanso) ────────────────────────

export function getRecoveryRoutine(): StretchExercise[] {
  return STRETCHING_LIBRARY
    .filter(ex =>
      ex.workoutTypes.includes("recovery") || ex.workoutTypes.includes("rest")
    )
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 6);
}

// ── Tempo total de um programa ────────────────────────────────────────────────

export function totalRoutineMinutes(exercises: StretchExercise[]): number {
  const totalSec = exercises.reduce((s, ex) => {
    const perSet = ex.duration_sec > 10 ? ex.duration_sec * 2 : ex.duration_sec * ex.sets * 10; // bilateral
    return s + perSet * ex.sets;
  }, 0);
  return Math.ceil(totalSec / 60);
}
