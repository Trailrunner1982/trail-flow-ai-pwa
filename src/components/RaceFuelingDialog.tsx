import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Plus, Trash2, Save, Apple, Backpack, Clock } from "lucide-react";
import { toast } from "sonner";
import { fmtDuration } from "@/lib/format";

interface GearItem {
  item: string;
  category: "mandatory" | "recommended" | "optional";
  notes?: string | null;
  checked?: boolean;
}

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

const defaultNutrition = (race: Race, baselinePaceSec?: number | null): NutritionPlan => {
  let minutes: number;
  if (race.target_time_minutes) {
    minutes = race.target_time_minutes;
  } else if (baselinePaceSec && race.distance_km) {
    const equivalentKm = race.distance_km + (race.elevation_gain_m ?? 0) / 100;
    minutes = Math.round((equivalentKm * baselinePaceSec) / 60);
  } else {
    minutes = Math.round((race.distance_km / 9) * 60);
  }

  const long = minutes >= 180;
  const veryLong = minutes >= 360;
  return {
    estimated_duration_min: minutes,
    carbs_per_hour_g: veryLong ? 90 : long ? 80 : 60,
    water_ml_per_hour: veryLong ? 700 : long ? 600 : 500,
    sodium_mg_per_hour: veryLong ? 700 : long ? 600 : 400,
    pre_race: [
      "Refeição rica em hidratos 3h antes (massas, pão, fruta)",
      "300-500ml de água com electrólitos 1h antes",
      "15-30g de hidratos rápidos 15 min antes (gel ou banana)",
    ],
    during: [
      "Começa a comer nos primeiros 20-30 min, antes de ter fome",
      `Gel ou barra a cada 30-40 min a partir dos 60 min`,
      "Pequenos goles de água de 15 em 15 min",
      ...(long ? ["Reforçar sódio nas subidas e em pontos quentes"] : []),
    ],
    post_race: [
      "Hidratos + proteína (4:1) na primeira hora",
      "Reidratar 1.5L por kg perdido",
    ],
  };
};

