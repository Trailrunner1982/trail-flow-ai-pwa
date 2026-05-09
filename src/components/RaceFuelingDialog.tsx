import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Plus, Trash2, Save, Apple, Backpack } from "lucide-react";
import { toast } from "sonner";

interface GearItem { item: string; category: "mandatory" | "recommended" | "optional"; notes?: string | null; checked?: boolean }
interface NutritionPlan {
  estimated_duration_min?: number;
  carbs_per_hour_g?: number;
  water_ml_per_hour?: number;
  sodium_mg_per_hour?: number;
  pre_race?: string[];
  during?: string[];
  post_race?: string[];
}

interface Race {
  id: string;
  name: string;
  distance_km: number;
  elevation_gain_m: number;
  terrain_profile: string;
  target_time_minutes: number | null;
  nutrition_plan?: NutritionPlan | null;
  gear_checklist?: GearItem[] | null;
}

const defaultNutrition = (race: Race): NutritionPlan => {
  const minutes = race.target_time_minutes ?? Math.round((race.distance_km / 9) * 60);
  const long = minutes >= 180;
  return {
    estimated_duration_min: minutes,
    carbs_per_hour_g: long ? 80 : 60,
    water_ml_per_hour: long ? 600 : 500,
    sodium_mg_per_hour: long ? 600 : 400,
    pre_race: [
      "Refeição rica em hidratos 3h antes (massas, pão, fruta)",
      "300-500ml de água com electrólitos 1h antes",
    ],
    during: [
      "Gel/barra a cada 30-40 min a partir dos 60 min",
      "Pequenos goles de água de 15 em 15 min",
      "Reforçar sódio nos pontos quentes/subidas",
    ],
    post_race: [
      "Hidratos + proteína (4:1) na primeira hora",
      "Reidratar 1.5L por kg perdido",
    ],
  };
};

const defaultGear = (race: Race): GearItem[] => {
  const long = (race.target_time_minutes ?? 0) >= 180 || race.distance_km >= 30;
  const techy = race.elevation_gain_m >= 1500;
  const items: GearItem[] = [
    { item: "Sapatilhas trail", category: "mandatory" },
    { item: "Mochila de hidratação", category: long ? "mandatory" : "recommended" },
    { item: "Casaco corta-vento impermeável", category: techy || long ? "mandatory" : "recommended" },
    { item: "Manta térmica", category: long ? "mandatory" : "optional" },
    { item: "Apito", category: long ? "mandatory" : "optional" },
    { item: "Telemóvel carregado", category: "mandatory" },
    { item: "Frontal + pilhas (provas longas/nocturnas)", category: long ? "recommended" : "optional" },
    { item: "Bastões", category: techy ? "recommended" : "optional" },
    { item: "Boné/buff", category: "recommended" },
    { item: "Óculos de sol", category: "recommended" },
    { item: "Protetor solar", category: "recommended" },
    { item: "Géis e barras (suficientes para a duração)", category: "mandatory" },
  ];
  return items.map((g) => ({ ...g, checked: false }));
};

const catClass: Record<GearItem["category"], string> = {
  mandatory: "bg-destructive/15 text-destructive border-destructive/40",
  recommended: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40",
  optional: "bg-muted text-muted-foreground",
};

