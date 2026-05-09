import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "./LoadingScreen";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  return <>{children}</>;
}
