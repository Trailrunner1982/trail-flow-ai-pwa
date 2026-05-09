import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useRole";
import { LoadingScreen } from "./LoadingScreen";

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return <LoadingScreen />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
