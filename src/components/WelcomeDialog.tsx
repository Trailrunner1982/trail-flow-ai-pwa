import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HeartPulse, Calendar, Brain } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface Props {
  userId: string;
}

export function WelcomeDialog({ userId }: Props) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const key = `tf:welcome:seen:${userId}`;

  useEffect(() => {
    if (!userId) return;
    if (!localStorage.getItem(key)) setOpen(true);
  }, [userId, key]);

  const close = () => {
    localStorage.setItem(key, "1");
    setOpen(false);
  };

  const isPt = lang === "pt";

  const tips = [
    {
      icon: HeartPulse,
      title: isPt ? "Regista a biometria todos os dias" : "Log your biometrics every day",
      body: isPt
        ? "HRV, sono, soreness e mood. É o que permite ao Coach ajustar os teus treinos."
        : "HRV, sleep, soreness and mood. This is what lets the Coach adapt your training.",
    },
    {
      icon: Calendar,
      title: isPt ? "Abre cada treino antes de o fazer" : "Open each workout before doing it",
      body: isPt
        ? "Vais ver objectivo, dicas de execução e nutrição. Depois marca como concluído com RPE."
        : "You'll see the goal, execution tips and nutrition. Then mark it done with RPE.",
    },
    {
      icon: Brain,
      title: isPt ? "Fala com o Treinador AI" : "Talk to the AI Coach",
      body: isPt
        ? "Diariamente dá feedback baseado na tua biometria, treinos e prova A. Se algo correr mal, usa 'Não consigo fazer' no treino."
        : "Daily feedback based on your biometrics, workouts and A-race. If something goes wrong, use 'Can't do this' on the workout.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isPt ? "Bem-vindo ao Trail Forge" : "Welcome to Trail Forge"}</DialogTitle>
          <DialogDescription>
            {isPt
              ? "3 hábitos para tirar o máximo da app:"
              : "3 habits to get the most out of the app:"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {tips.map((tip, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/40 border border-border/40">
              <div className="shrink-0 w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                <tip.icon className="w-4 h-4 text-primary" />
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-semibold">{tip.title}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{tip.body}</div>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={close} className="w-full">
            {isPt ? "Vamos a isto" : "Let's go"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
