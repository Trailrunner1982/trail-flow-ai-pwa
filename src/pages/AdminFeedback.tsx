import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { MessageSquareWarning, Lightbulb, Palette, FileText, RefreshCw } from "lucide-react";

interface FeedbackRow {
  id: string;
  user_id: string;
  full_name: string | null;
  category: string;
  message: string;
  page_url: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  bug: <MessageSquareWarning className="w-3.5 h-3.5" />,
  suggestion: <Lightbulb className="w-3.5 h-3.5" />,
  ux: <Palette className="w-3.5 h-3.5" />,
  other: <FileText className="w-3.5 h-3.5" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  suggestion: "Sugestao",
  ux: "UX",
  other: "Outro",
};

export default function AdminFeedback() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const load = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const userIds = [...new Set((data || []).map((r: any) => r.user_id))];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] };

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.full_name]));

    const mapped = (data || []).map((item: any) => ({
      ...item,
      full_name: profileMap[item.user_id] ?? null,
    }));

    setRows(mapped as FeedbackRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("feedback")
      .update({ status })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Estado atualizado");
    load();
  };

  const filtered = rows.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterCategory !== "all" && r.category !== filterCategory) return false;
    return true;
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "new": return <Badge variant="outline" className="border-primary/30 text-primary">Novo</Badge>;
      case "in_progress": return <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400">Em curso</Badge>;
      case "resolved": return <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400">Resolvido</Badge>;
      case "wontfix": return <Badge variant="outline" className="border-muted text-muted-foreground">Nao aplicar</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const newCount = rows.filter(r => r.status === "new").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Feedback dos Atletas</h1>
          <p className="text-muted-foreground text-sm mt-1">Todas as mensagens, bugs e sugestoes enviados pelos atletas.</p>
        </div>
        {newCount > 0 && (
          <Badge className="bg-primary text-white text-sm px-3 py-1">
            {newCount} novo{newCount > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="suggestion">Sugestao</SelectItem>
            <SelectItem value="ux">UX</SelectItem>
            <SelectItem value="other">Outro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos estados</SelectItem>
            <SelectItem value="new">Novo</SelectItem>
            <SelectItem value="in_progress">Em curso</SelectItem>
            <SelectItem value="resolved">Resolvido</SelectItem>
            <SelectItem value="wontfix">Nao aplicar</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={load} className="ml-auto">
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Data</TableHead>
              <TableHead className="w-[100px]">Categoria</TableHead>
              <TableHead>Atleta</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead className="w-[100px]">Pagina</TableHead>
              <TableHead className="w-[140px]">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">A carregar...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {rows.length === 0 ? "Ainda nao ha feedback. Quando os atletas enviarem mensagens aparecem aqui." : "Sem feedback nestes filtros."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(parseISO(row.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {CATEGORY_ICONS[row.category] ?? CATEGORY_ICONS.other}
                      <span className="text-xs">{CATEGORY_LABELS[row.category] ?? row.category}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{row.full_name || "(sem nome)"}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{row.user_id?.slice(0, 8)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm max-w-[300px] whitespace-pre-wrap leading-relaxed">{row.message}</div>
                    {row.user_agent && (
                      <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[300px]" title={row.user_agent}>
                        {row.user_agent}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.page_url ? (
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{row.page_url}</code>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      {statusBadge(row.status)}
                      <Select value={row.status} onValueChange={(v) => updateStatus(row.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">Novo</SelectItem>
                          <SelectItem value="in_progress">Em curso</SelectItem>
                          <SelectItem value="resolved">Resolvido</SelectItem>
                          <SelectItem value="wontfix">Nao aplicar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
