"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { resetPasswordForEmail } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/Logo";
import { Link } from "@/i18n/navigation";

export function ForgotPasswordPage() {
  const t = useTranslations("forgotPassword");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = z.string().trim().email().safeParse(email);
    if (!parsed.success) {
      setError(t("errorInvalidEmail"));
      return;
    }
    setError(null);
    setPending(true);
    try {
      await resetPasswordForEmail(parsed.data);
      setSent(true);
    } catch (resetError) {
      toast.error(resetError instanceof Error ? resetError.message : t("toastError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <Logo />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 sm:px-6">
        <div className="surface-panel w-full max-w-md p-6 sm:p-8">
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto size-9 text-primary" aria-hidden />
              <h1 className="mt-5 text-xl font-semibold">{t("sentTitle")}</h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t.rich("sentBody", {
                  email: () => <span className="num text-foreground">{email}</span>,
                })}
              </p>
              <Button asChild variant="outline" className="mt-6">
                <Link href="/auth?mode=login">{t("backToLogin")}</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <h1 className="text-2xl font-semibold">{t("title")}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "email-error" : undefined}
                />
                {error && (
                  <p id="email-error" role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t("sending") : t("submit")}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/auth?mode=login" className="text-primary hover:opacity-80">
                  {t("backToLogin")}
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
