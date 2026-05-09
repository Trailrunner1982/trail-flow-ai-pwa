// race-fueling-ai — generates nutrition + gear refinement for a race
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const { race, baseline_pace_sec_per_km, current } = await req.json();
    if (!race) {
      return new Response(JSON.stringify({ error: "race required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tool = {
      type: "function",
      function: {
        name: "race_fueling",
        description: "Plano de nutrição e checklist de equipamento para uma prova de trail/corrida.",
        parameters: {
          type: "object",
          properties: {
            estimated_duration_min: { type: "number", description: "Estimativa de duração total em minutos." },
            carbs_per_hour_g: { type: "number", description: "Hidratos de carbono recomendados por hora (g)." },
            water_ml_per_hour: { type: "number", description: "Água recomendada por hora (ml)." },
            sodium_mg_per_hour: { type: "number", description: "Sódio recomendado por hora (mg)." },
            pre_race: { type: "array", items: { type: "string" }, description: "Recomendações pré-prova." },
            during: { type: "array", items: { type: "string" }, description: "Estratégia durante a prova (gels/barras/timing)." },
            post_race: { type: "array", items: { type: "string" }, description: "Recuperação." },
            gear_checklist: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  item: { type: "string" },
                  category: { type: "string", enum: ["mandatory", "recommended", "optional"] },
                  notes: { type: "string", nullable: true },
                },
                required: ["item", "category"],
                additionalProperties: false,
              },
            },
          },
          required: ["estimated_duration_min", "carbs_per_hour_g", "water_ml_per_hour", "sodium_mg_per_hour", "pre_race", "during", "post_race", "gear_checklist"],
          additionalProperties: false,
        },
      },
    };

    const sys = `Tu és um nutricionista desportivo e equipador experiente em trail running. Responde em português europeu, conciso e accionável. Usa fórmulas standard (60-90g HC/h consoante duração, 400-700ml água/h consoante temperatura/distância, 300-700mg sódio/h). Adapta à duração e D+ da prova.`;

    const user = `Prova: ${race.name}
- Distância: ${race.distance_km} km
- D+: ${race.elevation_gain_m} m
- Tipo de terreno: ${race.terrain_profile}
- Pace baseline atleta: ${baseline_pace_sec_per_km ?? "—"} s/km
- Tempo alvo: ${race.target_time_minutes ?? "—"} min
${current ? `\nPlano actual (refina, não recomeces do zero): ${JSON.stringify(current)}` : ""}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "race_fueling" } },
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      const msg = status === 429 ? "Limite AI atingido."
        : status === 402 ? "Créditos AI esgotados."
        : "Erro AI";
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) {
      return new Response(JSON.stringify({ error: "Resposta AI inválida" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = JSON.parse(tc.function.arguments);
    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("race-fueling-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
