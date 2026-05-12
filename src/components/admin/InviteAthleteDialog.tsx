const submit = async () => {
  if (!email.trim()) return toast.error("Email obrigatório");
  setLoading(true);
  try {
    // Guardar sessão do admin
    const { data: { session: adminSession } } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke("invite-athlete", {
      body: {
        email: email.trim(),
        full_name: fullName.trim() || null,
        subscription_end_date: endDate ? format(endDate, "yyyy-MM-dd") : null,
        password: "TrailForge2026!",
      },
    });

    // Restaurar sessão do admin imediatamente
    if (adminSession) {
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
    }

    if (error || (data as any)?.error) {
      throw new Error((data as any)?.error || error?.message || "Falha ao criar atleta");
    }

    setCreated(true);
    toast.success("Atleta criado com sucesso!");
    onInvited();
  } catch (e: any) {
    toast.error(e?.message ?? "Erro ao criar atleta");
  } finally {
    setLoading(false);
  }
};
