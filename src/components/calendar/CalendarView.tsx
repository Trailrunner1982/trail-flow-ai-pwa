import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { addDays, addWeeks, format, isSameDay, parseISO, startOfWeek } from "date-fns";
import { useLanguage, getDateLocale } from "@/lib/i18n";
import { workoutTypeLabel } from "@/lib/format";
import { WorkoutDetailDialog } from "./WorkoutDetailDialog";
import type {
  CalendarCompletedWorkout,
  CalendarPlannedWorkout,
  CalendarStorage,
} from "./types";

interface Props {
  planned: CalendarPlannedWorkout[];
  completed: CalendarCompletedWorkout[];
  storage: CalendarStorage;
  onChanged?: () => void; // notify parent to refetch
}

const TYPE_COLORS: Record<string, string> = {
  long_run: "bg-primary/20 border-primary/40 text-primary",
  intervals: "bg-orange-500/15 border-orange-500/30 text-orange-400",
  tempo: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400",
  vert_session: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  downhill_repeats: "bg-purple-500/15 border-purple-500/30 text-purple-400",
  hill_repeats: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  easy_z2: "bg-muted/60 border-border text-foreground/80",
  recovery: "bg-muted/40 border-border text-muted-foreground",
  rest: "bg-muted/20 border-border/40 text-muted-foreground",
  strength: "bg-blue-500/15 border-blue-500/30 text-blue-400",
  cross_training: "bg-blue-500/10 border-blue-500/20 text-blue-300",
  race: "bg-amber-500/20 border-amber-500/40 text-amber-400",
};

export function CalendarView({ planned, completed, storage, onChanged }: Props) {
  const { t, lang } = useLanguage();
  const dateLocale = getDateLocale(lang);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selected, setSelected] = useState<CalendarPlannedWorkout | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const completedByPlannedId = useMemo(() => {
    const m = new Map<string, CalendarCompletedWorkout>();
    completed.forEach((c) => {
      if (c.planned_workout_id) m.set(c.planned_workout_id, c);
    });
    return m;
  }, [completed]);
  const completedByDate = useMemo(() => {
    const m = new Map<string, CalendarCompletedWorkout>();
    completed.forEach((c) => m.set(c.workout_date, c));
    return m;
  }, [completed]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const plannedByDate = useMemo(() => {
    const m = new Map<string, CalendarPlannedWorkout[]>();
    planned.forEach((p) => {
      const arr = m.get(p.workout_date) ?? [];
      arr.push(p);
      m.set(p.workout_date, arr);
    });
    return m;
  }, [planned]);

  const upcoming = useMemo(() => {
    if (!selected) return [];
    const todayStr = selected.workout_date;
    return planned
      .filter((p) => p.workout_date > todayStr)
      .sort((a, b) => a.workout_date.localeCompare(b.workout_date));
  }, [planned, selected]);

  const findCompleted = (p: CalendarPlannedWorkout): CalendarCompletedWorkout | null => {
    if (p.id && completedByPlannedId.has(p.id)) return completedByPlannedId.get(p.id)!;
    return completedByDate.get(p.workout_date) ?? null;
  };

  const handleSelect = (p: CalendarPlannedWorkout) => {
    setSelected(p);
    setDialogOpen(true);
  };

  const weekLabel = `${format(weekStart, "d MMM", { locale: dateLocale })} – ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: dateLocale })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            {t("cal.today")}
          </Button>
          <Button size="icon" variant="outline" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-sm font-medium text-muted-foreground">{weekLabel}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const items = plannedByDate.get(dateStr) ?? [];
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={dateStr}
              className={`border rounded-lg p-2 min-h-[110px] flex flex-col gap-1.5 ${
                isToday ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  {format(day, "EEE", { locale: dateLocale })}
                </div>
                <div className={`text-sm font-bold ${isToday ? "text-primary" : ""}`}>{format(day, "d")}</div>
              </div>
              <div className="flex-1 space-y-1">
                {items.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground/50 italic mt-2">—</div>
                ) : (
                  items.map((p, i) => {
                    const isDone = !!findCompleted(p);
                    const colors = TYPE_COLORS[p.workout_type] ?? "bg-muted/40 border-border text-foreground";
                    return (
                      <button
                        key={p.id ?? `${dateStr}-${i}`}
                        onClick={() => handleSelect(p)}
                        className={`relative w-full text-left text-[11px] rounded-md border px-2 py-1.5 leading-tight transition hover:scale-[1.02] hover:brightness-110 ${colors}`}
                      >
                        {isDone && (
                          <CheckCircle2 className="w-3 h-3 absolute top-1 right-1 text-emerald-400" />
                        )}
                        <div className="font-medium pr-4 line-clamp-2">{p.title}</div>
                        <div className="opacity-70 text-[10px] mt-0.5 flex flex-wrap gap-1">
                          {p.target_distance_km ? <span>{p.target_distance_km}km</span> : null}
                          {p.target_elevation_m ? <span>· {p.target_elevation_m}D+</span> : null}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Card className="p-3">
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          <Legend color="bg-primary/40" label={t("cal.legend.long")} />
          <Legend color="bg-orange-500/40" label={t("cal.legend.intervals")} />
          <Legend color="bg-yellow-500/40" label={t("cal.legend.tempo")} />
          <Legend color="bg-emerald-500/40" label={t("cal.legend.vert")} />
          <Legend color="bg-purple-500/40" label={t("cal.legend.downhill")} />
          <Legend color="bg-blue-500/40" label={t("cal.legend.strength")} />
          <Legend color="bg-muted/60" label={t("cal.legend.easy")} />
          <span className="ml-auto inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {t("cal.legend.done")}
          </span>
        </div>
      </Card>

      <WorkoutDetailDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) onChanged?.();
        }}
        planned={selected}
        existingCompleted={selected ? findCompleted(selected) : null}
        upcoming={upcoming}
        storage={storage}
        onSaved={() => onChanged?.()}
        allPlanned={planned}
        allCompleted={completed}
        onReschedule={() => onChanged?.()}
      />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-2.5 h-2.5 rounded-sm ${color}`} /> {label}
    </span>
  );
}

export function buildWeekStat(planned: CalendarPlannedWorkout[]) {
  const km = planned.reduce((s, p) => s + (p.target_distance_km ?? 0), 0);
  const vert = planned.reduce((s, p) => s + (p.target_elevation_m ?? 0), 0);
  return { km: Math.round(km), vert };
}

export { Badge as _Badge };
export type { CalendarPlannedWorkout, CalendarCompletedWorkout };
