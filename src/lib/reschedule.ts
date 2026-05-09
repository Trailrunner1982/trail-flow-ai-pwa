import { format, parseISO, startOfWeek, addDays, isSameDay, isAfter, isBefore } from "date-fns";
import type { CalendarPlannedWorkout } from "@/components/calendar/types";

/** Day of week as 1=Mon..7=Sun (matches profiles.available_run_days convention). */
function dayOfWeekIso(d: Date): number {
  const js = d.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
}

export interface AvailableDay {
  date: string; // yyyy-MM-dd
  hasWorkout: boolean;
  isPast: boolean;
  conflictTitle?: string;
}

export function getAvailableDaysInWeek(
  workoutDate: string,
  availableRunDays: number[] | null | undefined,
  weekPlanned: CalendarPlannedWorkout[],
): AvailableDay[] {
  const date = parseISO(workoutDate);
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allowed = availableRunDays && availableRunDays.length ? availableRunDays : [1, 2, 3, 4, 5, 6, 7];

  const result: AvailableDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (isSameDay(d, date)) continue; // skip the original day
    if (!allowed.includes(dayOfWeekIso(d))) continue;
    if (isBefore(d, today)) continue;
    const dateStr = format(d, "yyyy-MM-dd");
    const conflict = weekPlanned.find((w) => w.workout_date === dateStr);
    result.push({
      date: dateStr,
      hasWorkout: !!conflict,
      isPast: false,
      conflictTitle: conflict?.title,
    });
  }
  return result;
}

export function getWeekPlanned(
  workoutDate: string,
  allPlanned: CalendarPlannedWorkout[],
): CalendarPlannedWorkout[] {
  const date = parseISO(workoutDate);
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = addDays(start, 7);
  return allPlanned.filter((w) => {
    const d = parseISO(w.workout_date);
    return !isBefore(d, start) && isBefore(d, end);
  });
}

/**
 * Redistribui o volume/elevação do treino falhado pelos restantes treinos da semana
 * que ainda não foram executados. Devolve as alterações por id.
 */
export function redistributeWorkout(
  skipped: CalendarPlannedWorkout,
  weekPlanned: CalendarPlannedWorkout[],
  completedDates: Set<string>,
): { id: string; updates: Partial<CalendarPlannedWorkout>; newTitle: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidates = weekPlanned.filter(
    (w) =>
      w.id &&
      w.id !== skipped.id &&
      !completedDates.has(w.workout_date) &&
      !isBefore(parseISO(w.workout_date), today) &&
      w.workout_type !== "rest" &&
      w.workout_type !== "race",
  );
  if (candidates.length === 0) return [];

  const distShare = (skipped.target_distance_km ?? 0) / candidates.length;
  const elevShare = (skipped.target_elevation_m ?? 0) / candidates.length;
  const durShare = (skipped.target_duration_min ?? 0) / candidates.length;

  return candidates.map((c) => ({
    id: c.id!,
    newTitle: `${c.title} +redistribuído`,
    updates: {
      target_distance_km: c.target_distance_km
        ? Math.round((c.target_distance_km + distShare) * 10) / 10
        : Math.round(distShare * 10) / 10,
      target_elevation_m: c.target_elevation_m
        ? Math.round(c.target_elevation_m + elevShare)
        : Math.round(elevShare),
      target_duration_min: c.target_duration_min
        ? Math.round(c.target_duration_min + durShare)
        : Math.round(durShare),
    },
  }));
}
