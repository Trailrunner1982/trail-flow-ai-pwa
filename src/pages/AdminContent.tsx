import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, FileText, Video, Map as MapIcon, ExternalLink } from "lucide-react";
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

export default function AdminContent() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "", description: "", content_type: "video" as ContentType,
    url: "", location: "", technicity: "3",
    distance_km: "", elevation_gain_m: "", tags: "",
  });
  const [gpxFile, setGpxFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("content_library").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as ContentRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reset = () => {
    setForm({ title: "", description: "", content_type: "video", url: "", location: "", technicity: "3", distance_km: "", elevation_gain_m: "", tags: "" });
    setGpxFile(null);
  };

  const submit = async () => {
    if (!user) return;
    if (!form.title.trim()) return toast.error("Título é obrigatório");
    setSaving(true);
    try {
      let storage_path: string | null = null;
      if (form.content_type === "gpx" && gpxFile) {
        const path = `${user.id}/${Date.now()}-${gpxFile.name}`;
        const { error: upErr } = await supabase.storage.from("gpx-files").upload(path, gpxFile);
        if (upErr) throw upErr;
        storage_path = path;
      }
      const { error } = await supabase.from("content_library").insert({
        created_by: user.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        content_type: form.content_type,
        url: form.url.trim() || null,
        storage_path,
        location: form.location.trim() || null,
        technicity: form.content_type === "gpx" ? Number(form.technicity) : null,
        distance_km: form.distance_km ? Number(form.distance_km) : null,
        elevation_gain_m: form.elevation_gain_m ? Number(form.elevation_gain_m) : null,
        tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : null,
      });
      if (error) throw error;
      toast.success("Conteúdo adicionado");
      reset();
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const remove = async (row: ContentRow) => {
    if (!confirm(`Apagar "${row.title}"?`)) return;
    if (row.storage_path) await supabase.storage.from("gpx-files").remove([row.storage_path]);
    const { error } = await supabase.from("content_library").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Apagado");
    load();
  };

  const downloadGpx = async (path: string) => {
    const { data, error } = await supabase.storage.from("gpx-files").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Biblioteca de Conteúdos</h1>
          <p className="text-muted-foreground text-sm mt-1">Vídeos de técnica, artigos e trilhos GPX.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Novo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Adicionar Conteúdo</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.content_type} onValueChange={(v) => setForm({ ...form, content_type: v as ContentType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="article">Artigo</SelectItem>
                    <SelectItem value="gpx">Trilho GPX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {form.content_type !== "gpx" && (
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
                </div>
              )}
              {form.content_type === "gpx" && (
                <>
                  <div className="space-y-2">
                    <Label>Ficheiro GPX</Label>
                    <Input type="file" accept=".gpx" onChange={(e) => setGpxFile(e.target.files?.[0] || null)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Localização</Label>
                      <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Tecnicidade (1-5)</Label>
                      <Select value={form.technicity} onValueChange={(v) => setForm({ ...form, technicity: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Distância (km)</Label>
                      <Input type="number" step="0.1" value={form.distance_km} onChange={(e) => setForm({ ...form, distance_km: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>D+ (m)</Label>
                      <Input type="number" value={form.elevation_gain_m} onChange={(e) => setForm({ ...form, elevation_gain_m: e.target.value })} />
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>Tags (vírgulas)</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="subidas, técnica" />
              </div>
              <Button onClick={submit} disabled={saving} className="w-full">{saving ? "A guardar..." : "Guardar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <p className="text-muted-foreground">A carregar...</p> : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Sem conteúdos ainda. Adiciona o primeiro.</Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {rows.map(r => {
            const Icon = ICONS[r.content_type];
            return (
              <Card key={r.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">{r.title}</h3>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove(r)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
                {r.description && <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>}
                <div className="flex flex-wrap gap-1 text-xs">
                  {r.location && <Badge variant="outline">{r.location}</Badge>}
                  {r.technicity && <Badge variant="outline">Tec. {r.technicity}/5</Badge>}
                  {r.distance_km && <Badge variant="outline">{r.distance_km} km</Badge>}
                  {r.elevation_gain_m && <Badge variant="outline">D+{r.elevation_gain_m}m</Badge>}
                </div>
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Abrir</a>}
                {r.storage_path && <Button size="sm" variant="outline" onClick={() => downloadGpx(r.storage_path!)}>Descarregar GPX</Button>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
