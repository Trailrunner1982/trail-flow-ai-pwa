import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

const ALERT_DAYS = [30, 15, 7, 3, 2, 1];

export function SubscriptionBanner() {
  const [endDate, setEndDate] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("subscription_end_date")
        .eq("id", user.id)
        .maybeSingle();
      setEndDate(data?.subscription_end_date ?? null);
    })();
  }, []);

  if (!endDate) return null;

  const days = differenceInCalendarDays(parseISO(endDate), new Date());
  const formatted = format(parseISO(endDate), "dd/MM/yyyy", { locale: pt });

  // Expired
  if (days < 0) {
    return (
      <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center gap-3 text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          A tua subscrição terminou em <strong>{formatted}</strong>. Por favor regulariza o pagamento para continuar a ter acesso ao plano.
        </span>
      </div>
    );
  }

  // Show only on alert thresholds
  if (!ALERT_DAYS.includes(days)) return null;

  const isUrgent = days <= 7;
  return (
    <div className={`px-4 py-3 flex items-center gap-3 text-sm ${
      isUrgent ? "bg-destructive/15 text-destructive border-b border-destructive/30" : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-b border-amber-500/30"
    }`}>
      <CalendarClock className="w-4 h-4 shrink-0" />
      <span>
        A tua subscrição termina em <strong>{days} {days === 1 ? "dia" : "dias"}</strong> ({formatted}). Trata da renovação para não perder o acesso.
      </span>
    </div>
  );
}
