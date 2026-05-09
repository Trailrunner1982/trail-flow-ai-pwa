import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  const toggle = () => {
    setLang(lang === "pt" ? "en" : "pt");
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="gap-1.5 text-xs font-medium"
      title={lang === "pt" ? "Switch to English" : "Mudar para Português"}
    >
      <Globe className="w-3.5 h-3.5" />
      <span className="uppercase">{lang === "pt" ? "PT 🇵🇹" : "EN 🇬🇧"}</span>
    </Button>
  );
}
