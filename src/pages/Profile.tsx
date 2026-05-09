import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { calculateBMI, calculateMetabolicAge, calculateZones } from "@/lib/training";
import { fmtPace } from "@/lib/format";
import { User, Heart, Activity, Save, Loader2, Camera, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { differenceInYears } from "date-fns";
import { useLanguage } from "@/lib/i18n";

interface Profile {
  full_name: string | null;
  date_of_birth: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  max_hr: number | null;
  resting_hr: number | null;
  vo2_max: number | null;
  baseline_avg_pace_sec_per_km: number | null;
  baseline_km_per_week: number | null;
  available_run_days: number[] | null;
  available_strength_days: number[] | null;
  long_run_day: number | null;
  avatar_url: string | null;
}

export default function ProfilePage() {
  const { userId, selfId, canWrite } = useEffectiveUser();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Profile>({
    full_name: "", date_of_birth: null, weight_kg: null, height_cm: null,
    max_hr: null, resting_hr: null, vo2_max: null,
    baseline_avg_pace_sec_per_km: null, baseline_km_per_week: null,
    available_run_days: [1,2,3,4,5,6], available_strength_days: [2,4], long_run_day: 6,
    avatar_url: null,
  });

  const DAYS = [
    { v: 1, l: t("days.short.mon") }, { v: 2, l: t("days.short.tue") }, { v: 3, l: t("days.short.wed") },
    { v: 4, l: t("days.short.thu") }, { v: 5, l: t("days.short.fri") }, { v: 6, l: t("days.short.sat") }, { v: 0, l: t("days.short.sun") },
  ];

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) setForm({
      full_name: data.full_name, date_of_birth: data.date_of_birth,
      weight_kg: data.weight_kg, height_cm: data.height_cm,
      max_hr: data.max_hr, resting_hr: data.resting_hr, vo2_max: data.vo2_max,
      baseline_avg_pace_sec_per_km: data.baseline_avg_pace_sec_per_km,
      baseline_km_per_week: data.baseline_km_per_week,
      available_run_days: data.available_run_days ?? [1,2,3,4,5,6],
      available_strength_days: data.available_strength_days ?? [2,4],
      long_run_day: data.long_run_day ?? 6,
      avatar_url: (data as any).avatar_url ?? null,
    });
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const num = (v: any) => (v === "" || v == null ? null : Number(v));

  const save = async () => {
    if (!userId) return;
    if (!canWrite) return toast.error(t("common.readonly"));
    setSaving(true);
    const bmi = form.weight_kg && form.height_cm ? calculateBMI(form.weight_kg, form.height_cm) : null;
    const age = form.date_of_birth ? differenceInYears(new Date(), new Date(form.date_of_birth)) : null;
    const metabolic_age = age != null ? calculateMetabolicAge(age, form.vo2_max, bmi) : null;
    // bmi é gerado automaticamente pela base de dados — NÃO enviar no update
    const { error } = await supabase.from("profiles").update({
      ...form, metabolic_age,
    }).eq("id", userId);

    if (form.max_hr && form.resting_hr && form.baseline_avg_pace_sec_per_km) {
      const z = calculateZones(form.max_hr, form.resting_hr, form.baseline_avg_pace_sec_per_km);
      await supabase.from("training_zones").upsert({
        user_id: userId,
        z1_hr_min: z.z1.hr_min, z1_hr_max: z.z1.hr_max, z1_pace_sec: z.z1.pace_sec_per_km,
        z2_hr_min: z.z2.hr_min, z2_hr_max: z.z2.hr_max, z2_pace_sec: z.z2.pace_sec_per_km,
        z3_hr_min: z.z3.hr_min, z3_hr_max: z.z3.hr_max, z3_pace_sec: z.z3.pace_sec_per_km,
        z4_hr_min: z.z4.hr_min, z4_hr_max: z.z4.hr_max, z4_pace_sec: z.z4.pace_sec_per_km,
        z5_hr_min: z.z5.hr_min, z5_hr_max: z.z5.hr_max, z5_pace_sec: z.z5.pace_sec_per_km,
      }, { onConflict: "user_id" });
    }

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("profile.toast.updated"));
    load();
  };

  const handleAvatarUpload = async (file: File) => {
    if (!selfId) return;
    if (!canWrite) return toast.error(t("common.readonly"));
    if (file.size > 5 * 1024 * 1024) return toast.error(t("profile.toast.imgTooBig"));
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${selfId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url } as any).eq("id", selfId);
      if (updErr) throw updErr;
      setForm((f) => ({ ...f, avatar_url: url }));
      toast.success(t("profile.toast.photoUpdated"));
    } catch (e: any) {
      toast.error(e?.message ?? t("profile.toast.imgErr"));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!canWrite) return toast.error(t("common.readonly"));
    if (pwd.length < 6) return toast.error(t("profile.toast.pwdMin"));
    if (pwd !== pwd2) return toast.error(t("profile.toast.pwdMismatch"));
    setPwdSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setPwdSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("profile.toast.pwdUpdated"));
    setPwd(""); setPwd2("");
  };

  if (loading) return <LoadingScreen />;

  const bmi = form.weight_kg && form.height_cm ? calculateBMI(form.weight_kg, form.height_cm) : null;
  const age = form.date_of_birth ? differenceInYears(new Date(), new Date(form.date_of_birth)) : null;
  const metabolicAge = age != null ? calculateMetabolicAge(age, form.vo2_max, bmi) : null;
  const zones = (form.max_hr && form.resting_hr && form.baseline_avg_pace_sec_per_km)
    ? calculateZones(form.max_hr, form.resting_hr, form.baseline_avg_pace_sec_per_km) : null;

  const initials = (form.full_name ?? "").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "🏃";

  const bmiLabel = (b: number) => {
    if (b < 18.5) return t("profile.bmi.below");
    if (b < 25) return t("profile.bmi.healthy");
    if (b < 30) return t("profile.bmi.high");
    return t("profile.bmi.obese");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <User className="w-6 h-6 text-primary" /> {t("profile.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("profile.subtitle")}</p>
      </div>

      {/* Foto de perfil */}
      <Card className="p-5 flex items-center gap-4 flex-wrap">
        <Avatar className="w-20 h-20 border border-border">
          {form.avatar_url ? <AvatarImage src={form.avatar_url} alt="avatar" /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-[180px]">
          <div className="font-medium">{form.full_name || t("profile.noName")}</div>
          <p className="text-xs text-muted-foreground">{t("profile.photoHint")}</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = ""; }}
        />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar || !canWrite}>
          {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {form.avatar_url ? t("profile.changePhoto") : t("profile.uploadPhoto")}
        </Button>
      </Card>

      {/* Métricas calculadas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label={t("profile.metric.bmi")} value={bmi != null ? bmi.toFixed(1) : "—"} hint={bmi ? bmiLabel(bmi) : t("profile.metric.bmiUnit")} />
        <MetricCard label={t("profile.metric.age")} value={age != null ? `${age}` : "—"} hint={t("profile.metric.ageUnit")} />
        <MetricCard label={t("profile.metric.metabolicAge")} value={metabolicAge != null ? `${metabolicAge}` : "—"} hint={t("profile.metric.metabolicAgeHint")} />
        <MetricCard label={t("profile.metric.vo2")} value={form.vo2_max != null ? form.vo2_max.toFixed(1) : "—"} hint={t("profile.metric.vo2Unit")} />
      </div>

      {/* Form */}
      <Card className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("auth.fullName")}>
            <Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label={t("races.dateFormat").replace("Data", t("profile.birthDate"))}>
            <Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value || null })} />
          </Field>
          <Field label={t("profile.weight")}>
            <Input type="number" step="0.1" inputMode="decimal" value={form.weight_kg ?? ""} onChange={(e) => setForm({ ...form, weight_kg: num(e.target.value) })} />
          </Field>
          <Field label={t("profile.height")}>
            <Input type="number" inputMode="numeric" value={form.height_cm ?? ""} onChange={(e) => setForm({ ...form, height_cm: num(e.target.value) })} />
          </Field>
        </div>

        <div className="border-t border-border/40 pt-4">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <Heart className="w-3.5 h-3.5 text-primary" /> {t("profile.section.hr")}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label={t("profile.field.maxHr")}>
              <Input type="number" inputMode="numeric" value={form.max_hr ?? ""} onChange={(e) => setForm({ ...form, max_hr: num(e.target.value) })} />
            </Field>
            <Field label={t("profile.field.restHr")}>
              <Input type="number" inputMode="numeric" value={form.resting_hr ?? ""} onChange={(e) => setForm({ ...form, resting_hr: num(e.target.value) })} />
            </Field>
            <Field label={t("profile.field.vo2")}>
              <Input type="number" step="0.1" inputMode="decimal" value={form.vo2_max ?? ""} onChange={(e) => setForm({ ...form, vo2_max: num(e.target.value) })} />
            </Field>
          </div>
        </div>

        <div className="border-t border-border/40 pt-4">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" /> {t("profile.section.baseline")}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("profile.field.basePace")}>
              <Input type="number" inputMode="numeric" value={form.baseline_avg_pace_sec_per_km ?? ""} onChange={(e) => setForm({ ...form, baseline_avg_pace_sec_per_km: num(e.target.value) })} placeholder="ex: 330" />
            </Field>
            <Field label={t("profile.field.weeklyKm")}>
              <Input type="number" inputMode="numeric" value={form.baseline_km_per_week ?? ""} onChange={(e) => setForm({ ...form, baseline_km_per_week: num(e.target.value) })} />
            </Field>
          </div>
        </div>

        <div className="border-t border-border/40 pt-4">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" /> {t("profile.section.weekly")}
          </h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("profile.field.runDays")}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DAYS.map((d) => {
                  const active = form.available_run_days?.includes(d.v);
                  return (
                    <Button key={d.v} type="button" size="sm" variant={active ? "default" : "outline"}
                      onClick={() => {
                        const cur = form.available_run_days ?? [];
                        setForm({ ...form, available_run_days: active ? cur.filter((x) => x !== d.v) : [...cur, d.v].sort() });
                      }}>{d.l}</Button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("profile.field.strengthDays")}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DAYS.map((d) => {
                  const active = form.available_strength_days?.includes(d.v);
                  return (
                    <Button key={d.v} type="button" size="sm" variant={active ? "default" : "outline"}
                      onClick={() => {
                        const cur = form.available_strength_days ?? [];
                        setForm({ ...form, available_strength_days: active ? cur.filter((x) => x !== d.v) : [...cur, d.v].sort() });
                      }}>{d.l}</Button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("profile.field.longRunDay")}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DAYS.map((d) => (
                  <Button key={d.v} type="button" size="sm"
                    variant={form.long_run_day === d.v ? "default" : "outline"}
                    onClick={() => setForm({ ...form, long_run_day: d.v })}>{d.l}</Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t("common.save")}
        </Button>
      </Card>

      {/* Mudar password */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" /> {t("profile.changePwd")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("profile.newPwd")}>
            <Input type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder={t("profile.pwdHint")} />
          </Field>
          <Field label={t("profile.confirmPwd")}>
            <Input type="password" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
          </Field>
        </div>
        <Button onClick={handlePasswordChange} disabled={pwdSaving || !pwd} variant="outline">
          {pwdSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} {t("profile.updatePwd")}
        </Button>
      </Card>

      {/* Zonas */}
      {zones && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3">{t("profile.zones")}</h3>
          <div className="space-y-2">
            {(["z1","z2","z3","z4","z5"] as const).map((k, i) => (
              <div key={k} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm gap-2">
                <Badge variant="outline" className="border-primary/40 text-primary">Z{i+1}</Badge>
                <span>{zones[k].hr_min}–{zones[k].hr_max} bpm</span>
                <span className="font-mono">{fmtPace(zones[k].pace_sec_per_km)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">{t("profile.zonesHint")}</p>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}
