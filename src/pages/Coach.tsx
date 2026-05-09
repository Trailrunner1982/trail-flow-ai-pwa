import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain,
  Sparkles,
  ThumbsUp,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Sun,
  RefreshCw,
  ClipboardCheck,
  ArrowRight,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { pt, enUS } from "date-fns/locale";
import { toast } from "sonner";
import type { Verdict, QuickFeedback, DeepFeedback } from "@/components/calendar/types";

interface FeedbackRow {
  id: string;
  feedback_date: string;
  feedback_type: string;
  decision: string;
  reasoning: string;
  context_data: any;
  created_at: string;
}

const verdictMeta: Record<Verdict, { key: string; color: string; icon: any }> = {
  great: { key: "verdict.great", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: Sparkles },
  good: { key: "verdict.good", color: "bg-primary/15 text-primary border-primary/30", icon: ThumbsUp },
  ok: { key: "verdict.ok", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: CheckCircle2 },
  poor: { key: "verdict.poor", color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: AlertTriangle },
  concern: { key: "verdict.concern", color: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertTriangle },
};

const ALL_TYPES = [
  "workout_quick",
  "workout_deep",
  "daily_recommendation",
  "daily_recommendation_applied",
  "plan_adaptation",
  "plan_adaptation_applied",
];

type Filter = "all" | "deep" | "quick" | "daily" | "adapt";

