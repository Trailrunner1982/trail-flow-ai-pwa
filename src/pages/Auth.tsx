import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Mountain, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import heroImg from "@/assets/hero-trail.jpg";

const authSchema = z.object({
  email: z.string().trim().email({ message: "Email inválido" }).max(255),
  password: z.string().min(6, { message: "Mínimo 6 caracteres" }).max(72),
});

export default function AuthPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/dashboard");
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    setSubmitting(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email: result.data.email,
          password: result.data.password,
          options: { emailRedirectTo: `${window.location.origin}/onboarding` },
        });
        if (error) throw error;
        toast.success("Conta criada! Vamos preparar o teu plano.");
        navigate("/onboarding");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: result.data.email,
          password: result.data.password,
        });
        if (error) throw error;

        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("must_change_password, onboarding_completed")
            .eq("id", currentUser.id)
            .maybeSingle();

          if (profile?.must_change_password) {
            navigate("/reset-password?force=true");
            return;
          }

          if (!profile?.onboarding_completed) {
            navigate("/onboarding");
            return;
          }
        }

        toast.success("Bem-vindo de volta!");
        navigate("/dashboard");
      }
    } catch (err: any) {
      const msg = err?.message ?? "Erro inesperado";
      if (msg.includes("Invalid login credentials")) {
        toast.error("Credenciais inválidas");
      } else if (msg.includes("already registered") || msg.includes("User already")) {
        toast.error("Este email já está registado. Faz login.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <aside className="hidden lg:flex relative overflow-hidden">
        <img
          src={heroImg}
          alt="Trail runner ao nascer do sol numa montanha"
          className="absolute inset-0 w-full h-full object-cover"
          width={1920}
          height={1280}
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-background via-background/70 to-transparent" />
        <div className="relative z-10 flex flex-col justify-end p-12 gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Mountain className="w-6 h-6" />
            <span className="text-sm font-semibold tracking-widest uppercase">Trail Forge</span>
          </div>
          <h1 className="text-5xl font-bold leading-tight max-w-md">
            Forge your path.<br />
            <span className="text-gradient">Conquer the trail.</span>
          </h1>
          <p className="text-muted-foreground max-w-md text-lg">
            Adaptive training built for the mountains and for you.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="lg:hidden flex items-center gap-2 text-primary">
            <Mountain className="w-6 h-6" />
            <span className="text-sm font-semibold tracking-widest uppercase">Trail Forge</span>
          </div>
          <div>
            <h2 className="text-3xl font-bold">Entra na montanha</h2>
            <p className="text-muted-foreground mt-2">O teu plano adaptativo começa aqui.</p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Registar</TabsTrigger>
            </TabsList>
            <TabsContent value="login" />
            <TabsContent value="signup" />
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="atleta@trail.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password"
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                required value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
            </div>
            <Button type="submit" disabled={submitting} variant="hero" size="lg" className="w-full">
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {tab === "login" ? "Entrar" : "Criar conta"}
            </Button>
            {tab === "login" && (
              <button
                type="button"
                onClick={async () => {
                  const parsed = z.string().email().safeParse(email.trim());
                  if (!parsed.success) return toast.error("Introduz o teu email primeiro");
                  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
                    redirectTo: `${window.location.origin}/reset-password`,
                  });
                  if (error) toast.error(error.message);
                  else toast.success("Email de recuperação enviado");
                }}
                className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline w-full text-center"
              >
                Esqueci-me da password
              </button>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
