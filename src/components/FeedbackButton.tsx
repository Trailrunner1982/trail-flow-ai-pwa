import { useState } from "react";
import { MessageSquareWarning, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n";
import { toast } from "sonner";

export function FeedbackButton() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!user) return null;

  const submit = async () => {
    if (!message.trim()) return toast.error(t("feedback.toast.needMessage"));
    setSending(true);
    const { error } = await supabase.from("feedback").insert({
      user_id: user.id,
      category,
      message: message.trim(),
      page_url: window.location.pathname,
      user_agent: navigator.userAgent,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success(t("feedback.toast.sent"));
    setMessage("");
    setOpen(false);
  };

  return (
    <>
      <Button
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-24 lg:bottom-6 z-50 h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90"
        title={t("feedback.title")}
        aria-label={t("feedback.title")}
      >
        <MessageSquareWarning className="w-5 h-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("feedback.title")}</DialogTitle>
            <DialogDescription>{t("feedback.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("feedback.type")}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">{t("feedback.bug")}</SelectItem>
                  <SelectItem value="suggestion">{t("feedback.suggestion")}</SelectItem>
                  <SelectItem value="ux">{t("feedback.ux")}</SelectItem>
                  <SelectItem value="other">{t("feedback.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("feedback.message")}</Label>
              <Textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("feedback.placeholder")}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">{t("feedback.privacy")}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={submit} disabled={sending}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t("common.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
