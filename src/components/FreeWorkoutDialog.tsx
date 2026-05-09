import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const ACTIVITIES = [
  { value: "swimming", label: "Natação" },
  { value: "cycling", label: "Bike" },
  { value: "gym", label: "Ginásio" },
  { value: "hiking", label: "Caminhada" },
  { value: "yoga", label: "Yoga / Mobilidade" },
  { value: "other", label: "Outro" },
];

interface Props {
  userId: string;
  canWrite: boolean;
  onSaved?: () => void;
}

export function FreeWorkoutDialog({ userId, canWrite, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activity, setActivity] = useState("cycling");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [rpe, setRpe] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!canWrite) return toast.error("Modo Espelho — leitura apenas");
    if (!duration && !distance) return toast.error("Indica pelo menos duração ou distância");
    setSaving(true);
    const { error } = await supabase.from("free_workouts").insert({
      user_id: userId,
      workout_date: date,
      activity,
      duration_min: duration ? parseInt(duration) : null,
      distance_km: distance ? parseFloat(distance) : null,
      rpe: rpe ? parseInt(rpe) : null,
      notes: notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Treino livre registado");
    setOpen(false);
    setDuration(""); setDistance(""); setRpe(""); setNotes("");
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="w-4 h-4" /> Treino livre</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registar treino não planeado</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Atividade</Label>
              <Select value={activity} onValueChange={setActivity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITIES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duração (min)</Label>
              <Input type="number" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Distância (km)</Label>
              <Input type="number" inputMode="decimal" step="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Esforço percecionado (1-10)</Label>
              <Input type="number" min={1} max={10} value={rpe} onChange={(e) => setRpe(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Como te sentiste, terreno, contexto..." />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
