import { useAuth } from "./useAuth";
import { useImpersonation } from "./useImpersonation";

/**
 * Returns the user_id whose data should be queried.
 * When admin is in Mirror Mode, returns the impersonated athlete's id.
 * Writes should be disabled when isImpersonating to avoid polluting data.
 */
export function useEffectiveUser() {
  const { user } = useAuth();
  const { effectiveUserId, isImpersonating, impersonated } = useImpersonation();
  return {
    userId: effectiveUserId || user?.id || null,
    selfId: user?.id || null,
    isImpersonating,
    impersonated,
    canWrite: !isImpersonating,
  };
}
