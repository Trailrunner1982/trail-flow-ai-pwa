import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useRole";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generatePlan, type TerrainProfile } from "@/lib/planner";
import { CalendarView } from "@/components/calendar/CalendarView";
import type {
  AdaptationProposal,
  CalendarCompletedWorkout,
  CalendarPlannedWorkout,
  CalendarStorage,
} from "@/components/calendar/types";
import { FlaskConical, Mountain } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

export default function AdminSimulator() {
  const { isAdmin, loading } = useIsAdmin();

  const [form, setForm] = useState({
    athleteName: "Atleta Teste",
    baselineKmPerWeek: 40,
    baselinePaceMinPerKm: 5.5,
    raceName: "Prova Simulada",
    raceDate: format(new Date(Date.now() + 1000 * 60 * 60 * 24 * 84), "yyyy-MM-dd"),
    raceDistanceKm: 42,
    raceElevationM: 2000,
    terrainProfile: "mixed" as TerrainProfile,
  });

  const [planned, setPlanned] = useState<CalendarPlannedWorkout[]>([]);
  const [completed, setCompleted] = useState<CalendarCompletedWorkout[]>([]);

  const grouped = useMemo(() => {
    const map = new Map<number, CalendarPlannedWorkout[]>();
    planned.forEach((w) => {
      const k = w.week_number ?? 0;
      const arr = map.get(k) ?? [];
      arr.push(w);
      map.set(k, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [planned]);

  // In-memory storage: gives planned workouts a synthetic id so updates work.
  const storage: CalendarStorage = useMemo(() => ({
    saveCompleted: async (plannedWO, data) => {
      const newRecord: CalendarCompletedWorkout = {
        id: `mem-${plannedWO.id ?? plannedWO.workout_date}-${Date.now()}`,
        workout_date: plannedWO.workout_date,
        planned_workout_id: plannedWO.id ?? null,
        actual_distance_km: data.actual_distance_km,
        actual_elevation_m: data.actual_elevation_m,
        actual_duration_min: data.actual_duration_min,
        actual_avg_pace_sec_per_km: data.actual_avg_pace_sec_per_km,
        rpe: data.rpe,
        notes: data.notes,
      };
      setCompleted((prev) => {
        const filtered = prev.filter(
          (x) =>
            !(plannedWO.id && x.planned_workout_id === plannedWO.id) &&
            !(!plannedWO.id && x.workout_date === plannedWO.workout_date),
        );
        return [...filtered, newRecord];
      });
      return newRecord;
    },
    applyAdaptations: async (adaptations: AdaptationProposal[]) => {
      setPlanned((prev) =>
        prev.map((p) => {
          const a = adaptations.find((x) => x.workout_date === p.workout_date);
          if (!a) return p;
          return {
            ...p,
            title: a.new_title,
            target_distance_km: a.new_target_distance_km ?? p.target_distance_km,
            target_elevation_m: a.new_target_elevation_m ?? p.target_elevation_m,
            target_duration_min: a.new_target_duration_min ?? p.target_duration_min,
            description: `↻ Readaptado pelo Treinador AI: ${a.reason}`,
          };
        }),
      );
    },
  }), []);

  if (loading) return <LoadingScreen />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const handleGenerate = () => {
    const result = generatePlan({
      startDate: new Date(),
      raceDate: parseISO(form.raceDate),
      raceDistanceKm: Number(form.raceDistanceKm),
      raceElevationM: Number(form.raceElevationM),
      terrainProfile: form.terrainProfile,
      baselineKmPerWeek: Number(form.baselineKmPerWeek),
      baselineAvgPaceSecPerKm: Math.round(Number(form.baselinePaceMinPerKm) * 60),
    });
    // Add synthetic ids so adaptations and completed-tracking work in memory.
    const withIds: CalendarPlannedWorkout[] = result.map((w, i) => ({
      ...w,
      id: `mem-${i}-${w.workout_date}`,
    }));
    setPlanned(withIds);
    setCompleted([]);
    toast.success(`Plano gerado: ${withIds.length} treinos`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Simulador Admin</h1>
          <p className="text-sm text-muted-foreground">
            Gera planos para atletas fictícios, regista treinos simulados e testa o Treinador AI — apenas em memória.
          </p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Mountain className="w-4 h-4" /> Parâmetros</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome do atleta">
            <Input value={form.athleteName} onChange={(e) => setForm({ ...form, athleteName: e.target.value })} />
          </Field>
          <Field label="Km/semana base">
            <Input type="number" value={form.baselineKmPerWeek} onChange={(e) => setForm({ ...form, baselineKmPerWeek: Number(e.target.value) })} />
          </Field>
          <Field label="Pace base (min/km)">
            <Input type="number" step="0.1" value={form.baselinePaceMinPerKm} onChange={(e) => setForm({ ...form, baselinePaceMinPerKm: Number(e.target.value) })} />
          </Field>
          <Field label="Nome da prova">
            <Input value={form.raceName} onChange={(e) => setForm({ ...form, raceName: e.target.value })} />
          </Field>
          <Field label="Data da prova">
            <Input type="date" value={form.raceDate} onChange={(e) => setForm({ ...form, raceDate: e.target.value })} />
          </Field>
          <Field label="Distância (km)">
            <Input type="number" value={form.raceDistanceKm} onChange={(e) => setForm({ ...form, raceDistanceKm: Number(e.target.value) })} />
          </Field>
          <Field label="D+ (m)">
            <Input type="number" value={form.raceElevationM} onChange={(e) => setForm({ ...form, raceElevationM: Number(e.target.value) })} />
          </Field>
          <Field label="Perfil de terreno">
            <Select value={form.terrainProfile} onValueChange={(v) => setForm({ ...form, terrainProfile: v as TerrainProfile })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rolling">Ondulado</SelectItem>
                <SelectItem value="big_climbs">Grandes subidas</SelectItem>
                <SelectItem value="sustained">Subida sustentada</SelectItem>
                <SelectItem value="mixed">Misto</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Button onClick={handleGenerate} className="w-full sm:w-auto">Gerar plano</Button>
      </Card>

      {planned.length > 0 && (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h2 className="font-semibold">Calendário interativo (em memória)</h2>
              <div className="flex gap-2 text-xs">
                <Badge variant="secondary">{planned.length} treinos</Badge>
                <Badge variant="secondary">{grouped.length} semanas</Badge>
                <Badge variant="outline">{completed.length} simulados</Badge>
              </div>
            </div>
            <CalendarView planned={planned} completed={completed} storage={storage} />
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
