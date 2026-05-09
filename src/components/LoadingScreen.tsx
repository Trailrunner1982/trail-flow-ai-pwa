import { Mountain } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6">
      <div className="relative">
        <Mountain className="w-14 h-14 text-primary animate-pulse-glow rounded-full" strokeWidth={1.5} />
      </div>
      <p className="text-sm text-muted-foreground tracking-wide uppercase">A preparar a montanha…</p>
    </div>
  );
}
