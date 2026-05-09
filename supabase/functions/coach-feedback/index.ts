// Coach Feedback — Lovable AI
// Modes:
//  - "quick": fast assessment of one executed workout vs plan (RPE, deltas).
//  - "deep": deeper analysis + proposed adjustments to the next 1-2 weeks.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface PlannedRef {
  title: string;
  workout_type: string;
  zone: string | null;
  target_distance_km: number | null;
  target_elevation_m: number | null;
  target_duration_min: number | null;
  target_pace_sec_per_km: number | null;
  description?: string | null;
  workout_date: string;
}
interface ExecutedRef {
  actual_distance_km: number | null;
  actual_elevation_m: number | null;
  actual_duration_min: number | null;
  actual_avg_pace_sec_per_km: number | null;
  rpe: number | null;
  notes: string | null;
}
interface UpcomingRef {
  id?: string;
  workout_date: string;
  title: string;
  target_distance_km: number | null;
  target_elevation_m: number | null;
  target_duration_min: number | null;
  zone: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const body = await req.json();
    const mode: "quick" | "deep" = body.mode === "deep" ? "deep" : "quick";
    const planned: PlannedRef = body.planned;
    const executed: ExecutedRef = body.executed;
    const upcoming: UpcomingRef[] = Array.isArray(body.upcoming) ? body.upcoming.slice(0, 14) : [];

    if (!planned || !executed) {
      return new Response(JSON.stringify({ error: "planned and executed are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Tu és um treinador de trail running experiente, formado nos princípios do "Training for the Uphill Athlete" (House/Johnston/Jornet) e no Método Lyss (Dr. Alyssa Olenick) — 80/20 polarized, D+ semanal 50-100% do D+ da prova âncora, Repeated Bout Effect para descidas.
Responde em português europeu, sempre conciso e accionável. Nunca inventes números do atleta — usa só os fornecidos.`;

    const quickTool = {
      type: "function",
      function: {
        name: "quick_assessment",
        description: "Avaliação rápida da execução de um treino face ao planeado.",
        parameters: {
          type: "object",
          properties: {
            verdict: {
              type: "string",
              enum: ["great", "good", "ok", "poor", "concern"],
              description: "Bandeira global (great=excedeu, good=cumpriu bem, ok=cumpriu parcialmente, poor=ficou aquém, concern=sinais para acompanhar).",
            },
            headline: { type: "string", description: "Resumo de 1 frase, ex: 'Cumpriste o long run com RPE controlado.'" },
            highlights: { type: "array", items: { type: "string" }, description: "1-3 pontos positivos." },
            improvements: { type: "array", items: { type: "string" }, description: "1-3 dicas de melhoria concretas." },
            next_session_tip: { type: "string", description: "Dica curta para o próximo treino." },
          },
          required: ["verdict", "headline", "highlights", "improvements", "next_session_tip"],
          additionalProperties: false,
        },
      },
    };

    const deepTool = {
      type: "function",
      function: {
        name: "deep_assessment",
        description: "Análise profunda + proposta de readaptação dos próximos treinos.",
        parameters: {
          type: "object",
          properties: {
            verdict: { type: "string", enum: ["great", "good", "ok", "poor", "concern"] },
            summary: { type: "string", description: "Análise em 2-4 frases (carga, RPE, aderência ao plano, fadiga sinalizada)." },
            highlights: { type: "array", items: { type: "string" } },
            improvements: { type: "array", items: { type: "string" } },
            adaptations: {
              type: "array",
              description: "Alterações propostas aos próximos treinos. Lista vazia se não recomendares mudanças.",
              items: {
                type: "object",
                properties: {
                  workout_date: { type: "string", description: "YYYY-MM-DD do treino a alterar." },
                  reason: { type: "string", description: "Porquê alterar (1 frase)." },
                  new_title: { type: "string" },
                  new_target_distance_km: { type: "number", nullable: true },
                  new_target_elevation_m: { type: "number", nullable: true },
                  new_target_duration_min: { type: "number", nullable: true },
                },
                required: ["workout_date", "reason", "new_title"],
                additionalProperties: false,
              },
            },
          },
          required: ["verdict", "summary", "highlights", "improvements", "adaptations"],
          additionalProperties: false,
        },
      },
    };

    const tool = mode === "deep" ? deepTool : quickTool;
    const toolName = mode === "deep" ? "deep_assessment" : "quick_assessment";

    const userPrompt = `Treino PLANEADO (${planned.workout_date}): ${planned.title}
- Tipo: ${planned.workout_type}${planned.zone ? ` · Zona ${planned.zone}` : ""}
- Alvos: ${planned.target_distance_km ?? "—"} km · ${planned.target_elevation_m ?? "—"} D+ · ${planned.target_duration_min ?? "—"} min · pace alvo ${planned.target_pace_sec_per_km ?? "—"} s/km
${planned.description ? `- Notas do plano: ${planned.description}` : ""}

Treino EXECUTADO:
- Distância: ${executed.actual_distance_km ?? "—"} km
- D+: ${executed.actual_elevation_m ?? "—"} m
- Duração: ${executed.actual_duration_min ?? "—"} min
- Pace médio: ${executed.actual_avg_pace_sec_per_km ?? "—"} s/km
- RPE (1-10): ${executed.rpe ?? "—"}
- Notas do atleta: ${executed.notes ?? "—"}

${
  mode === "deep" && upcoming.length
    ? `PRÓXIMOS TREINOS PLANEADOS (podes propor alterações):\n${upcoming
        .map(
          (u) =>
            `- ${u.workout_date} · ${u.title} · ${u.target_distance_km ?? "—"}km / ${u.target_elevation_m ?? "—"}D+ / ${u.target_duration_min ?? "—"}min`,
        )
        .join("\n")}`
    : ""
}

Avalia. Sê rigoroso mas encorajador.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de pedidos AI atingido. Tenta de novo dentro de momentos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos AI esgotados. Adiciona créditos em Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar feedback do treinador." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Resposta AI inválida" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ mode, result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("coach-feedback error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