const defaultGear = (race: Race): GearItem[] => {
  const long = (race.target_time_minutes ?? 0) >= 180 || race.distance_km >= 30;
  const veryLong = (race.target_time_minutes ?? 0) >= 360 || race.distance_km >= 60;
  const techy = race.elevation_gain_m >= 1500;
  const items: GearItem[] = [
    { item: "Sapatilhas trail com grip adequado ao terreno", category: "mandatory" },
    { item: "Mochila de hidratação (mín. 1.5L)", category: long ? "mandatory" : "recommended" },
    { item: "Casaco impermeável/corta-vento", category: techy || long ? "mandatory" : "recommended" },
    { item: "Calças/collants impermeáveis (provas longas)", category: veryLong ? "mandatory" : "optional" },
    { item: "Manta de emergência", category: long ? "mandatory" : "optional" },
    { item: "Apito", category: long ? "mandatory" : "optional" },
    { item: "Copo dobrável (obrigatório em provas eco)", category: long ? "mandatory" : "recommended" },
    { item: "Telemóvel carregado + powerbank", category: "mandatory" },
    { item: "Frontal + pilhas extra", category: veryLong ? "mandatory" : long ? "recommended" : "optional" },
    { item: "Bastões de trail (com pontas de borracha)", category: techy ? "recommended" : "optional" },
    { item: "Boné ou buff", category: "recommended" },
    { item: "Óculos de sol", category: "recommended" },
    { item: "Protetor solar (mín. SPF30)", category: "recommended" },
    { item: "Kit primeiros socorros mínimo (pensos, anti-inflamatório)", category: long ? "mandatory" : "recommended" },
    { item: "Géis/barras suficientes + margem de 20%", category: "mandatory" },
    { item: "Cápsulas de sal ou electrólitos", category: long ? "mandatory" : "recommended" },
    { item: "Baton de lábios SPF + vaselina (anti-rozamento)", category: long ? "recommended" : "optional" },
    { item: "Meias de trail técnicas", category: "recommended" },
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
  const { user } = useAuth();
  const [nutrition, setNutrition] = useState<NutritionPlan>({});
  const [gear, setGear] = useState<GearItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [refining, setRefining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baselinePace, setBaselinePace] = useState<number | null>(null);
  const [baselineKm, setBaselineKm] = useState<number | null>(null);

  // Buscar perfil do atleta para passar ao AI
  useEffect(() => {
    if (!user || !open) return;
    supabase
      .from("profiles")
      .select("baseline_avg_pace_sec_per_km, baseline_km_per_week")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setBaselinePace(data.baseline_avg_pace_sec_per_km ?? null);
          setBaselineKm(data.baseline_km_per_week ?? null);
        }
      });
  }, [user, open]);

  useEffect(() => {
    if (!race) return;
    setNutrition(race.nutrition_plan ?? defaultNutrition(race, baselinePace));
    setGear(race.gear_checklist?.length ? race.gear_checklist : defaultGear(race));
  }, [race, baselinePace]);

  if (!race) return null;

  const catLabel = (c: GearItem["category"]) => t(`fuel.${c}`);

  const refineWithAI = async () => {
    setRefining(true);
    try {
      const { data, error } = await supabase.functions.invoke("race-fueling-ai", {
        body: {
          race,
          baseline_pace_sec_per_km: baselinePace,
          baseline_km_per_week: baselineKm,
          current: { nutrition, gear },
        },
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

  const estimatedDuration = nutrition.estimated_duration_min;
  const mandatoryCount = gear.filter(g => g.category === "mandatory").length;
  const checkedCount = gear.filter(g => g.checked).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Apple className="w-5 h-5 text-primary" /> {t("fuel.title")}
          </DialogTitle>
          <DialogDescription>
            {race.name} · {race.distance_km}km · {race.elevation_gain_m}D+
            {estimatedDuration && (
              <span className="ml-2 text-primary font-medium flex items-center gap-1 inline-flex">
                <Clock className="w-3 h-3" /> {fmtDuration(estimatedDuration)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={refineWithAI} disabled={refining}>
            {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {t("fuel.refine")}
          </Button>
        </div>

        {/* ── Nutrição ── */}
        <section className="space-y-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{t("fuel.nutrition")}</div>

          {/* Métricas principais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <NumField label={t("fuel.duration") + " (min)"} value={nutrition.estimated_duration_min}
              onChange={(v) => setNutrition({ ...nutrition, estimated_duration_min: v })} />
            <NumField label={t("fuel.carbs") + " (g/h)"} value={nutrition.carbs_per_hour_g}
              onChange={(v) => setNutrition({ ...nutrition, carbs_per_hour_g: v })} />
            <NumField label={t("fuel.water") + " (ml/h)"} value={nutrition.water_ml_per_hour}
              onChange={(v) => setNutrition({ ...nutrition, water_ml_per_hour: v })} />
            <NumField label={t("fuel.sodium") + " (mg/h)"} value={nutrition.sodium_mg_per_hour}
              onChange={(v) => setNutrition({ ...nutrition, sodium_mg_per_hour: v })} />
          </div>

          {/* Total estimado de géis/barras */}
          {estimatedDuration && nutrition.carbs_per_hour_g ? (
            <div className="rounded-lg bg-muted/30 border border-border/40 p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-foreground text-sm">Estimativa para a prova</div>
              <div>Total hidratos: ~{Math.round((estimatedDuration / 60) * (nutrition.carbs_per_hour_g ?? 0))}g</div>
              <div>Total água: ~{Math.round((estimatedDuration / 60) * (nutrition.water_ml_per_hour ?? 0))}ml</div>
              <div>Total sódio: ~{Math.round((estimatedDuration / 60) * (nutrition.sodium_mg_per_hour ?? 0))}mg</div>
              <div className="text-primary">
                ≈ {Math.ceil(((estimatedDuration / 60) * (nutrition.carbs_per_hour_g ?? 0)) / 22)} géis (22g/gel) ou equivalente
              </div>
            </div>
          ) : null}

          <ListEditor label={t("fuel.preRace")} items={nutrition.pre_race ?? []}
            onChange={(items) => setNutrition({ ...nutrition, pre_race: items })}
            addPlaceholder={t("fuel.add")} />
          <ListEditor label={t("fuel.during")} items={nutrition.during ?? []}
            onChange={(items) => setNutrition({ ...nutrition, during: items })}
            addPlaceholder={t("fuel.add")} />
          <ListEditor label={t("fuel.postRace")} items={nutrition.post_race ?? []}
            onChange={(items) => setNutrition({ ...nutrition, post_race: items })}
            addPlaceholder={t("fuel.add")} />
        </section>

        {/* ── Equipamento ── */}
        <section className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Backpack className="w-3.5 h-3.5" /> {t("fuel.gear")}
            </div>
            {gear.length > 0 && (
              <span className="text-[10px] normal-case">
                {checkedCount}/{gear.length} preparados
                {checkedCount >= mandatoryCount && mandatoryCount > 0 && (
                  <span className="text-emerald-400 ml-1">· Obrigatórios ✓</span>
                )}
              </span>
            )}
          </div>

          {/* Agrupado por categoria */}
          {(["mandatory", "recommended", "optional"] as GearItem["category"][]).map(cat => {
            const items = gear.filter(g => g.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-2">{catLabel(cat)}</div>
                {items.map((g) => {
                  const idx = gear.indexOf(g);
                  return (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                      <Checkbox
                        checked={!!g.checked}
                        onCheckedChange={(c) => {
                          const copy = [...gear];
                          copy[idx] = { ...g, checked: !!c };
                          setGear(copy);
                        }}
                      />
                      <span className={`flex-1 text-sm ${g.checked ? "line-through text-muted-foreground" : ""}`}>
                        {g.item}
                      </span>
                      {g.notes && (
                        <span className="text-[10px] text-muted-foreground italic hidden sm:block">{g.notes}</span>
                      )}
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${catClass[g.category]}`}>
                        {catLabel(g.category)}
                      </Badge>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                        onClick={() => setGear(gear.filter((_, j) => j !== idx))}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Adicionar item */}
          <div className="flex gap-2 mt-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder={t("fuel.addItem")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItem.trim()) {
                  setGear([...gear, { item: newItem.trim(), category: "recommended", checked: false }]);
                  setNewItem("");
                }
              }}
            />
            <Button size="icon" variant="outline"
              onClick={() => {
                if (newItem.trim()) {
                  setGear([...gear, { item: newItem.trim(), category: "recommended", checked: false }]);
                  setNewItem("");
                }
              }}>
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

function NumField({ label, value, onChange }: {
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
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

function ListEditor({ label, items, onChange, addPlaceholder }: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
  addPlaceholder: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="text-primary mt-0.5 shrink-0">→</span>
            <span className="flex-1 leading-relaxed">{it}</span>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
              onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={addPlaceholder} className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onChange([...items, draft.trim()]);
              setDraft("");
            }
          }}
        />
        <Button size="icon" variant="ghost" className="h-8 w-8"
          onClick={() => {
            if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(""); }
          }}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
