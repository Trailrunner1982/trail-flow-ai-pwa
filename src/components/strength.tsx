import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dumbbell, Plus, CheckCircle2, Calendar, Search, Video } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useLanguage, getDateLocale } from "@/lib/i18n";
import { StrengthSessionDialog } from "@/components/strength/StrengthSessionDialog";
import { NewStrengthSessionDialog } from "@/components/strength/NewStrengthSessionDialog";

export default function StrengthPage() {
  const { userId } = useEffectiveUser();
  const { t, lang } = useLanguage();
  const dateLocale = getDateLocale(lang);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [{ data: s }, { data: ex }] = await Promise.all([
      supabase
        .from("strength_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("session_date", { ascending: false })
        .limit(50),
      supabase.from("strength_exercises").select("*").order("name"),
    ]);
    setSessions(s ?? []);
    setExercises(ex ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) return <LoadingScreen />;

  const upcoming = sessions.filter((s) => !s.is_completed);
  const done = sessions.filter((s) => s.is_completed);

  const filteredExercises = exercises.filter((e) => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const categories = ["all", "legs", "push", "pull", "core", "plyo", "specific", "mobility"];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-primary" /> {t("strength.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("strength.subtitle")}</p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="w-4 h-4" /> {t("strength.new.button")}
        </Button>
      </div>

      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions">
            <Calendar className="w-3.5 h-3.5 mr-1" />
            {t("strength.tab.sessions")}
          </TabsTrigger>
          <TabsTrigger value="library">
            <Dumbbell className="w-3.5 h-3.5 mr-1" />
            {t("strength.tab.library")} ({exercises.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-4">
          {sessions.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <Dumbbell className="w-10 h-10 text-muted-foreground/50 mx-auto" />
              <div className="font-medium">{t("strength.empty.title")}</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("strength.empty.desc")}
              </p>
              <Button onClick={() => setNewOpen(true)}>
                <Plus className="w-4 h-4" /> {t("strength.new.button")}
              </Button>
            </Card>
          ) : (
            <>
              {upcoming.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    {t("strength.upcoming")} ({upcoming.length})
                  </div>
                  <div className="grid gap-2">
                    {upcoming.map((s) => (
                      <SessionCard key={s.id} s={s} dateLocale={dateLocale} onOpen={() => setOpenSession(s.id)} />
                    ))}
                  </div>
                </div>
              )}
              {done.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    {t("strength.done")} ({done.length})
                  </div>
                  <div className="grid gap-2">
                    {done.map((s) => (
                      <SessionCard key={s.id} s={s} dateLocale={dateLocale} onOpen={() => setOpenSession(s.id)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="library" className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("strength.lib.search")}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {categories.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={categoryFilter === c ? "default" : "outline"}
                  onClick={() => setCategoryFilter(c)}
                >
                  {c === "all" ? t("strength.lib.all") : c}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            {filteredExercises.map((ex) => (
              <Card key={ex.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{ex.name}</div>
                  <Badge variant="outline" className="text-[10px] capitalize">{ex.category}</Badge>
                </div>
                {ex.description && <p className="text-xs text-muted-foreground">{ex.description}</p>}
                {ex.cues && (
                  <p className="text-xs italic text-foreground/70">💡 {ex.cues}</p>
                )}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {ex.equipment && (
                    <Badge variant="secondary" className="text-[9px]">{ex.equipment}</Badge>
                  )}
                  {ex.video_url && (
                    <a
                      href={ex.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <Video className="w-3 h-3" /> {t("strength.exercise.watchVideo")}
                    </a>
                  )}
                </div>
              </Card>
            ))}
            {filteredExercises.length === 0 && (
              <Card className="p-6 text-center text-sm text-muted-foreground sm:col-span-2">
                {t("strength.lib.noResults")}
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <StrengthSessionDialog
        open={!!openSession}
        onOpenChange={(o) => !o && setOpenSession(null)}
        sessionId={openSession}
        onChanged={fetchAll}
      />
      <NewStrengthSessionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={fetchAll}
      />
    </div>
  );
}

function SessionCard({ s, dateLocale, onOpen }: { s: any; dateLocale: any; onOpen: () => void }) {
  return (
    <Card
      onClick={onOpen}
      className="p-3 cursor-pointer hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{s.session_type}</Badge>
            {s.phase && <Badge variant="outline" className="text-[10px]">{s.phase}</Badge>}
            {s.is_completed && (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> RPE {s.rpe ?? "—"}
              </Badge>
            )}
          </div>
          <div className="font-medium text-sm">{s.title}</div>
          <div className="text-xs text-muted-foreground">
            {format(parseISO(s.session_date), "EEEE dd MMM", { locale: dateLocale })}
            {s.duration_min ? ` · ${s.duration_min} min` : ""}
          </div>
        </div>
      </div>
    </Card>
  );
}
