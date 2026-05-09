/**
 * Templates de sessões de força por fase (Uphill Athlete + Lyss).
 * Cada template lista nomes de exercícios (devem existir na biblioteca strength_exercises).
 */

export type SessionTemplateType =
  | "max_strength"
  | "muscular_endurance"
  | "core"
  | "plyo"
  | "specific";

export interface ExercisePrescription {
  name: string; // matches strength_exercises.name
  sets: number;
  reps: string; // pode ser "8-10", "30s", "10/lado"
  rest_sec: number;
  notes?: string;
}

export interface SessionTemplate {
  id: string;
  type: SessionTemplateType;
  phase: ("transition" | "base" | "build" | "specific" | "taper")[];
  title: string;
  description: string;
  duration_min: number;
  exercises: ExercisePrescription[];
}

export const SESSION_TEMPLATES: SessionTemplate[] = [
  {
    id: "tpl-me-base",
    type: "muscular_endurance",
    phase: ["transition", "base"],
    title: "Resistência Muscular — Base",
    description: "Construção de base muscular geral. Cargas moderadas, séries longas.",
    duration_min: 45,
    exercises: [
      { name: "Walking Lunges", sets: 3, reps: "12/lado", rest_sec: 60 },
      { name: "Step-Up", sets: 3, reps: "12/lado", rest_sec: 60 },
      { name: "Romanian Deadlift", sets: 3, reps: "12", rest_sec: 75 },
      { name: "Push-Up", sets: 3, reps: "10-15", rest_sec: 60 },
      { name: "Dumbbell Row", sets: 3, reps: "12/lado", rest_sec: 60 },
      { name: "Plank", sets: 3, reps: "45s", rest_sec: 45 },
    ],
  },
  {
    id: "tpl-max-build",
    type: "max_strength",
    phase: ["build"],
    title: "Força Máxima — Build",
    description: "Cargas pesadas, poucas reps, descansos longos. Recruta unidades motoras.",
    duration_min: 60,
    exercises: [
      { name: "Back Squat", sets: 4, reps: "5", rest_sec: 180, notes: "85-90% 1RM" },
      { name: "Romanian Deadlift", sets: 4, reps: "5", rest_sec: 180 },
      { name: "Bulgarian Split Squat", sets: 3, reps: "6/lado", rest_sec: 120 },
      { name: "Overhead Press", sets: 3, reps: "5", rest_sec: 120 },
      { name: "Pallof Press", sets: 3, reps: "10/lado", rest_sec: 60 },
    ],
  },
  {
    id: "tpl-plyo-build",
    type: "plyo",
    phase: ["build", "specific"],
    title: "Pliometria — Potência",
    description: "Saltos curtos e explosivos. Foco em rigidez e recolha rápida.",
    duration_min: 35,
    exercises: [
      { name: "Pogo Hops", sets: 3, reps: "30s", rest_sec: 90 },
      { name: "Box Jump", sets: 4, reps: "5", rest_sec: 120 },
      { name: "Single-Leg Hop", sets: 3, reps: "8/lado", rest_sec: 90 },
      { name: "Lateral Bound", sets: 3, reps: "8/lado", rest_sec: 90 },
      { name: "Depth Jump", sets: 3, reps: "5", rest_sec: 120, notes: "apenas se já estás adaptado" },
    ],
  },
  {
    id: "tpl-specific",
    type: "specific",
    phase: ["specific"],
    title: "Força Específica — Uphill",
    description: "Mimica os requisitos da prova: subidas longas com carga.",
    duration_min: 60,
    exercises: [
      { name: "Weighted Vest Hike", sets: 1, reps: "30-45 min", rest_sec: 0, notes: "8-12% inclinação" },
      { name: "Step-Up", sets: 3, reps: "15/lado", rest_sec: 60 },
      { name: "Single-Leg Calf Raise", sets: 3, reps: "15/lado", rest_sec: 45 },
      { name: "Side Plank", sets: 3, reps: "30s/lado", rest_sec: 30 },
    ],
  },
  {
    id: "tpl-core",
    type: "core",
    phase: ["transition", "base", "build", "specific", "taper"],
    title: "Core & Estabilidade",
    description: "Sessão curta de manutenção do core. Pode ser feita após corrida fácil.",
    duration_min: 20,
    exercises: [
      { name: "Plank", sets: 3, reps: "45s", rest_sec: 30 },
      { name: "Side Plank", sets: 2, reps: "30s/lado", rest_sec: 30 },
      { name: "Dead Bug", sets: 3, reps: "10/lado", rest_sec: 30 },
      { name: "Bird Dog", sets: 3, reps: "10/lado", rest_sec: 30 },
      { name: "Pallof Press", sets: 3, reps: "10/lado", rest_sec: 45 },
    ],
  },
  {
    id: "tpl-taper",
    type: "core",
    phase: ["taper"],
    title: "Manutenção — Taper",
    description: "Volume reduzido. Mantém ativação sem fadiga.",
    duration_min: 15,
    exercises: [
      { name: "Hip 90/90 Mobility", sets: 2, reps: "8/lado", rest_sec: 30 },
      { name: "Plank", sets: 2, reps: "30s", rest_sec: 30 },
      { name: "Bird Dog", sets: 2, reps: "8/lado", rest_sec: 30 },
      { name: "Single-Leg Calf Raise", sets: 2, reps: "12/lado", rest_sec: 30 },
    ],
  },
];

export function templatesForPhase(phase: string): SessionTemplate[] {
  const norm = phase.toLowerCase() as SessionTemplate["phase"][number];
  return SESSION_TEMPLATES.filter((t) => t.phase.includes(norm));
}
