"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { toast } from "sonner";
import { updateUser } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/Logo";
import { Link, useRouter } from "@/i18n/navigation";

export function ResetPasswordPage() {
  const t = useTranslations("resetPassword");
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next: { password?: string; confirm?: string } = {};
    const parsed = z.string().min(8, t("errors.passwordMin")).max(72).safeParse(password);
    if (!parsed.success) next.password = parsed.error.issues[0]!.message;
    if (password !== confirm) next.confirm = t("errors.mismatch");
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (!token) {
      toast.error(t("toast.invalidLink"));
      return;
    }

    setPending(true);
    try {
      const session = await updateUser({ password, token });
      queryClient.setQueryData(["me"], session);
      toast.success(t("toast.success"));
      // Role-routed like the login page, so an admin does not flash through the
      // customer dashboard on their way to the panel.
      router.push(session.user.role === "ADMIN" ? "/admin" : "/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toast.error"));
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
        <form
          onSubmit={handleSubmit}
          noValidate
          className="surface-panel w-full max-w-md space-y-5 p-6 sm:p-8"
        >
          <div>
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("newPassword")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
            {errors.password && (
              <p id="password-error" role="alert" className="text-sm text-destructive">
                {errors.password}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">{t("confirmPassword")}</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={Boolean(errors.confirm)}
              aria-describedby={errors.confirm ? "confirm-error" : undefined}
            />
            {errors.confirm && (
              <p id="confirm-error" role="alert" className="text-sm text-destructive">
                {errors.confirm}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t("updating") : t("submit")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/auth?mode=login" className="text-primary hover:opacity-80">
              {t("backToLogin")}
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
