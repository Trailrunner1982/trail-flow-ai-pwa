// Daily proactive coach — analyses today's planned workout in light of
// recent biometrics and recent RPE, then issues a clear recommendation.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const { today_workout, today_bio, recent_bio, recent_rpe, readiness } = await req.json();

    const systemPrompt = `Tu és um treinador de trail running com base em DOIS métodos:
1. "Training for the Uphill Athlete" (House/Johnston/Jornet) — base aeróbica enorme em Z1-Z2, polarizado 80/20, periodização Transition→Base→Build→Specific→Taper, força máxima + Muscular Endurance, vigilância de OTS via HRV+FC repouso.
2. "How to Train for Vert" (Lyss Method) — vert semanal 50–100% do D+ da prova A, time-on-feet > km, Repeated Bout Effect (1 sessão downhill dura 3–4 sem antes da prova A), treinar especificamente o perfil da prova.

Os 4 PILARES de performance que deves sempre considerar: VO₂máx · LT2 (limiar anaeróbio) · Força específica · Biomecânica/economia.

REGRAS DE ADAPTAÇÃO À BIOMETRIA:
- HRV em queda + sono <60 + soreness ≥5 → reduzir ou descansar.
- Soreness quadríceps ≥6 → SEM descidas/vert hoje.
- Soreness gémeos/Aquiles ≥6 → SEM intervalos rápidos nem subidas íngremes.
- Soreness lombar/joelhos ≥6 → strength leve + recovery.
- Mood ≤2 persistente → sinal de OTS psicológico, deload.
- Queda de peso >2% num dia → desidratação, prioriza hidratação antes de treino duro.

Português europeu, conciso, accionável. Não inventes números.`;

    const tool = {
      type: "function",
      function: {
        name: "daily_recommendation",
        description: "Recomendação proactiva para o treino de hoje.",
        parameters: {
          type: "object",
          properties: {
            verdict: {
              type: "string",
              enum: ["go", "modify", "easy", "rest"],
              description: "go=executa como planeado; modify=ajusta volume/intensidade; easy=substitui por sessão fácil; rest=descansa.",
            },
            headline: { type: "string", description: "Recomendação em 1 frase clara." },
            reasoning: { type: "string", description: "2-3 frases a explicar o porquê com base na biometria e RPE recente." },
            adjustments: {
              type: "array",
              items: { type: "string" },
              description: "Ajustes concretos (ex: 'reduz para 45min', 'mantém Z2', 'evita séries hoje'). Vazio se verdict=go.",
            },
            suggested_distance_km: { type: "number", nullable: true, description: "Distância sugerida em km (null se rest)." },
            suggested_elevation_m: { type: "number", nullable: true, description: "D+ sugerido em m." },
            suggested_duration_min: { type: "number", nullable: true, description: "Duração sugerida em min." },
            suggested_pace_sec_per_km: { type: "number", nullable: true, description: "Pace sugerido em s/km." },
            suggested_zone: { type: "string", nullable: true, description: "Zona de intensidade sugerida (Z1-Z5)." },
            watch_for: { type: "string", description: "1 sinal a vigiar durante o treino (FC, fadiga, etc.)." },
          },
          required: ["verdict", "headline", "reasoning", "adjustments", "watch_for"],
          additionalProperties: false,
        },
      },
    };

    const userPrompt = `TREINO DE HOJE:
${today_workout ? `${today_workout.title} · ${today_workout.target_distance_km ?? "—"}km / ${today_workout.target_elevation_m ?? "—"}D+ / ${today_workout.target_duration_min ?? "—"}min · zona ${today_workout.zone ?? "—"}
Notas: ${today_workout.description ?? "—"}` : "Sem treino planeado."}

PRONTIDÃO HOJE: ${readiness ?? "—"}/100
BIOMETRIA HOJE: ${today_bio ? `sono ${today_bio.sleep_score ?? "—"}, HRV ${today_bio.hrv ?? "—"}, stress ${today_bio.stress_level ?? "—"}, body battery ${today_bio.body_battery ?? "—"}, energia ${today_bio.energy_level ?? "—"}/10, soreness ${today_bio.soreness_score ?? 0}/10${today_bio.soreness_zones?.length ? ` (zonas: ${today_bio.soreness_zones.join(", ")})` : ""}, mood ${today_bio.mood ?? "—"}/5, peso ${today_bio.weight_kg ?? "—"}kg` : "sem registo"}

BIOMETRIA ÚLTIMOS 7 DIAS:
${(recent_bio ?? []).map((b: any) => `- ${b.measurement_date}: sono ${b.sleep_score ?? "—"}, HRV ${b.hrv ?? "—"}, stress ${b.stress_level ?? "—"}, soreness ${b.soreness_score ?? 0}, mood ${b.mood ?? "—"}`).join("\n") || "—"}

RPE ÚLTIMOS 7 TREINOS:
${(recent_rpe ?? []).map((r: any) => `- ${r.workout_date}: RPE ${r.rpe ?? "—"}/10 · ${r.actual_distance_km ?? "—"}km`).join("\n") || "—"}

Dá a recomendação para hoje, respeitando os 4 pilares e as regras de soreness por zona.`;

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
        tool_choice: { type: "function", function: { name: "daily_recommendation" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Limite AI atingido. Tenta de novo." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    console.error("daily-coach error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