export default function CoachPage() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const dateLocale = lang === "en" ? enUS : pt;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_feedback")
      .select("*")
      .eq("user_id", user.id)
      .in("feedback_type", ALL_TYPES)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setItems((data ?? []) as FeedbackRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "deep") return items.filter((i) => i.feedback_type === "workout_deep");
    if (filter === "quick") return items.filter((i) => i.feedback_type === "workout_quick");
    if (filter === "daily") return items.filter((i) => i.feedback_type.startsWith("daily_recommendation"));
    if (filter === "adapt") return items.filter((i) => i.feedback_type.startsWith("plan_adaptation"));
    return items;
  }, [items, filter]);

  const toggle = (id: string) => {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExpanded(n);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("ai_feedback").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success(t("coach.toast.removed"));
  };

  if (loading) return <LoadingScreen />;

  const counts = {
    quick: items.filter((i) => i.feedback_type === "workout_quick").length,
    deep: items.filter((i) => i.feedback_type === "workout_deep").length,
    daily: items.filter((i) => i.feedback_type.startsWith("daily_recommendation")).length,
    adapt: items.filter((i) => i.feedback_type.startsWith("plan_adaptation")).length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" /> {t("coach.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("coach.subtitle")}</p>
      </div>

      {/* Como funciona */}
      <Card className="p-5 bg-gradient-to-br from-primary/10 via-background to-background border-primary/30 space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold">{t("coach.how.title")}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <HowItem
            icon={Sun}
            title={t("coach.how.daily.title")}
            desc={t("coach.how.daily.desc")}
          />
          <HowItem
            icon={RefreshCw}
            title={t("coach.how.adapt.title")}
            desc={t("coach.how.adapt.desc")}
          />
          <HowItem
            icon={ClipboardCheck}
            title={t("coach.how.feedback.title")}
            desc={t("coach.how.feedback.desc")}
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link to="/dashboard"><Button size="sm" variant="outline">Dashboard</Button></Link>
          <Link to="/calendar"><Button size="sm">{t("coach.how.cta")} <ArrowRight className="w-3.5 h-3.5" /></Button></Link>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={t("coach.dailyCount")} value={counts.daily} icon={Sun} />
        <StatCard label={t("coach.adaptCount")} value={counts.adapt} icon={RefreshCw} />
        <StatCard label={t("coach.quickAnalyses")} value={counts.quick} icon={Sparkles} />
        <StatCard label={t("coach.deepAnalyses")} value={counts.deep} icon={Brain} />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">{t("coach.tab.all")}</TabsTrigger>
          <TabsTrigger value="daily">{t("coach.tab.daily")}</TabsTrigger>
          <TabsTrigger value="adapt">{t("coach.tab.adapt")}</TabsTrigger>
          <TabsTrigger value="quick">{t("coach.tab.quick")}</TabsTrigger>
          <TabsTrigger value="deep">{t("coach.tab.deep")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{t("coach.empty")}</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <FeedbackItem
              key={row.id}
              row={row}
              expanded={expanded.has(row.id)}
              onToggle={() => toggle(row.id)}
              onDelete={() => remove(row.id)}
              dateLocale={dateLocale}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HowItem({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-primary">
        <Icon className="w-4 h-4" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function typeMeta(t: (k: string) => string, type: string): { label: string; icon: any; color: string } {
  if (type === "workout_deep") return { label: t("coach.deep"), icon: Brain, color: "border-primary/40 text-primary" };
  if (type === "workout_quick") return { label: t("coach.quick"), icon: Sparkles, color: "border-primary/40 text-primary" };
  if (type.startsWith("daily_recommendation")) return { label: t("coach.daily"), icon: Sun, color: "border-amber-500/40 text-amber-500" };
  if (type.startsWith("plan_adaptation")) return { label: type.endsWith("applied") ? t("coach.adaptApplied") : t("coach.adapt"), icon: RefreshCw, color: "border-emerald-500/40 text-emerald-500" };
  return { label: type, icon: Brain, color: "" };
}

function FeedbackItem({
  row,
  expanded,
  onToggle,
  onDelete,
  dateLocale,
}: {
  row: FeedbackRow;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  dateLocale: typeof pt;
}) {
  const { t } = useLanguage();
  const isWorkout = row.feedback_type === "workout_deep" || row.feedback_type === "workout_quick";
  const isDeep = row.feedback_type === "workout_deep";
  const result = isWorkout ? (row.context_data?.result as QuickFeedback | DeepFeedback | undefined) : undefined;
  const verdict = (result?.verdict ?? "ok") as Verdict;
  const vMeta = verdictMeta[verdict] ?? verdictMeta.ok;
  const tMeta = typeMeta(t, row.feedback_type);
  const TypeIcon = tMeta.icon;
  const planned = row.context_data?.planned;
  const executed = row.context_data?.executed;
  const adaptations = isDeep ? (result as DeepFeedback)?.adaptations ?? [] : (row.context_data?.adaptations ?? []);

  return (
    <Card className="p-4 border border-border/60">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-[10px]">
                {format(parseISO(row.feedback_date), "EEE dd MMM yyyy", { locale: dateLocale })}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${tMeta.color}`}>
                <TypeIcon className="w-3 h-3 mr-1" /> {tMeta.label}
              </Badge>
              {isWorkout && (
                <Badge variant="outline" className={`text-[10px] ${vMeta.color}`}>
                  {t(vMeta.key)}
                </Badge>
              )}
              {adaptations.length > 0 && (
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                  {t(adaptations.length === 1 ? "coach.adaptation" : "coach.adaptations", { n: adaptations.length })}
                </Badge>
              )}
            </div>
            {planned?.title && (
              <div className="text-sm font-medium truncate">{planned.title}</div>
            )}
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {row.reasoning || row.decision}
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border/40 space-y-3 text-sm">
          {isWorkout && result ? (
            isDeep ? (
              <p className="leading-relaxed">{(result as DeepFeedback).summary}</p>
            ) : (
              <p className="font-medium">{(result as QuickFeedback).headline}</p>
            )
          ) : (
            <p className="leading-relaxed whitespace-pre-wrap">{row.reasoning || row.decision}</p>
          )}

          {isWorkout && planned && executed && (
            <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded-md p-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("coach.planned")}</div>
                <div>{planned.target_distance_km ?? "—"}km · {planned.target_elevation_m ?? "—"}D+ · {planned.target_duration_min ?? "—"}min</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("coach.executed")}</div>
                <div>{executed.actual_distance_km ?? "—"}km · {executed.actual_elevation_m ?? "—"}D+ · {executed.actual_duration_min ?? "—"}min</div>
                {executed.rpe != null && <div className="mt-0.5">RPE {executed.rpe}/10</div>}
              </div>
            </div>
          )}

          {isWorkout && result && result.highlights?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t("coach.highlights")}</div>
              <ul className="text-xs space-y-1">{result.highlights.map((h, i) => <li key={i}>• {h}</li>)}</ul>
            </div>
          )}
          {isWorkout && result && result.improvements?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t("coach.improvements")}</div>
              <ul className="text-xs space-y-1">{result.improvements.map((h, i) => <li key={i}>• {h}</li>)}</ul>
            </div>
          )}

          {isWorkout && !isDeep && result && (result as QuickFeedback).next_session_tip && (
            <div className="text-xs italic text-muted-foreground border-t border-border/40 pt-2">
              💡 {(result as QuickFeedback).next_session_tip}
            </div>
          )}

          {adaptations.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("coach.adaptationsProposed")}</div>
              {adaptations.map((a: any, i: number) => (
                <div key={i} className="bg-background/60 border border-border/60 rounded-md p-2 text-xs">
                  <div className="font-medium">
                    {a.workout_date ? format(parseISO(a.workout_date), "EEE dd/MM", { locale: dateLocale }) : ""} {a.new_title ? `— ${a.new_title}` : ""}
                  </div>
                  {a.reason && <div className="text-muted-foreground italic mt-0.5">{a.reason}</div>}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="w-3 h-3" /> {t("common.remove")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
