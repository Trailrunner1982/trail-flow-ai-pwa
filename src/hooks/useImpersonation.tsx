import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "./useAuth";
import { useIsAdmin } from "./useRole";

interface ImpersonatedAthlete {
  id: string;
  full_name: string | null;
}

interface ImpersonationCtx {
  impersonated: ImpersonatedAthlete | null;
  setImpersonated: (a: ImpersonatedAthlete | null) => void;
  /** The user_id whose data should be queried (impersonated if set, else self). */
  effectiveUserId: string | null;
  isImpersonating: boolean;
}

const Ctx = createContext<ImpersonationCtx>({
  impersonated: null,
  setImpersonated: () => {},
  effectiveUserId: null,
  isImpersonating: false,
});

const STORAGE_KEY = "tf_impersonate";

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [impersonated, setImpersonatedState] = useState<ImpersonatedAthlete | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setImpersonatedState(null);
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { setImpersonatedState(JSON.parse(raw)); } catch { /* noop */ }
    }
  }, [isAdmin]);

  const setImpersonated = (a: ImpersonatedAthlete | null) => {
    setImpersonatedState(a);
    if (a) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    else sessionStorage.removeItem(STORAGE_KEY);
  };

  const effectiveUserId = (isAdmin && impersonated?.id) || user?.id || null;

  return (
    <Ctx.Provider value={{
      impersonated: isAdmin ? impersonated : null,
      setImpersonated,
      effectiveUserId,
      isImpersonating: !!(isAdmin && impersonated),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useImpersonation = () => useContext(Ctx);
