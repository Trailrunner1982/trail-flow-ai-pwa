import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const APP_URL = Deno.env.get("APP_URL") ?? "https://trailforgeai.pt";
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@trailforgeai.pt";

    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurada");

    // Auth do utilizador
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autenticado");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Verificar utilizador autenticado
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) throw new Error("Token inválido");

    const { invited_email } = await req.json();
    if (!invited_email || !invited_email.includes("@")) throw new Error("Email inválido");

    // Verificar subscrição activa
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, subscription_end_date, is_suspended")
      .eq("id", user.id)
      .single();

    if (!profile) throw new Error("Perfil não encontrado");
    if (profile.is_suspended) throw new Error("Conta suspensa");

    const subEnd = profile.subscription_end_date ? new Date(profile.subscription_end_date) : null;
    const isSubscribed = subEnd && subEnd > new Date();
    if (!isSubscribed) throw new Error("Subscrição inactiva — só atletas com subscrição activa podem convidar");

    // Verificar limite de 3 convites activos (pending)
    const { count: pendingCount } = await supabaseAdmin
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", user.id)
      .eq("status", "pending");

    if ((pendingCount ?? 0) >= 3) {
      throw new Error("Já tens 3 convites activos. Aguarda que sejam aceites antes de convidar mais atletas.");
    }

    // Verificar se este email já foi convidado
    const { data: existing } = await supabaseAdmin
      .from("referrals")
      .select("id, status")
      .eq("referrer_id", user.id)
      .eq("invited_email", invited_email.toLowerCase())
      .maybeSingle();

    if (existing && existing.status === "pending") {
      throw new Error("Este email já tem um convite activo da tua parte.");
    }
    if (existing && existing.status === "accepted") {
      throw new Error("Este atleta já aceitou o teu convite.");
    }

    // Verificar se o email já tem conta
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const alreadyRegistered = existingUsers?.users?.some(u => u.email === invited_email.toLowerCase());
    if (alreadyRegistered) throw new Error("Este email já tem uma conta no Trail Forge.");

    // Criar referral
    const { data: referral, error: refErr } = await supabaseAdmin
      .from("referrals")
      .insert({
        referrer_id: user.id,
        invited_email: invited_email.toLowerCase(),
      })
      .select("token")
      .single();

    if (refErr || !referral) throw new Error("Erro ao criar convite");

    const joinUrl = `${APP_URL}/join?token=${referral.token}`;
    const referrerName = profile.full_name?.split(" ")[0] ?? "Um atleta";

    // Enviar email via Resend
    const emailResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Trail Forge AI <${FROM_EMAIL}>`,
        to: [invited_email],
        subject: `${referrerName} convidou-te para o Trail Forge AI 🏔️`,
        html: `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convite Trail Forge AI</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#e8621a,#f97316);border-radius:16px 16px 0 0;padding:40px;text-align:center;">
              <div style="font-size:32px;margin-bottom:8px;">🏔️</div>
              <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Trail Forge AI</h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">Plano adaptativo de trail running</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#1a1f2e;padding:40px;border-radius:0 0 16px 16px;">

              <h2 style="color:#f5f0e8;margin:0 0 16px;font-size:22px;">Foste convidado por ${referrerName}!</h2>
              <p style="color:#9aa5b4;margin:0 0 24px;font-size:15px;line-height:1.6;">
                O ${referrerName} acredita que o Trail Forge AI pode ajudar-te a treinar melhor e a chegar às tuas provas de trail mais preparado.
              </p>

              <!-- Benefícios -->
              <div style="background:#252b3b;border-radius:12px;padding:24px;margin:0 0 32px;">
                <h3 style="color:#f97316;margin:0 0 16px;font-size:14px;letter-spacing:1px;text-transform:uppercase;">O que recebes</h3>
                <div style="display:flex;flex-direction:column;gap:12px;">
                  <div style="color:#f5f0e8;font-size:15px;">🎁 <strong>1 mês grátis</strong> ao activares a conta</div>
                  <div style="color:#f5f0e8;font-size:15px;">📅 <strong>Plano de época personalizado</strong> com base nas tuas provas</div>
                  <div style="color:#f5f0e8;font-size:15px;">🤖 <strong>Coach AI diário</strong> com base na tua biometria</div>
                  <div style="color:#f5f0e8;font-size:15px;">📊 <strong>Análise de treino</strong> com dados do Strava</div>
                  <div style="color:#f5f0e8;font-size:15px;">🧘 <strong>Programa de mobilidade</strong> personalizado</div>
                </div>
              </div>

              <!-- CTA -->
              <div style="text-align:center;margin:0 0 32px;">
                <a href="${joinUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#e8621a,#f97316);color:#fff;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:700;letter-spacing:0.3px;">
                  Activar conta gratuita →
                </a>
                <p style="color:#6b7280;font-size:12px;margin:12px 0 0;">O link é válido por 30 dias e é pessoal — não partilhes.</p>
              </div>

              <!-- Como funciona -->
              <div style="border-top:1px solid #2d3448;padding-top:24px;">
                <h3 style="color:#9aa5b4;margin:0 0 16px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Como funciona</h3>
                <div style="color:#9aa5b4;font-size:14px;line-height:1.8;">
                  <div style="margin-bottom:8px;">1. Clica no botão acima</div>
                  <div style="margin-bottom:8px;">2. Cria a tua conta com email e password</div>
                  <div style="margin-bottom:8px;">3. O mês grátis é activado automaticamente</div>
                  <div>4. Liga o Strava e começa a treinar 🏃</div>
                </div>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px;text-align:center;">
              <p style="color:#4b5563;font-size:12px;margin:0;">
                Trail Forge AI · <a href="${APP_URL}" style="color:#f97316;text-decoration:none;">trailforgeai.pt</a><br>
                Se não conheces quem te convidou, ignora este email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      }),
    });

    if (!emailResp.ok) {
      const errText = await emailResp.text();
      console.error("Resend error:", errText);
      throw new Error("Erro ao enviar email. Verifica a configuração do Resend.");
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("send-referral error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
