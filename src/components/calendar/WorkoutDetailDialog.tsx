import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useLanguage, getDateLocale } from "@/lib/i18n";
import { workoutTypeLabel, zoneLabel, fmtDuration, fmtPace } from "@/lib/format";
import {
  Brain, CheckCircle2, Loader2, Sparkles, ThumbsUp, AlertTriangle,
  Mountain, Clock, Gauge, Timer, Apple, Droplet, Activity,
} from "lucide-react";
import { CalendarX } from "lucide-react";
import { getWorkoutNutrition } from "@/lib/nutrition";
import { RescheduleDialog } from "./RescheduleDialog";
import { useAuth } from "@/hooks/useAuth";
import type {
  CalendarCompletedWorkout, CalendarPlannedWorkout, CalendarStorage,
  DeepFeedback, QuickFeedback, Verdict, AdaptationProposal,
} from "./types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  planned: CalendarPlannedWorkout | null;
  existingCompleted?: CalendarCompletedWorkout | null;
  upcoming: CalendarPlannedWorkout[];
  storage: CalendarStorage;
  onSaved?: (c: CalendarCompletedWorkout) => void;
  allPlanned?: CalendarPlannedWorkout[];
  allCompleted?: CalendarCompletedWorkout[];
  onReschedule?: () => void;
}

const verdictMeta: Record<Verdict, { label: string; color: string; icon: any }> = {
  great: { label: "Excelente", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: Sparkles },
  good: { label: "Bom", color: "bg-primary/15 text-primary border-primary/30", icon: ThumbsUp },
  ok: { label: "OK", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: CheckCircle2 },
  poor: { label: "Aquém", color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: AlertTriangle },
  concern: { label: "Atenção", color: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertTriangle },
};

