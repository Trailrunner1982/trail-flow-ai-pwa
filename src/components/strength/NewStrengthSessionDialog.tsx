import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { SESSION_TEMPLATES, type SessionTemplate } from "@/lib/strengthTemplates";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate?: string;
  onCreated: () => void;
}

export function NewStrengthSessionDialog({ open, onOpenChange, defaultDate, onCreated }: Props) {
  const { t } = useLanguage();
  const { userId, canWrite } = useEffectiveUser();
  const [templateId, setTemplateId] = useState<string>(SESSION_TEMPLATES[0].id);
  const [date, setDate] = useState(defaultDate ?? format(new Date(), "yyyy-MM-dd"));
  const [phase, setPhase] = useState<string>("base");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDate(defaultDate ?? format(new Date(), "yyyy-MM-dd"));
  }, [open, defaultDate]);

  const template: SessionTemplate = SESSION_TEMPLATES.find((t) => t.id === templateId)!;

  const handleCreate = async () => {
    if (!userId) return;
    if (!canWrite) return toast.error(t("cal.reschedule.readOnly"));
    setSaving(true);
    try {
      // Pre-fetch exercise IDs by name
      const names = template.exercises.map((e) => e.name);
      const { data: lib } = await supabase
        .from("strength_exercises")
        .select("id, name")
        .in("name", names);
      const byName = new Map<string, string>((lib ?? []).map((x: any) => [x.name, x.id]));

      const { data: session, error } = await supabase
        .from("strength_sessions")
        .insert({
          user_id: userId,
          session_date: date,
          session_type: template.type,
          phase: phase as any,
          title: template.title,
          notes: template.description,
          duration_min: template.duration_min,
        })
        .select()
        .single();
      if (error) throw error;

      const rows = template.exercises.map((ex, i) => ({
        session_id: session.id,
        exercise_id: byName.get(ex.name) ?? null,
        display_order: i,
        sets: ex.sets,
        reps: ex.reps,
        rest_sec: ex.rest_sec,
        notes: ex.notes ?? null,
      }));
      const { error: insErr } = await supabase.from("strength_session_exercises").insert(rows);
      if (insErr) throw insErr;

      toast.success(t("strength.session.created"));
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" /> {t("strength.new.title")}
          </DialogTitle>
          <DialogDescription>{t("strength.new.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("strength.new.date")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t("strength.new.phase")}</Label>
            <Select value={phase} onValueChange={setPhase}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transition">Transition</SelectItem>
                <SelectItem value="base">Base</SelectItem>
                <SelectItem value="build">Build</SelectItem>
                <SelectItem value="specific">Specific</SelectItem>
                <SelectItem value="taper">Taper</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t("strength.new.template")}</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SESSION_TEMPLATES.filter((tpl) => tpl.phase.includes(phase as any)).map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>{tpl.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">{template.duration_min} min</Badge>
              <Badge variant="outline">{template.exercises.length} {t("strength.new.exercises")}</Badge>
            </div>
            <p className="text-muted-foreground">{template.description}</p>
            <ul className="space-y-0.5">
              {template.exercises.map((ex) => (
                <li key={ex.name} className="font-mono text-[11px]">
                  • {ex.name} — {ex.sets}×{ex.reps}
                </li>
              ))}
            </ul>
          </div>

          <Button onClick={handleCreate} disabled={saving} className="w-full">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("strength.new.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
