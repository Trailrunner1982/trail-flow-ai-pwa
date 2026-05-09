import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Dumbbell, Video, Info } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string | null;
  onChanged: () => void;
}

interface SessionExercise {
  id: string;
  display_order: number;
  sets: number | null;
  reps: string | null;
  rest_sec: number | null;
  load_kg: number | null;
  notes: string | null;
  is_done: boolean;
  exercise: {
    id: string;
    name: string;
    description: string | null;
    cues: string | null;
    video_url: string | null;
    target_muscles: string[] | null;
    equipment: string | null;
  } | null;
}

export function StrengthSessionDialog({ open, onOpenChange, sessionId, onChanged }: Props) {
  const { t } = useLanguage();
  const [session, setSession] = useState<any>(null);
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [rpe, setRpe] = useState(6);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !sessionId) return;
    (async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("strength_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      const { data: ex } = await supabase
        .from("strength_session_exercises")
        .select("*, exercise:strength_exercises(*)")
        .eq("session_id", sessionId)
        .order("display_order");
      setSession(s);
      setExercises((ex ?? []) as any);
      setRpe(s?.rpe ?? 6);
      setLoading(false);
    })();
  }, [open, sessionId]);

  const toggleDone = async (id: string, current: boolean) => {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, is_done: !current } : e)));
    await supabase.from("strength_session_exercises").update({ is_done: !current }).eq("id", id);
  };

  const handleComplete = async () => {
    if (!sessionId) return;
    setSaving(true);
    try {
      await supabase
        .from("strength_sessions")
        .update({ is_completed: true, completed_at: new Date().toISOString(), rpe })
        .eq("id", sessionId);
      toast.success(t("strength.session.completed"));
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {loading || !session ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">{session.session_type}</Badge>
                {session.phase && <Badge variant="outline" className="text-[10px]">{session.phase}</Badge>}
                {session.is_completed && (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {t("strength.session.completedTag")}
                  </Badge>
                )}
              </div>
              <DialogTitle className="flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-primary" />
                {session.title}
              </DialogTitle>
              {session.notes && <DialogDescription>{session.notes}</DialogDescription>}
            </DialogHeader>

            <div className="space-y-3">
              {exercises.map((ex, idx) => (
                <div key={ex.id} className="border border-border/60 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={ex.is_done}
                      onCheckedChange={() => toggleDone(ex.id, ex.is_done)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="font-medium text-sm">
                          {idx + 1}. {ex.exercise?.name ?? "—"}
                        </div>
                        <div className="text-xs text-primary font-mono">
                          {ex.sets}×{ex.reps}
                          {ex.rest_sec ? ` · ${ex.rest_sec}s` : ""}
                          {ex.load_kg ? ` · ${ex.load_kg}kg` : ""}
                        </div>
                      </div>
                      {ex.exercise?.cues && (
                        <p className="text-xs text-muted-foreground mt-1 flex gap-1">
                          <Info className="w-3 h-3 mt-0.5 shrink-0" />
                          {ex.exercise.cues}
                        </p>
                      )}
                      {ex.notes && <p className="text-xs italic mt-1">{ex.notes}</p>}
                      {ex.exercise?.video_url && (
                        <a
                          href={ex.exercise.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline"
                        >
                          <Video className="w-3 h-3" /> {t("strength.exercise.watchVideo")}
                        </a>
                      )}
                      {ex.exercise?.target_muscles && ex.exercise.target_muscles.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {ex.exercise.target_muscles.map((m) => (
                            <span key={m} className="text-[9px] uppercase tracking-wide text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!session.is_completed && (
              <div className="space-y-3 border-t border-border/40 pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">RPE</Label>
                    <Badge variant="secondary">{rpe} / 10</Badge>
                  </div>
                  <Slider value={[rpe]} min={1} max={10} step={1} onValueChange={(v) => setRpe(v[0])} />
                </div>
                <Button onClick={handleComplete} disabled={saving} className="w-full">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <CheckCircle2 className="w-4 h-4" />
                  {t("strength.session.markComplete")}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
