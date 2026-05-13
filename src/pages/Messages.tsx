import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Loader2, Bot } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { toast } from "sonner";

interface Message {
  id: string;
  sender_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
  is_bot: boolean;
}

const DAILY_LIMIT = 10;

export default function MessagesPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [todayCount, setTodayCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: true });

    setMessages((data ?? []) as Message[]);

    // Contar mensagens do atleta hoje
    const today = format(new Date(), "yyyy-MM-dd");
    const todayMsgs = (data ?? []).filter((m: any) =>
      m.sender_id === user.id &&
      m.created_at.startsWith(today)
    );
    setTodayCount(todayMsgs.length);

    // Marcar mensagens do bot como lidas
    const unread = (data ?? []).filter((m: any) =>
      m.recipient_id === user.id && !m.is_read
    );
    if (unread.length > 0) {
      await supabase.from("messages")
        .update({ is_read: true })
        .in("id", unread.map((m: any) => m.id));
    }

    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!user || !input.trim() || sending) return;
    if (todayCount >= DAILY_LIMIT) {
      toast.error(`Limite de ${DAILY_LIMIT} mensagens por dia atingido.`);
      return;
    }

    setSending(true);
    const body = input.trim();
    setInput("");

    try {
      // Guardar mensagem do atleta
      const { data: msgData, error: msgError } = await supabase
        .from("messages")
        .insert({
          sender_id: user.id,
          recipient_id: user.id,
          body,
          is_read: true,
          is_bot: false,
        })
        .select()
        .single();

      if (msgError) throw msgError;
      setMessages((prev) => [...prev, msgData as Message]);
      setTodayCount((c) => c + 1);

      // Buscar contexto do atleta
      const today = format(new Date(), "yyyy-MM-dd");
      const weekAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

      const [{ data: profile }, { data: bio }, { data: workouts }, { data: races }] = await Promise.all([
        supabase.from("profiles").select("full_name, baseline_km_per_week, baseline_avg_pace_sec_per_km, weight_kg, height_cm").eq("id", user.id).maybeSingle(),
        supabase.from("daily_biometrics").select("measurement_date, sleep_score, hrv, stress_level, soreness_score, mood").eq("user_id", user.id).gte("measurement_date", weekAgo).order("measurement_date", { ascending: false }).limit(7),
        supabase.from("completed_workouts").select("workout_date, actual_distance_km, actual_duration_min, rpe").eq("user_id", user.id).gte("workout_date", weekAgo).order("workout_date", { ascending: false }).limit(7),
        supabase.from("races").select("name, race_date, distance_km, elevation_gain_m, priority").eq("user_id", user.id).gte("race_date", today).order("race_date", { ascending: true }).limit(3),
      ]);

      // Histórico de mensagens para contexto
      const history = messages.slice(-10).map((m) => ({
        role: m.sender_id === user.id ? "user" : "assistant",
        content: m.body,
      }));

      // Chamar Groq
      const { data: groqData, error: groqError } = await supabase.functions.invoke("coach-chat", {
        body: {
          message: body,
          history,
          context: {
            profile,
            recent_bio: bio ?? [],
            recent_workouts: workouts ?? [],
            upcoming_races: races ?? [],
          },
        },
      });

      if (groqError) throw groqError;

      const botReply = (groqData as any)?.reply ?? "Não consegui gerar resposta. Tenta de novo.";

      // Guardar resposta do bot
      const { data: botMsg } = await supabase
        .from("messages")
        .insert({
          sender_id: user.id,
          recipient_id: user.id,
          body: botReply,
          is_read: false,
          is_bot: true,
        })
        .select()
        .single();

      setMessages((prev) => [...prev, botMsg as Message]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-primary" /> Coach AI
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Faz perguntas ao teu coach sobre treino, recuperação ou nutrição.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs gap-1">
          <Bot className="w-3 h-3" /> Powered by Groq AI
        </Badge>
        <span className="text-xs text-muted-foreground">
          {todayCount}/{DAILY_LIMIT} mensagens hoje
        </span>
      </div>

      <Card className="flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
              <Bot className="w-12 h-12 text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Olá! Sou o teu Coach AI.</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Podes perguntar-me sobre treino, recuperação, nutrição ou qualquer dúvida relacionada com o teu plano.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {[
                  "Como posso melhorar o meu pace?",
                  "O que comer antes de um long run?",
                  "Estou com dores nos joelhos, o que faço?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="text-xs bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.is_bot ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.is_bot
                    ? "bg-muted text-foreground rounded-tl-sm"
                    : "bg-primary text-primary-foreground rounded-tr-sm"
                }`}>
                  {m.is_bot && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                      <Bot className="w-3 h-3" /> Coach AI
                    </div>
                  )}
                  <p className="leading-relaxed whitespace-pre-wrap">{m.body}</p>
                  <div className={`text-[10px] mt-1 ${m.is_bot ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                    {format(parseISO(m.created_at), "HH:mm", { locale: pt })}
                  </div>
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={todayCount >= DAILY_LIMIT ? "Limite diário atingido" : "Pergunta ao teu coach..."}
            disabled={sending || todayCount >= DAILY_LIMIT}
            className="flex-1"
          />
          <Button onClick={send} disabled={sending || !input.trim() || todayCount >= DAILY_LIMIT} size="icon">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </Card>
    </div>
  );
}
