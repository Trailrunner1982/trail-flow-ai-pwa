import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { supabase } from "@/integrations/supabase/client";
import { LoadingScreen } from "./LoadingScreen";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { impersonated } = useImpersonation();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (loading || !user) { setChecking(false); return; }

    const userId = impersonated?.id ?? user.id;

    supabase
      .from("profiles")
      .select("subscription_end_date, is_suspended")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.is_suspended) {
          setExpired(true);
        } else if (data?.subscription_end_date) {
          const end = new Date(data.subscription_end_date);
          end.setHours(23, 59, 59, 999);
          if (end < new Date()) setExpired(true);
        }
        setChecking(false);
      });
  }, [user, loading, impersonated]);

  if (loading || checking) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;

  // Admin nunca fica bloqueado mesmo que tenha subscrição expirada
  if (expired && !location.pathname.startsWith("/admin") && location.pathname !== "/profile") {
    return <Navigate to="/subscription-expired" replace />;
  }

  return <>{children}</>;
}
