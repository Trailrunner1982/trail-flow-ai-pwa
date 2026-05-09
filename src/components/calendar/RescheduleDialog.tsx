import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRightLeft, Layers, Brain, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useLanguage, getDateLocale } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import {
  getAvailableDaysInWeek,
  getWeekPlanned,
  redistributeWorkout,
} from "@/lib/reschedule";
import type { CalendarPlannedWorkout, CalendarCompletedWorkout } from "./types";

type Mode = "choose" | "move" | "redistribute" | "ai";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  planned: CalendarPlannedWorkout | null;
  allPlanned: CalendarPlannedWorkout[];
  completed: CalendarCompletedWorkout[];
  onDone: () => void;
}

export function RescheduleDialog({
  open,
  onOpenChange,
  planned,
  allPlanned,
  completed,
  onDone,
}: Props) {
  const { t, lang } = useLanguage();
  const dateLocale = getDateLocale(lang);
  const { userId, canWrite } = useEffectiveUser();
  const [mode, setMode] = useState<Mode>("choose");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [availableDays, setAvailableDays] = useState<{ date: string; hasWorkout: boolean; conflictTitle?: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setMode("choose");
    setReason("");
  }, [open]);

  useEffect(() => {
    if (!open || !planned || !userId) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("available_run_days")
        .eq("id", userId)
        .single();
      const week = getWeekPlanned(planned.workout_date, allPlanned);
      const days = getAvailableDaysInWeek(planned.workout_date, profile?.available_run_days as any, week);
      setAvailableDays(days);
    })();
  }, [open, planned, userId, allPlanned]);

  const weekPlanned = useMemo(
    () => (planned ? getWeekPlanned(planned.workout_date, allPlanned) : []),
    [planned, allPlanned],
  );
  const completedDates = useMemo(() => new Set(completed.map((c) => c.workout_date)), [completed]);
  const redistribution = useMemo(
    () => (planned ? redistributeWorkout(planned, weekPlanned, completedDates) : []),
    [planned, weekPlanned, completedDates],
  );

  if (!planned) return null;

  const guard = () => {
    if (!canWrite) {
      toast.error(t("cal.reschedule.readOnly"));
      return false;
    }
    if (!planned.id) {
      toast.error(t("cal.reschedule.noId"));
      return false;
    }
    return true;
  };

  const handleMove = async (newDate: string) => {
    if (!guard()) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("planned_workouts")
        .update({
          workout_date: newDate,
          skip_reason: reason || null,
          description: planned.description
            ? `${planned.description}\n\n↻ Movido de ${planned.workout_date}${reason ? `: ${reason}` : ""}`
            : `↻ Movido de ${planned.workout_date}${reason ? `: ${reason}` : ""}`,
        })
        .eq("id", planned.id!);
      if (error) throw error;
      toast.success(t("cal.reschedule.moved"));
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const handleRedistribute = async () => {
    if (!guard()) return;
    if (redistribution.length === 0) {
      toast.error(t("cal.reschedule.noTargets"));
      return;
    }
    setBusy(true);
    try {
      // Mark skipped
      await supabase
        .from("planned_workouts")
        .update({
          is_skipped: true,
          skip_reason: reason || t("cal.reschedule.defaultReason"),
          description: `↷ Redistribuído pelos restantes treinos da semana${reason ? `: ${reason}` : ""}`,
        })
        .eq("id", planned.id!);
      // Apply each
      for (const r of redistribution) {
        await supabase
          .from("planned_workouts")
          .update({
            target_distance_km: r.updates.target_distance_km ?? null,
            target_elevation_m: r.updates.target_elevation_m ?? null,
            target_duration_min: r.updates.target_duration_min ?? null,
            title: r.newTitle,
          })
          .eq("id", r.id);
      }
      toast.success(t("cal.reschedule.redistributed", { n: redistribution.length }));
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const handleAI = async () => {
    if (!guard()) return;
    setBusy(true);
    try {
      // Mark skipped first
      await supabase
        .from("planned_workouts")
        .update({
          is_skipped: true,
          skip_reason: reason || t("cal.reschedule.defaultReason"),
        })
        .eq("id", planned.id!);

      // Invoke adapt-plan edge function
      const { data, error } = await supabase.functions.invoke("adapt-plan", {
        body: {
          trigger: "skipped_workout",
          skipped_workout: planned,
          reason: reason || t("cal.reschedule.defaultReason"),
          upcoming: allPlanned
            .filter((p) => p.workout_date >= planned.workout_date)
            .slice(0, 14),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(t("cal.reschedule.aiOk"));
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            {t("cal.reschedule.title")}
          </DialogTitle>
          <DialogDescription>
            {planned.title} · {format(parseISO(planned.workout_date), "EEEE dd MMM", { locale: dateLocale })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs">{t("cal.reschedule.reasonLabel")}</Label>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("cal.reschedule.reasonPlaceholder")}
          />
        </div>

        {mode === "choose" && (
          <div className="space-y-2">
            <ChooseCard
              icon={ArrowRightLeft}
              title={t("cal.reschedule.optMove")}
              desc={t("cal.reschedule.optMoveDesc")}
              onClick={() => setMode("move")}
            />
            <ChooseCard
              icon={Layers}
              title={t("cal.reschedule.optRedistribute")}
              desc={t("cal.reschedule.optRedistributeDesc", { n: redistribution.length })}
              onClick={() => setMode("redistribute")}
              disabled={redistribution.length === 0}
            />
            <ChooseCard
              icon={Brain}
              title={t("cal.reschedule.optAI")}
              desc={t("cal.reschedule.optAIDesc")}
              onClick={() => setMode("ai")}
            />
          </div>
        )}

        {mode === "move" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("cal.reschedule.movePrompt")}</p>
            {availableDays.length === 0 ? (
              <p className="text-sm text-amber-500">{t("cal.reschedule.noDays")}</p>
            ) : (
              <div className="grid gap-2">
                {availableDays.map((d) => (
                  <Button
                    key={d.date}
                    variant="outline"
                    className="justify-between h-auto py-3"
                    disabled={busy}
                    onClick={() => handleMove(d.date)}
                  >
                    <span className="font-medium">
                      {format(parseISO(d.date), "EEEE dd MMM", { locale: dateLocale })}
                    </span>
                    {d.hasWorkout && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t("cal.reschedule.conflict")}: {d.conflictTitle}
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => setMode("choose")} disabled={busy}>
              ← {t("common.back")}
            </Button>
          </div>
        )}

        {mode === "redistribute" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("cal.reschedule.redistPrompt")}</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {redistribution.map((r) => {
                const w = weekPlanned.find((x) => x.id === r.id)!;
                return (
                  <div key={r.id} className="text-xs bg-muted/40 rounded p-2 flex justify-between">
                    <span>{format(parseISO(w.workout_date), "EEE dd", { locale: dateLocale })} · {w.title}</span>
                    <span className="text-primary font-medium">
                      +{r.updates.target_distance_km ?? 0}km · +{r.updates.target_elevation_m ?? 0}m
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setMode("choose")} disabled={busy}>
                ← {t("common.back")}
              </Button>
              <Button onClick={handleRedistribute} disabled={busy} className="flex-1">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("cal.reschedule.applyRedist")}
              </Button>
            </div>
          </div>
        )}

        {mode === "ai" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("cal.reschedule.aiPrompt")}</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setMode("choose")} disabled={busy}>
                ← {t("common.back")}
              </Button>
              <Button onClick={handleAI} disabled={busy} className="flex-1">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {t("cal.reschedule.askAI")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChooseCard({
  icon: Icon,
  title,
  desc,
  onClick,
  disabled,
}: {
  icon: any;
  title: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left p-3 rounded-lg border border-border/60 hover:bg-muted/40 hover:border-primary/40 transition-colors flex gap-3 items-start disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Icon className="w-5 h-5 text-primary mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}
