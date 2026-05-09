import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { useLanguage, getDateLocale } from "@/lib/i18n";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
} from "recharts";

interface CompletedWorkout {
  workout_date: string;
  actual_distance_km: number | null;
  actual_elevation_m: number | null;
  actual_duration_min: number | null;
  actual_avg_pace_sec_per_km: number | null;
  rpe: number | null;
}

interface TrainingLoadChartProps {
  completed: CompletedWorkout[];
}

export function TrainingLoadChart({ completed }: TrainingLoadChartProps) {
  const { t, lang } = useLanguage();
  const dateLocale = getDateLocale(lang);

  const data = useMemo(() => {
    if (!completed.length) return [];
    const today = new Date();
    const start = subDays(today, 55);
    const days = eachDayOfInterval({ start, end: today });
    const byDate: Record<string, CompletedWorkout[]> = {};
    for (const c of completed) {
      const d = c.workout_date;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(c);
    }
    const dailyLoad: Record<string, number> = {};
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      const workouts = byDate[key] || [];
      dailyLoad[key] = workouts.reduce((sum, w) => {
        const duration = w.actual_duration_min ?? 0;
        const rpe = w.rpe ?? 6;
        return sum + (duration * rpe) / 10;
      }, 0);
    }
    const result: any[] = [];
    for (const day of days) {
      let atlSum = 0, atlCount = 0;
      for (let i = 0; i < 7; i++) {
        const d = format(subDays(day, i), "yyyy-MM-dd");
        if (dailyLoad[d] !== undefined) { atlSum += dailyLoad[d]; atlCount++; }
      }
      const atl = atlCount > 0 ? atlSum / atlCount : 0;
      let ctlSum = 0, ctlCount = 0;
      for (let i = 0; i < 42; i++) {
        const d = format(subDays(day, i), "yyyy-MM-dd");
        if (dailyLoad[d] !== undefined) { ctlSum += dailyLoad[d]; ctlCount++; }
      }
      const ctl = ctlCount > 0 ? ctlSum / ctlCount : 0;
      const weekStart = startOfWeek(day, { weekStartsOn: 1 });
      const weekLabel = format(weekStart, "d MMM", { locale: dateLocale });
      const isMonday = day.getDay() === 1;
      if (isMonday || day.getTime() === today.getTime()) {
        result.push({
          week: weekLabel,
          load: Math.round(atl * 7),
          atl: Math.round(atl),
          ctl: Math.round(ctl),
          tsb: Math.round(ctl - atl),
        });
      }
    }
    return result;
  }, [completed, dateLocale]);

  if (!data.length) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        {t("tload.empty")}
      </Card>
    );
  }

  const labels: Record<string, string> = {
    load: t("tload.weekly"),
    atl: "ATL",
    ctl: "CTL",
    tsb: "TSB",
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("tload.title")}</div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs text-xs space-y-1.5">
              <div className="font-semibold">{t("tload.help.title")}</div>
              <p>{t("tload.help.atl")}</p>
              <p>{t("tload.help.ctl")}</p>
              <p>{t("tload.help.tsb")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="text-xs text-muted-foreground mb-3">{t("tload.subtitle")}</div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
          <ReTooltip
            contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", fontSize: 12 }}
            formatter={(value: any, name: string) => [`${value}`, labels[name] ?? name]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} formatter={(value: string) => labels[value] ?? value} />
          <Bar yAxisId="left" dataKey="load" fill="hsl(var(--primary))" opacity={0.25} radius={[2, 2, 0, 0]} name="load" />
          <Line yAxisId="right" type="monotone" dataKey="atl" stroke="#f59e0b" strokeWidth={2} dot={false} name="atl" />
          <Line yAxisId="right" type="monotone" dataKey="ctl" stroke="#3b82f6" strokeWidth={2} dot={false} name="ctl" />
          <Line yAxisId="right" type="monotone" dataKey="tsb" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="tsb" />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
