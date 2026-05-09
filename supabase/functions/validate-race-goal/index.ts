// Validates the feasibility of a race goal vs the athlete's current volume.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const { race, baseline_km_per_week, baseline_pace_sec_per_km, weeks_until_race, recent_long_run_km } = await req.json();

    const tool = {
      type: "function",
      function: {
        name: "race_viability",
        description: "Avalia viabilidade da prova e devolve recomendação.",
        parameters: {
          type: "object",
          properties: {
            verdict: { type: "string", enum: ["realistic", "stretch", "unrealistic"] },
            confidence: { type: "number", description: "0-100" },
            headline: { type: "string", description: "1 frase clara." },
            reasoning: { type: "string", description: "2-3 frases com base nos dados." },
            recommended_weekly_km: { type: "number", description: "km/semana alvo a atingir antes da prova." },
            recommended_long_run_km: { type: "number", description: "Long run alvo a atingir." },
            min_weeks_needed: { type: "number", description: "Semanas mínimas para preparar de forma segura." },
            risks: { type: "array", items: { type: "string" } },
          },
          required: ["verdict", "confidence", "headline", "reasoning", "recommended_weekly_km", "recommended_long_run_km", "min_weeks_needed", "risks"],
          additionalProperties: false,
        },
      },
    };

    const systemPrompt = `És treinador de trail running (Uphill Athlete + Lyss). Avalias se uma prova é realista para o atleta dado o volume atual. Português europeu, conciso, sem inventar números.`;

    const userPrompt = `PROVA:
- Nome: ${race.name}
- Distância: ${race.distance_km} km
- D+: ${race.elevation_gain_m} m
- Terreno: ${race.terrain_profile}
- Prioridade: ${race.priority}
- Data: ${race.race_date}

ATLETA:
- km/semana atual: ${baseline_km_per_week ?? "—"}
- Pace base Z2: ${baseline_pace_sec_per_km ? Math.floor(baseline_pace_sec_per_km/60)+":"+String(baseline_pace_sec_per_km%60).padStart(2,"0") : "—"}
- Long run recente: ${recent_long_run_km ?? "—"} km
- Semanas até à prova: ${weeks_until_race}

Regras práticas:
- Long run típico ~30-40% da distância da prova (até maratona); ultras precisam back-to-back.
- Volume semanal alvo: ~2-3x a distância da prova para ultras curtos, mais ajustado para longos.
- Mínimo 12 semanas para subir volume sem lesão.

Avalia.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "race_viability" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Limite AI atingido." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Créditos AI esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Erro AI" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiResp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return new Response(JSON.stringify({ error: "Resposta AI inválida" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ result: parsed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("validate-race-goal error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
