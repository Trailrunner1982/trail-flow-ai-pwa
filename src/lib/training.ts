// Cálculos partilhados (Fase 1)

export type Readiness = "green" | "yellow" | "red";

export interface ReadinessInput {
  hrv?: number | null;
  sleep_score?: number | null;
  body_battery?: number | null;
  energy_level?: number | null;
}

export interface ReadinessResult {
  status: Readiness;
  score: number; // 0-100
  label: string;
  recommendation: string;
}

/** Semáforo de prontidão. Aceita parciais; ignora nulls. */
export function calculateReadiness(input: ReadinessInput): ReadinessResult {
  const parts: number[] = [];
  if (input.sleep_score != null) parts.push(clamp(input.sleep_score, 0, 100));
  if (input.body_battery != null) parts.push(clamp(input.body_battery, 0, 100));
  if (input.hrv != null) {
    // HRV típico 20-100ms → mapeia para 0-100
    parts.push(clamp(((input.hrv - 20) / 80) * 100, 0, 100));
  }
  if (input.energy_level != null) {
    // 1-10 → 0-100
    parts.push(clamp(input.energy_level * 10, 0, 100));
  }
  const score = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 50;

  if (score >= 70) {
    return { status: "green", score, label: "Força total", recommendation: "Treino conforme planeado." };
  }
  if (score >= 45) {
    return { status: "yellow", score, label: "Treino moderado", recommendation: "Reduzir intensidade ~15-20%." };
  }
  return { status: "red", score, label: "Recuperação", recommendation: "Descanso ou ativo muito leve." };
}

export interface Zone { hr_min: number; hr_max: number; pace_sec_per_km: number }
export interface Zones { z1: Zone; z2: Zone; z3: Zone; z4: Zone; z5: Zone }

/** Karvonen + ajuste de pace por zona (referência aproximada). */
export function calculateZones(maxHr: number, restHr: number, basePaceSec: number): Zones {
  const reserve = maxHr - restHr;
  const hr = (lo: number, hi: number) => ({
    hr_min: Math.round(restHr + reserve * lo),
    hr_max: Math.round(restHr + reserve * hi),
  });
  // Pace: Z2 = base; outros relativos
  const pace = (factor: number) => Math.round(basePaceSec * factor);
  return {
    z1: { ...hr(0.5, 0.6), pace_sec_per_km: pace(1.18) },
    z2: { ...hr(0.6, 0.7), pace_sec_per_km: pace(1.0) },
    z3: { ...hr(0.7, 0.8), pace_sec_per_km: pace(0.92) },
    z4: { ...hr(0.8, 0.9), pace_sec_per_km: pace(0.86) },
    z5: { ...hr(0.9, 1.0), pace_sec_per_km: pace(0.82) },
  };
}

/**
 * Grade Adjusted Pace — aproximação Strava/Minetti.
 * grade = elevation_m / (distance_km * 1000)
 * factor ≈ 1 + 3.3*g + 32*g^2  (positivo); ligeiramente negativo em descida moderada.
 */
export function calculateGAP(paceSecPerKm: number, distanceKm: number, elevationM: number): number {
  if (!distanceKm || distanceKm <= 0) return paceSecPerKm;
  const grade = elevationM / (distanceKm * 1000);
  const factor = 1 + 3.3 * grade + 32 * grade * grade;
  return Math.round(paceSecPerKm * Math.max(0.7, factor));
}

/** IMC clássico kg/m². */
export function calculateBMI(weightKg: number, heightCm: number): number {
  if (!heightCm) return 0;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/**
 * Idade metabólica — estimativa simples.
 * Base: idade cronológica ajustada por VO2max e IMC.
 * VO2max alto baixa idade; IMC fora de 22 sobe idade.
 */
export function calculateMetabolicAge(
  chronologicalAge: number,
  vo2max?: number | null,
  bmi?: number | null,
): number {
  let age = chronologicalAge;
  if (vo2max && vo2max > 0) {
    // referência ~40 ml/kg/min
    age -= (vo2max - 40) * 0.4;
  }
  if (bmi && bmi > 0) {
    age += Math.abs(bmi - 22) * 0.6;
  }
  return Math.max(15, Math.round(age));
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
