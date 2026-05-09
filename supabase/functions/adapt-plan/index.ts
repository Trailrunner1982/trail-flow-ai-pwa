// Adapts the upcoming planned workouts (next 7 days) based on today's
// HRV / Garmin readiness / sleep + recent biometrics & RPE trend.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const { upcoming, today_bio, recent_bio, recent_rpe, readiness, next_race } = await req.json();

    if (!Array.isArray(upcoming) || upcoming.length === 0) {
      return new Response(JSON.stringify({ result: { summary: "Sem treinos futuros para adaptar.", adaptations: [] } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Tu és treinador de trail running com base em DOIS métodos:
1. Training for the Uphill Athlete (House/Johnston/Jornet) — polarizado 80/20, periodização Transition→Base→Build→Specific→Taper, base aeróbica grande, vigilância de OTS.
2. How to Train for Vert (Lyss Method) — vert semanal 50–100% D+ da prova A, time-on-feet > km, Repeated Bout Effect (1 sessão downhill dura 3–4 sem antes de cada prova A).

4 PILARES de performance: VO₂máx · LT2 · Força específica · Biomecânica/economia.

Adapta dinamicamente o plano dos próximos 7 dias com base na biometria HOJE (HRV, Garmin readiness, sono, soreness por zona, mood) + tendência recente.
Princípios:
- Readiness alto + HRV estável → mantém ou progride ligeiramente.
- HRV baixa OU sono <60 OU readiness <50 → reduz volume/intensidade dos próximos 1-2 dias.
- Soreness ≥7 ou quadríceps ≥6 → cortar descidas/vert; substituir por easy/recovery.
- Soreness gémeos/Aquiles ≥6 → sem séries rápidas/subidas íngremes.
- Mood ≤2 + HRV em queda 3+ dias → propor deload semanal.
- Fadiga acumulada (RPE elevado consecutivo) → dia fácil ou descanso.
- NUNCA cortes long run ou sessão race-specific sem necessidade clara.
- Se há prova A próxima: protege o pico, mantém a sessão Repeated Bout 3–4 sem antes.
Português europeu, conciso, accionável.`;

    const tool = {
      type: "function",
      function: {
        name: "adapt_plan",
        description: "Adaptações para os próximos treinos.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "1-2 frases a resumir a estratégia da semana." },
            overall_load: {
              type: "string",
              enum: ["maintain", "reduce", "increase", "deload"],
              description: "Estratégia global para a semana.",
            },
            adaptations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  workout_id: { type: "string", description: "ID do planned_workout a adaptar." },
                  workout_date: { type: "string" },
                  action: { type: "string", enum: ["keep", "modify", "easy", "rest", "swap"], description: "keep=sem mudança." },
                  reasoning: { type: "string" },
                  new_title: { type: "string", nullable: true },
                  new_distance_km: { type: "number", nullable: true },
                  new_elevation_m: { type: "number", nullable: true },
                  new_duration_min: { type: "number", nullable: true },
                  new_zone: { type: "string", nullable: true, description: "Z1-Z5" },
                },
                required: ["workout_id", "workout_date", "action", "reasoning"],
                additionalProperties: false,
              },
            },
          },
          required: ["summary", "overall_load", "adaptations"],
          additionalProperties: false,
        },
      },
    };

    const userPrompt = `BIOMETRIA HOJE: HRV ${today_bio?.hrv ?? "—"}, sono ${today_bio?.sleep_score ?? "—"}, Garmin readiness ${today_bio?.garmin_readiness ?? readiness ?? "—"}, stress ${today_bio?.stress_level ?? "—"}, body battery ${today_bio?.body_battery ?? "—"}, energia ${today_bio?.energy_level ?? "—"}/10, soreness ${today_bio?.soreness_score ?? 0}/10${today_bio?.soreness_zones?.length ? ` (zonas: ${today_bio.soreness_zones.join(", ")})` : ""}, mood ${today_bio?.mood ?? "—"}/5, peso ${today_bio?.weight_kg ?? "—"}kg
PRONTIDÃO CALCULADA: ${readiness ?? "—"}/100

BIOMETRIA 7 DIAS:
${(recent_bio ?? []).map((b: any) => `- ${b.measurement_date}: HRV ${b.hrv ?? "—"} · sono ${b.sleep_score ?? "—"} · stress ${b.stress_level ?? "—"} · readiness ${b.garmin_readiness ?? "—"} · soreness ${b.soreness_score ?? 0}${b.soreness_zones?.length ? ` (${b.soreness_zones.join(",")})` : ""} · mood ${b.mood ?? "—"}`).join("\n") || "—"}

RPE 7 DIAS:
${(recent_rpe ?? []).map((r: any) => `- ${r.workout_date}: RPE ${r.rpe ?? "—"}/10 · ${r.actual_distance_km ?? "—"}km`).join("\n") || "—"}

PRÓXIMA PROVA A: ${next_race ? `${next_race.name} em ${next_race.race_date} · ${next_race.distance_km}km / ${next_race.elevation_gain_m}D+` : "nenhuma"}

PRÓXIMOS TREINOS PLANEADOS (id · data · título · km / D+ / min / zona):
${upcoming.map((w: any) => `- ${w.id} · ${w.workout_date} · ${w.title} · ${w.target_distance_km ?? "—"}km / ${w.target_elevation_m ?? "—"}D+ / ${w.target_duration_min ?? "—"}min / ${w.zone ?? "—"}`).join("\n")}

Devolve adaptações para CADA treino acima (mesmo que action=keep).`;

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
        tool_choice: { type: "function", function: { name: "adapt_plan" } },
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
    console.error("adapt-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
