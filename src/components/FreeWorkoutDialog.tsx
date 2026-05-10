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
  { value: "trail_run", label: "Trail Running" },
  { value: "race", label: "Prova / Competicao" },
  { value: "road_run", label: "Corrida de Estrada" },
  { value: "easy_z2", label: "Corrida Easy Z2" },
  { value: "long_run", label: "Long Run" },
  { value: "tempo", label: "Tempo Run" },
  { value: "intervals", label: "Intervalos" },
  { value: "hill_repeats", label: "Subidas Repetidas" },
  { value: "vert_session", label: "Sessao de Vert" },
  { value: "strength", label: "Forca / Ginasio" },
  { value: "cycling", label: "Bike" },
  { value: "swimming", label: "Natacao" },
  { value: "hiking", label: "Caminhada" },
  { value: "yoga", label: "Yoga / Mobilidade" },
  { value: "cross_training", label: "Cross Training" },
  { value: "other", label: "Outro" },
];

// Converte "5:30" → 330 segundos
function paceInputToSec(val: string): number | null {
  if (!val) return null;
  if (val.includes(":")) {
    const [m, s] = val.split(":").map(Number);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  }
  const n = Number(val);
  return isNaN(n) ? null : n;
}

interface Props {
  userId: string;
  canWrite: boolean;
  onSaved?: () => void;
}

export function FreeWorkoutDialog({ userId, canWrite, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activity, setActivity] = useState("trail_run");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [elevation, setElevation] = useState("");
  const [paceInput, setPaceInput] = useState("");
  const [avgHr, setAvgHr] = useState("");
  const [rpe, setRpe] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDuration(""); setDistance(""); setElevation("");
    setPaceInput(""); setAvgHr(""); setRpe(""); setNotes("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setActivity("trail_run");
  };

  const handleSave = async () => {
    if (!canWrite) return toast.error("Modo Espelho — leitura apenas");
    if (!duration && !distance) return toast.error("Indica pelo menos duracao ou distancia");
    setSaving(true);
    const paceSec = paceInputToSec(paceInput);
    const { error } = await supabase.from("free_workouts").insert({
      user_id: userId,
      workout_date: date,
      activity,
      duration_min: duration ? parseInt(duration) : null,
      distance_km: distance ? parseFloat(distance) : null,
      elevation_m: elevation ? parseInt(elevation) : null,
      avg_pace_sec_per_km: paceSec,
      avg_hr: avgHr ? parseInt(avgHr) : null,
      rpe: rpe ? parseInt(rpe) : null,
      notes: notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Treino registado!");
    setOpen(false);
    reset();
    onSaved?.();
  };

  const isRun = ["trail_run", "race", "road_run", "easy_z2", "long_run", "tempo", "intervals", "hill_repeats", "vert_session"].includes(activity);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="w-4 h-4" /> Treino livre</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registar treino</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={date} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de atividade</Label>
              <Select value={activity} onValueChange={setActivity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITIES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duracao (min)</Label>
              <Input type="number" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="ex: 60" />
            </div>
            <div className="space-y-1.5">
              <Label>Distancia (km)</Label>
              <Input type="number" inputMode="decimal" step="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="ex: 12.5" />
            </div>
            <div className="space-y-1.5">
              <Label>Desnivel D+ (m)</Label>
              <Input type="number" inputMode="numeric" value={elevation} onChange={(e) => setElevation(e.target.value)} placeholder="ex: 450" />
            </div>
            <div className="space-y-1.5">
              <Label>Esforco percecionado (1-10)</Label>
              <Input type="number" min={1} max={10} value={rpe} onChange={(e) => setRpe(e.target.value)} placeholder="1-10" />
            </div>
          </div>

          {isRun && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pace medio (min/km)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="ex: 5:30"
                  value={paceInput}
                  onChange={(e) => setPaceInput(e.target.value)}
                />
                {paceInputToSec(paceInput) && (
                  <p className="text-xs text-muted-foreground">{paceInputToSec(paceInput)} seg/km</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>FC media (bpm)</Label>
                <Input type="number" inputMode="numeric" value={avgHr} onChange={(e) => setAvgHr(e.target.value)} placeholder="ex: 148" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Como te sentiste, terreno, contexto..." />
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