export function WorkoutDetailDialog({
  open, onOpenChange, planned, existingCompleted, upcoming, storage,
  onSaved, allPlanned, allCompleted, onReschedule,
}: Props) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const dateLocale = getDateLocale(lang);
  const [tab, setTab] = useState<"plan" | "log" | "fuel">("plan");
  const [saving, setSaving] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState<null | "quick" | "deep">(null);
  const [applying, setApplying] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [stravaActivity, setStravaActivity] = useState<any>(null);

  const [form, setForm] = useState({
    distance: "", elevation: "", durationMin: "", paceSec: "", rpe: 5, notes: "",
  });

  const [quick, setQuick] = useState<QuickFeedback | null>(null);
  const [deep, setDeep] = useState<DeepFeedback | null>(null);

  useEffect(() => {
    if (!open || !planned) return;
    setQuick(null);
    setDeep(null);
    setStravaActivity(null);
    setTab(existingCompleted ? "log" : "plan");
    setForm({
      distance: existingCompleted?.actual_distance_km?.toString() ?? planned.target_distance_km?.toString() ?? "",
      elevation: existingCompleted?.actual_elevation_m?.toString() ?? planned.target_elevation_m?.toString() ?? "",
      durationMin: existingCompleted?.actual_duration_min?.toString() ?? planned.target_duration_min?.toString() ?? "",
      paceSec: existingCompleted?.actual_avg_pace_sec_per_km?.toString() ?? "",
      rpe: existingCompleted?.rpe ?? 5,
      notes: existingCompleted?.notes ?? "",
    });

    // Verificar se existe atividade do Strava no mesmo dia
    if (user && !existingCompleted) {
      supabase
        .from("free_workouts")
        .select("*")
        .eq("user_id", user.id)
        .eq("workout_date", planned.workout_date)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setStravaActivity(data);
        });
    }
  }, [open, planned, existingCompleted, user]);

  if (!planned) return null;

  const applyStravaActivity = () => {
    if (!stravaActivity) return;
    setForm({
      distance: stravaActivity.distance_km?.toString() ?? "",
      elevation: stravaActivity.elevation_m?.toString() ?? "",
      durationMin: stravaActivity.duration_min?.toString() ?? "",
      paceSec: stravaActivity.avg_pace_sec_per_km?.toString() ?? "",
      rpe: form.rpe,
      notes: stravaActivity.notes ?? "",
    });
    setStravaActivity(null);
    toast.success("Dados do Strava aplicados!");
  };

  const buildExecutedPayload = (): Omit<CalendarCompletedWorkout, "workout_date"> => ({
    actual_distance_km: form.distance ? Number(form.distance) : null,
    actual_elevation_m: form.elevation ? Number(form.elevation) : null,
    actual_duration_min: form.durationMin ? Number(form.durationMin) : null,
    actual_avg_pace_sec_per_km: form.paceSec ? Number(form.paceSec) : null,
    rpe: form.rpe,
    notes: form.notes || null,
    planned_workout_id: planned.id ?? null,
  });

  const handleSave = async (): Promise<CalendarCompletedWorkout | null> => {
    setSaving(true);
    try {
      const payload = buildExecutedPayload();
      const saved = await storage.saveCompleted(planned, payload);
      onSaved?.(saved);
      toast.success(t("cal.toast.saved"));
      return saved;
    } catch (e: any) {
      toast.error(e?.message ?? t("common.error"));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const requestFeedback = async (mode: "quick" | "deep") => {
    setLoadingFeedback(mode);
    try {
      const executed = buildExecutedPayload();
      const { data, error } = await supabase.functions.invoke("coach-feedback", {
        body: {
          mode,
          planned: { ...planned, description: planned.description },
          executed,
          upcoming: mode === "deep" ? upcoming.slice(0, 14) : [],
        },
      });
      if (error) throw error;
      const result = data.result;
      if (mode === "quick") setQuick(result as QuickFeedback);
      else setDeep(result as DeepFeedback);
      try {
        await storage.persistFeedback?.(mode, planned, executed, result);
      } catch (err) {
        console.warn("persistFeedback failed:", err);
      }
    } catch (e: any) {
      toast.error(e?.message ?? t("cal.toast.feedbackErr"));
    } finally {
      setLoadingFeedback(null);
    }
  };

  const handleSaveAndQuickFeedback = async () => {
    const saved = await handleSave();
    if (saved) await requestFeedback("quick");
  };

  const handleApplyAdaptations = async (adaptations: AdaptationProposal[]) => {
    setApplying(true);
    try {
      await storage.applyAdaptations(adaptations);
      toast.success(t("cal.toast.adapted", { n: adaptations.length }));
      setDeep(null);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? t("cal.toast.applyErr"));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              {format(parseISO(planned.workout_date), "EEEE, dd MMM", { locale: dateLocale })}
            </Badge>
            {planned.phase && <Badge variant="secondary" className="text-[10px]">{planned.phase}</Badge>}
            {planned.zone && <Badge variant="outline" className="text-[10px]">{zoneLabel(planned.zone)}</Badge>}
          </div>
          <DialogTitle className="text-xl">{planned.title}</DialogTitle>
          <DialogDescription>{workoutTypeLabel(planned.workout_type)}</DialogDescription>
          {planned.id && !existingCompleted && (
            <div className="pt-2">
              <Button size="sm" variant="outline"
                className="border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                onClick={() => setRescheduleOpen(true)}>
                <CalendarX className="w-4 h-4" />
                {t("cal.reschedule.button")}
              </Button>
            </div>
          )}
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="plan">{t("cal.tab.plan")}</TabsTrigger>
            <TabsTrigger value="fuel">
              <Apple className="w-3.5 h-3.5 mr-1" />{t("cal.tab.nutrition")}
            </TabsTrigger>
            <TabsTrigger value="log">{t("cal.tab.log")}</TabsTrigger>
          </TabsList>

          <TabsContent value="plan" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat icon={Gauge} label={t("cal.field.target_distance")} value={planned.target_distance_km ? `${planned.target_distance_km} km` : "—"} />
              <Stat icon={Mountain} label={t("cal.field.target_elevation")} value={planned.target_elevation_m ? `${planned.target_elevation_m} m` : "—"} />
              <Stat icon={Clock} label={t("cal.field.target_duration")} value={fmtDuration(planned.target_duration_min)} />
              <Stat icon={Timer} label={t("cal.field.target_pace")} value={fmtPace(planned.target_pace_sec_per_km)} />
            </div>
            {planned.description && (
              <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3 leading-relaxed">
                {planned.description}
              </div>
            )}
          </TabsContent>

          <TabsContent value="fuel" className="space-y-4 pt-4">
            <NutritionPanel planned={planned} />
          </TabsContent>

          <TabsContent value="log" className="space-y-4 pt-4">

            {/* Banner Strava */}
            {stravaActivity && (
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-orange-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-orange-500">Atividade do Strava encontrada!</p>
                    <p className="text-xs text-muted-foreground">
                      {stravaActivity.distance_km ?? "—"}km · {stravaActivity.duration_min ?? "—"}min · D+{stravaActivity.elevation_m ?? "—"}m
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline"
                  className="border-orange-500/40 text-orange-500 hover:bg-orange-500/10"
                  onClick={applyStravaActivity}>
                  Usar dados do Strava
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("cal.field.distance")}>
                <Input type="number" step="0.1" value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} />
              </FormField>
              <FormField label={t("cal.field.elevation")}>
                <Input type="number" value={form.elevation} onChange={(e) => setForm({ ...form, elevation: e.target.value })} />
              </FormField>
              <FormField label={t("cal.field.duration")}>
                <Input type="number" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
              </FormField>
              <FormField label={t("cal.field.pace")}>
                <Input type="number" value={form.paceSec} onChange={(e) => setForm({ ...form, paceSec: e.target.value })} placeholder="ex: 330" />
              </FormField>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-xs">{t("cal.field.rpe")}</Label>
                <Badge variant="secondary">{form.rpe} / 10</Badge>
              </div>
              <Slider value={[form.rpe]} min={1} max={10} step={1} onValueChange={(v) => setForm({ ...form, rpe: v[0] })} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{t("cal.rpe.light")}</span><span>{t("cal.rpe.mod")}</span><span>{t("cal.rpe.max")}</span>
              </div>
            </div>

            <FormField label={t("cal.field.notes")}>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t("cal.field.notesPlaceholder")} />
            </FormField>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleSave} variant="outline" disabled={saving} className="flex-1">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t("cal.btn.save")}
              </Button>
              <Button onClick={handleSaveAndQuickFeedback} disabled={saving || loadingFeedback !== null} className="flex-1">
                {loadingFeedback === "quick" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {t("cal.btn.saveQuick")}
              </Button>
            </div>

            {quick && <FeedbackCard quick={quick} />}

            <div className="border-t border-border/40 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{t("cal.btn.deepLabel")}</span>
                </div>
                <Button size="sm" variant="summit" onClick={() => requestFeedback("deep")} disabled={loadingFeedback !== null}>
                  {loadingFeedback === "deep" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                  {t("cal.btn.deep")}
                </Button>
              </div>
              {deep && <DeepFeedbackCard deep={deep} onApply={handleApplyAdaptations} applying={applying} />}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
      <RescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        planned={planned}
        allPlanned={allPlanned ?? upcoming}
        completed={allCompleted ?? []}
        onDone={() => { onReschedule?.(); onOpenChange(false); }}
      />
    </Dialog>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}

function NutritionPanel({ planned }: { planned: CalendarPlannedWorkout }) {
  const n = getWorkoutNutrition(planned);
  const intensityLabel =
    n.intensity === "high" ? "Alta intensidade" :
    n.intensity === "moderate" ? "Moderada / Longa" : "Fácil / Curta";
  const intensityColor =
    n.intensity === "high" ? "bg-destructive/15 text-destructive border-destructive/30" :
    n.intensity === "moderate" ? "bg-primary/15 text-primary border-primary/30" :
    "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";

  return (
    <div className="space-y-4">
      <div className={`border rounded-lg p-3 space-y-2 ${intensityColor}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge variant="outline" className="border-current text-[10px]">{intensityLabel}</Badge>
          <div className="flex items-center gap-3 text-[11px] text-foreground/80">
            <span className="flex items-center gap-1"><Apple className="w-3 h-3" /> {n.carbsPerHourG[0]}–{n.carbsPerHourG[1]} g/h</span>
            <span className="flex items-center gap-1"><Droplet className="w-3 h-3" /> {n.fluidsMlPerHour[0]}–{n.fluidsMlPerHour[1]} ml/h</span>
          </div>
        </div>
        <p className="text-xs text-foreground/85 italic">{n.rationale}</p>
      </div>
      {n.sections.map((s) => (
        <div key={s.title} className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{s.title}</div>
          <ul className="text-sm space-y-1.5 text-foreground/90">
            {s.items.map((it, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span className="leading-relaxed">{it}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function FeedbackCard({ quick }: { quick: QuickFeedback }) {
  const { t } = useLanguage();
  const meta = verdictMeta[quick.verdict];
  const Icon = meta.icon;
  return (
    <div className={`border rounded-lg p-4 space-y-3 ${meta.color}`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <Badge variant="outline" className="text-[10px] border-current">{meta.label}</Badge>
      </div>
      <div className="font-medium text-sm text-foreground">{quick.headline}</div>
      {quick.highlights.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">{t("coach.highlights")}</div>
          <ul className="text-xs space-y-1 text-foreground/90">{quick.highlights.map((h, i) => <li key={i}>• {h}</li>)}</ul>
        </div>
      )}
      {quick.improvements.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">{t("coach.improvements")}</div>
          <ul className="text-xs space-y-1 text-foreground/90">{quick.improvements.map((h, i) => <li key={i}>• {h}</li>)}</ul>
        </div>
      )}
      <div className="text-xs italic text-foreground/80 pt-1 border-t border-current/20">
        💡 {quick.next_session_tip}
      </div>
    </div>
  );
}

function DeepFeedbackCard({ deep, onApply, applying }: {
  deep: DeepFeedback; onApply: (a: AdaptationProposal[]) => void; applying: boolean;
}) {
  const { t, lang } = useLanguage();
  const dateLocale = getDateLocale(lang);
  const meta = verdictMeta[deep.verdict];
  return (
    <div className={`border rounded-lg p-4 space-y-3 ${meta.color}`}>
      <Badge variant="outline" className="text-[10px] border-current">{meta.label}</Badge>
      <p className="text-sm text-foreground leading-relaxed">{deep.summary}</p>
      {deep.highlights.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">{t("coach.highlights")}</div>
          <ul className="text-xs space-y-1 text-foreground/90">{deep.highlights.map((h, i) => <li key={i}>• {h}</li>)}</ul>
        </div>
      )}
      {deep.improvements.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">{t("coach.improvements")}</div>
          <ul className="text-xs space-y-1 text-foreground/90">{deep.improvements.map((h, i) => <li key={i}>• {h}</li>)}</ul>
        </div>
      )}
      {deep.adaptations.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wide opacity-70">{t("cal.deep.proposals")}</div>
          <div className="space-y-2">
            {deep.adaptations.map((a, i) => (
              <div key={i} className="bg-background/60 border border-border/60 rounded-md p-2 text-xs space-y-1">
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="font-medium text-foreground">
                    {format(parseISO(a.workout_date), "EEE dd/MM", { locale: dateLocale })} — {a.new_title}
                  </span>
                  <span className="text-muted-foreground">
                    {a.new_target_distance_km != null ? `${a.new_target_distance_km}km` : ""}
                    {a.new_target_elevation_m != null ? ` · ${a.new_target_elevation_m}D+` : ""}
                    {a.new_target_duration_min != null ? ` · ${a.new_target_duration_min}min` : ""}
                  </span>
                </div>
                <div className="text-muted-foreground italic">{a.reason}</div>
              </div>
            ))}
          </div>
          <Button size="sm" className="w-full" onClick={() => onApply(deep.adaptations)} disabled={applying}>
            {applying && <Loader2 className="w-4 h-4 animate-spin" />}
            {deep.adaptations.length === 1 ? t("cal.btn.apply1") : t("cal.btn.apply", { n: deep.adaptations.length })}
          </Button>
        </div>
      ) : (
        <div className="text-xs italic text-foreground/80">{t("cal.deep.summary")}</div>
      )}
    </div>
  );
}