export function RaceFuelingDialog({
  race, open, onOpenChange, onSaved,
}: {
  race: Race | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const { t } = useLanguage();
  const [nutrition, setNutrition] = useState<NutritionPlan>({});
  const [gear, setGear] = useState<GearItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [refining, setRefining] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!race) return;
    setNutrition(race.nutrition_plan ?? defaultNutrition(race));
    setGear(race.gear_checklist?.length ? race.gear_checklist : defaultGear(race));
  }, [race]);

  if (!race) return null;

  const catLabel = (c: GearItem["category"]) => t(`fuel.${c}`);

  const refineWithAI = async () => {
    setRefining(true);
    try {
      const { data, error } = await supabase.functions.invoke("race-fueling-ai", {
        body: { race, current: { nutrition, gear } },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const r = (data as any).result;
      setNutrition({
        estimated_duration_min: r.estimated_duration_min,
        carbs_per_hour_g: r.carbs_per_hour_g,
        water_ml_per_hour: r.water_ml_per_hour,
        sodium_mg_per_hour: r.sodium_mg_per_hour,
        pre_race: r.pre_race,
        during: r.during,
        post_race: r.post_race,
      });
      setGear((r.gear_checklist ?? []).map((g: GearItem) => ({ ...g, checked: false })));
      toast.success(t("fuel.toast.refined"));
    } catch (e: any) {
      toast.error(e?.message ?? t("fuel.toast.refineErr"));
    } finally {
      setRefining(false);
    }
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("races").update({
      nutrition_plan: nutrition as any,
      gear_checklist: gear as any,
    }).eq("id", race.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("fuel.toast.saved"));
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Apple className="w-5 h-5 text-primary" /> {t("fuel.title")}
          </DialogTitle>
          <DialogDescription>{race.name} · {race.distance_km}km · {race.elevation_gain_m}D+</DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={refineWithAI} disabled={refining}>
            {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {t("fuel.refine")}
          </Button>
        </div>

        <section className="space-y-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{t("fuel.nutrition")}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <NumField label={t("fuel.duration")} value={nutrition.estimated_duration_min} onChange={(v) => setNutrition({ ...nutrition, estimated_duration_min: v })} />
            <NumField label={t("fuel.carbs")} value={nutrition.carbs_per_hour_g} onChange={(v) => setNutrition({ ...nutrition, carbs_per_hour_g: v })} />
            <NumField label={t("fuel.water")} value={nutrition.water_ml_per_hour} onChange={(v) => setNutrition({ ...nutrition, water_ml_per_hour: v })} />
            <NumField label={t("fuel.sodium")} value={nutrition.sodium_mg_per_hour} onChange={(v) => setNutrition({ ...nutrition, sodium_mg_per_hour: v })} />
          </div>
          <ListEditor label={t("fuel.preRace")} items={nutrition.pre_race ?? []} onChange={(items) => setNutrition({ ...nutrition, pre_race: items })} addPlaceholder={t("fuel.add")} />
          <ListEditor label={t("fuel.during")} items={nutrition.during ?? []} onChange={(items) => setNutrition({ ...nutrition, during: items })} addPlaceholder={t("fuel.add")} />
          <ListEditor label={t("fuel.postRace")} items={nutrition.post_race ?? []} onChange={(items) => setNutrition({ ...nutrition, post_race: items })} addPlaceholder={t("fuel.add")} />
        </section>

        <section className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-2">
            <Backpack className="w-3.5 h-3.5" /> {t("fuel.gear")}
          </div>
          <div className="space-y-1.5">
            {gear.map((g, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                <Checkbox
                  checked={!!g.checked}
                  onCheckedChange={(c) => {
                    const copy = [...gear]; copy[i] = { ...g, checked: !!c }; setGear(copy);
                  }}
                />
                <span className={`flex-1 text-sm ${g.checked ? "line-through text-muted-foreground" : ""}`}>{g.item}</span>
                <Badge variant="outline" className={`text-[10px] ${catClass[g.category]}`}>
                  {catLabel(g.category)}
                </Badge>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setGear(gear.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder={t("fuel.addItem")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItem.trim()) {
                  setGear([...gear, { item: newItem.trim(), category: "recommended" }]);
                  setNewItem("");
                }
              }}
            />
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                if (newItem.trim()) {
                  setGear([...gear, { item: newItem.trim(), category: "recommended" }]);
                  setNewItem("");
                }
              }}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="h-8 text-sm"
      />
    </div>
  );
}

function ListEditor({ label, items, onChange, addPlaceholder }: { label: string; items: string[]; onChange: (v: string[]) => void; addPlaceholder: string }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="text-primary">→</span>
            <span className="flex-1">{it}</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={addPlaceholder}
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) { onChange([...items, draft.trim()]); setDraft(""); }
          }}
        />
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(""); } }}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
