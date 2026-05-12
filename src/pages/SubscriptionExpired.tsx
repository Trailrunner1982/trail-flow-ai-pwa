import { Mountain, CalendarX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function SubscriptionExpired() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md p-8 space-y-6 text-center">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Mountain className="w-6 h-6" />
          <span className="text-sm font-semibold tracking-widest uppercase">Trail Forge</span>
        </div>
        <div className="space-y-3">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <CalendarX className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Subscrição expirada</h1>
          <p className="text-sm text-muted-foreground">
            O teu acesso ao Trail Forge expirou. Contacta o teu treinador para renovar a subscrição.
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 border border-border p-4 text-xs text-muted-foreground space-y-1">
          <p>📧 Envia um email ao teu treinador</p>
          <p>📱 Ou contacta-o diretamente</p>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => supabase.auth.signOut().then(() => window.location.href = "/auth")}
        >
          Sair
        </Button>
      </Card>
    </div>
  );
}
