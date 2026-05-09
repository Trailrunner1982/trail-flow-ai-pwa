import { useImpersonation } from "@/hooks/useImpersonation";
import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";

export function ImpersonationBanner() {
  const { impersonated, setImpersonated, isImpersonating } = useImpersonation();
  if (!isImpersonating || !impersonated) return null;
  return (
    <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4" />
        <span>Modo Espelho — a ver como <strong>{impersonated.full_name || impersonated.id.slice(0, 8)}</strong></span>
      </div>
      <Button size="sm" variant="secondary" onClick={() => setImpersonated(null)}>
        <X className="w-3 h-3 mr-1" /> Sair
      </Button>
    </div>
  );
}
