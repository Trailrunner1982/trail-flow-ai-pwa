import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, email, password, full_name } = await req.json();

    if (!token) throw new Error("Token inválido");
    if (!email || !email.includes("@")) throw new Error("Email inválido");
    if (!password || password.length < 8) throw new Error("Password deve ter pelo menos 8 caracteres");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Validar token
    const { data: referral, error: refErr } = await supabaseAdmin
      .from("referrals")
      .select("id, referrer_id, invited_email, status, created_at")
      .eq("token", token)
      .maybeSingle();

    if (refErr || !referral) throw new Error("Convite não encontrado");
    if (referral.status === "accepted") throw new Error("Este convite já foi utilizado");
    if (referral.status === "expired") throw new Error("Este convite expirou");

    // Verificar se o convite expirou (30 dias)
    const createdAt = new Date(referral.created_at);
    const daysDiff = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 30) {
      await supabaseAdmin.from("referrals").update({ status: "expired" }).eq("id", referral.id);
      throw new Error("Este convite expirou (válido por 30 dias)");
    }

    // Verificar que o email corresponde ao convite
    if (referral.invited_email !== email.toLowerCase()) {
      throw new Error("Este convite foi enviado para outro email");
    }

    // Calcular data de subscrição do convidado (+1 mês grátis)
    const inviteeSubEnd = new Date();
    inviteeSubEnd.setMonth(inviteeSubEnd.getMonth() + 1);

    // Criar conta do convidado
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? null },
    });

    if (createErr) {
      if (createErr.message.includes("already")) throw new Error("Este email já tem uma conta no Trail Forge");
      throw createErr;
    }

    const inviteeId = newUser.user.id;

    // Actualizar perfil do convidado com 1 mês grátis
    await supabaseAdmin.from("profiles").upsert({
      id: inviteeId,
      full_name: full_name ?? null,
      subscription_end_date: inviteeSubEnd.toISOString(),
      must_change_password: false,
      onboarding_completed: false,
    });

    // Marcar referral como aceite
    await supabaseAdmin.from("referrals").update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      invitee_id: inviteeId,
      reward_invitee_applied: true,
    }).eq("id", referral.id);

    // Aplicar +2 meses ao referrer
    const { data: referrerProfile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_end_date, full_name")
      .eq("id", referral.referrer_id)
      .single();

    if (referrerProfile) {
      // Calcula nova data: estende a subscrição actual ou a partir de hoje
      const currentEnd = referrerProfile.subscription_end_date
        ? new Date(referrerProfile.subscription_end_date)
        : new Date();
      const referenceDate = currentEnd > new Date() ? currentEnd : new Date();
      referenceDate.setMonth(referenceDate.getMonth() + 2);

      await supabaseAdmin.from("profiles").update({
        subscription_end_date: referenceDate.toISOString(),
      }).eq("id", referral.referrer_id);

      // Marcar recompensa do referrer como aplicada
      await supabaseAdmin.from("referrals").update({
        reward_referrer_applied: true,
      }).eq("id", referral.id);

      console.log(`Referrer ${referral.referrer_id} got +2 months. New end: ${referenceDate.toISOString()}`);
    }

    console.log(`Referral accepted: invitee ${inviteeId}, referrer ${referral.referrer_id}`);

    return new Response(JSON.stringify({
      success: true,
      user_id: inviteeId,
      message: "Conta criada com sucesso! Tens 1 mês grátis activado.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("accept-referral error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
