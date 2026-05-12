import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Video, Map as MapIcon, ExternalLink, Search, Download, BookOpen } from "lucide-react";
import { toast } from "sonner";

type ContentType = "video" | "article" | "gpx";

interface ContentRow {
  id: string;
  title: string;
  description: string | null;
  content_type: ContentType;
  url: string | null;
  storage_path: string | null;
  technicity: number | null;
  location: string | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
  tags: string[] | null;
  created_at: string;
}

const ICONS: Record<ContentType, any> = { video: Video, article: FileText, gpx: MapIcon };
const TYPE_LABELS: Record<ContentType, string> = { video: "Vídeo", article: "Artigo", gpx: "Trilho GPX" };

export default function LibraryPage() {
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  useEffect(() => {
    supabase
      .from("content_library")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRows((data as ContentRow[]) || []);
        setLoading(false);
      });
  }, []);

  const downloadGpx = async (path: string) => {
    const { data, error } = await supabase.storage.from("gpx-files").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const filtered = rows.filter((r) => {
    const matchTab = tab === "all" || r.content_type === tab;
    const matchSearch = !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase()) ||
      r.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
    return matchTab && matchSearch;
  });

  const counts = {
    all: rows.length,
    video: rows.filter(r => r.content_type === "video").length,
    article: rows.filter(r => r.content_type === "article").length,
    gpx: rows.filter(r => r.content_type === "gpx").length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" /> Biblioteca
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vídeos de técnica, artigos e trilhos GPX partilhados pelo teu treinador.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Todos ({counts.all})</TabsTrigger>
          <TabsTrigger value="video">
            <Video className="w-3.5 h-3.5 mr-1" /> Vídeos ({counts.video})
          </TabsTrigger>
          <TabsTrigger value="article">
            <FileText className="w-3.5 h-3.5 mr-1" /> Artigos ({counts.article})
          </TabsTrigger>
          <TabsTrigger value="gpx">
            <MapIcon className="w-3.5 h-3.5 mr-1" /> Trilhos ({counts.gpx})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <p className="text-muted-foreground text-sm">A carregar...</p>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              {rows.length === 0
                ? "O teu treinador ainda não adicionou conteúdos."
                : "Nenhum resultado encontrado."}
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((r) => {
                const Icon = ICONS[r.content_type];
                return (
                  <Card key={r.id} className="p-4 space-y-3 hover:border-primary/40 transition-colors">
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm leading-tight">{r.title}</h3>
                        <Badge variant="outline" className="text-[10px] mt-1">
                          {TYPE_LABELS[r.content_type]}
                        </Badge>
                      </div>
                    </div>

                    {r.description && (
                      <p className="text-xs text-muted-foreground line-clamp-3">{r.description}</p>
                    )}

                    {r.content_type === "gpx" && (
                      <div className="flex flex-wrap gap-1">
                        {r.location && <Badge variant="outline" className="text-xs">{r.location}</Badge>}
                        {r.technicity && <Badge variant="outline" className="text-xs">Tec. {r.technicity}/5</Badge>}
                        {r.distance_km && <Badge variant="outline" className="text-xs">{r.distance_km} km</Badge>}
                        {r.elevation_gain_m && <Badge variant="outline" className="text-xs">D+{r.elevation_gain_m}m</Badge>}
                      </div>
                    )}

                    {r.tags && r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {r.tags.map((tag) => (
                          <span key={tag} className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="pt-1">
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="w-full gap-2">
                            <ExternalLink className="w-3.5 h-3.5" />
                            {r.content_type === "video" ? "Ver vídeo" : "Ler artigo"}
                          </Button>
                        </a>
                      )}
                      {r.storage_path && (
                        <Button size="sm" variant="outline" className="w-full gap-2"
                          onClick={() => downloadGpx(r.storage_path!)}>
                          <Download className="w-3.5 h-3.5" /> Descarregar GPX
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
