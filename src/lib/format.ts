import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

export const fmtDate = (d: string | Date, pattern = "dd/MM/yyyy") =>
  format(typeof d === "string" ? parseISO(d) : d, pattern, { locale: pt });

export const fmtPace = (secPerKm: number | null | undefined) => {
  if (!secPerKm) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
};

export const parsePaceToSeconds = (input: string): number | null => {
  // Accepts "5:30" or "5:30/km" or "330"
  const cleaned = input.trim().replace("/km", "").trim();
  if (cleaned.includes(":")) {
    const [m, s] = cleaned.split(":").map((v) => parseInt(v, 10));
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  }
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
};

export const fmtDuration = (minutes: number | null | undefined) => {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
};

export const zoneLabel = (zone: string | null) => {
  if (!zone) return "—";
  const labels: Record<string, string> = {
    Z1: "Z1 · Recovery",
    Z2: "Z2 · Aeróbio",
    Z3: "Z3 · Tempo",
    Z4: "Z4 · Limiar",
    Z5: "Z5 · VO₂max",
  };
  return labels[zone] ?? zone;
};

export const workoutTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    easy_z2: "Easy Z2",
    long_run: "Long Run",
    tempo: "Tempo",
    intervals: "Intervalos",
    hill_repeats: "Hill Repeats",
    vert_session: "Sessão Vert",
    downhill_repeats: "Downhill Repeats",
    recovery: "Recovery",
    rest: "Descanso",
    strength: "Força",
    cross_training: "Cross-training",
    race: "🏁 Prova",
  };
  return labels[type] ?? type;
};
