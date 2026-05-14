import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Mountain, LayoutDashboard, Flag, HeartPulse, Calendar, Brain, LogOut, Users, Library, User, Inbox, Menu, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/useRole";
import { useLanguage } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { FeedbackButton } from "./FeedbackButton";
import { InstallPWA } from "./InstallPWA";
import { useState } from "react";

// Sidebar desktop — todos os itens
const NAV_DESKTOP = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/races", labelKey: "nav.races", icon: Flag },
  { to: "/biometrics", labelKey: "nav.biometrics", icon: HeartPulse },
  { to: "/calendar", labelKey: "nav.workouts", icon: Calendar },
  { to: "/coach", labelKey: "nav.coach", icon: Brain },
  { to: "/profile", labelKey: "nav.profile", icon: User },
];

// Bottom nav mobile — 5 itens
const NAV_MOBILE = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/races", labelKey: "nav.races", icon: Flag },
  { to: "/calendar", labelKey: "nav.workouts", icon: Calendar },
  { to: "/coach", labelKey: "nav.coach", icon: Brain },
  { to: "/profile", labelKey: "nav.profile", icon: User },
];

export function AppShell() {
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success(t("nav.logout") + " — " + (t("nav.logout") === "Sair" ? "Até à próxima!" : "See you soon!"));
    navigate("/auth");
  };

  const ADMIN_NAV = [
    { to: "/admin/users", labelKey: "nav.athletes", icon: Users },
    { to: "/admin/content", labelKey: "nav.library", icon: Library },
    { to: "/admin/feedback", labelKey: "nav.feedback", icon: Inbox },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <ImpersonationBanner />
      <SubscriptionBanner />
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:flex lg:flex-col w-64 border-r border-border/60 bg-sidebar p-6 gap-2 sticky top-0 h-screen">
          <div className="flex items-center gap-2 mb-8">
            <Mountain className="w-7 h-7 text-primary" />
            <div>
              <div className="font-bold tracking-tight">Trail Forge</div>
              <div className="text-xs text-muted-foreground">{t("app.subtitle")}</div>
            </div>
          </div>
          <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
            {NAV_DESKTOP.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}>
                <item.icon className="w-4 h-4" />
                {t(item.labelKey)}
              </NavLink>
            ))}
            {isAdmin && (
              <div className="mt-4 border-t border-border/40 pt-4 space-y-1">
                <div className="px-3 text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">{t("nav.admin")}</div>
                {ADMIN_NAV.map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                    }`}>
                    <item.icon className="w-4 h-4" />
                    {t(item.labelKey)}
                  </NavLink>
                ))}
              </div>
            )}
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <InstallPWA />
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="justify-start text-muted-foreground hover:text-destructive">
            <LogOut className="w-4 h-4" /> {t("nav.logout")}
          </Button>
        </aside>

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-border/60 bg-card/80 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <Mountain className="w-6 h-6 text-primary" />
            <span className="font-bold">Trail Forge</span>
          </div>
          <div className="flex items-center gap-1">
            <InstallPWA />
            <LanguageToggle />
            {isAdmin && (
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" title={t("nav.admin")}>
                    <Menu className="w-5 h-5 text-primary" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 mt-2">{t("nav.admin")}</div>
                  <div className="space-y-1">
                    {ADMIN_NAV.map((item) => (
                      <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}>
                        <item.icon className="w-4 h-4" />
                        {t(item.labelKey)}
                      </NavLink>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 pb-24 lg:pb-8">
          <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-10">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav — 5 itens */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-lg">
          <div className="grid grid-cols-5">
            {NAV_MOBILE.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}>
                <item.icon className="w-5 h-5" />
                {t(item.labelKey)}
              </NavLink>
            ))}
          </div>
        </nav>
        <FeedbackButton />
      </div>
    </div>
  );
}
