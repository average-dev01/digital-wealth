"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, MailCheck } from "lucide-react";
import { login, signup } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/site/Logo";
import { useAuth } from "@/hooks/useAuth";
import { Link, useRouter } from "@/i18n/navigation";

type Errors = Partial<Record<"email" | "password" | "fullName" | "terms", string>>;

export function AuthPage() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const isSignup = mode === "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [checkInbox, setCheckInbox] = useState(false);
  // Set right before this page navigates itself post-signup/login, so the
  // "already signed in" effect below doesn't also fire on the same state
  // update and send the user to /dashboard instead of e.g. /dashboard/kyc —
  // that effect is for someone landing here already authenticated, not for
  // the action that just authenticated them.
  const navigatingSelfRef = useRef(false);

  // Built inside the component so the messages come from the active locale.
  const emailSchema = useMemo(
    () => z.string().trim().email(t("errors.emailInvalid")).max(255),
    [t],
  );
  const passwordSchema = useMemo(
    () => z.string().min(8, t("errors.passwordMin")).max(72, t("errors.passwordMax")),
    [t],
  );

  useEffect(() => {
    if (navigatingSelfRef.current) return;
    if (!loading && user) router.replace(user.role === "ADMIN" ? "/admin" : "/dashboard");
  }, [user, loading, router]);

  function validate(): boolean {
    const next: Errors = {};
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) next.email = emailResult.error.issues[0]!.message;
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) next.password = passwordResult.error.issues[0]!.message;
    if (isSignup) {
      if (fullName.trim().length < 2) next.fullName = t("errors.fullNameRequired");
      if (!accepted) next.terms = t("errors.termsRequired");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setPending(true);
    try {
      if (isSignup) {
        const session = await signup(email.trim(), password, fullName.trim());
        // Hydrate the cache directly with what signup already returned,
        // instead of invalidating and refetching over the network.
        navigatingSelfRef.current = true;
        queryClient.setQueryData(["me"], session);
        toast.success(t("toast.accountCreated"));
        router.push("/dashboard/kyc");
      } else {
        const session = await login(email.trim(), password);
        navigatingSelfRef.current = true;
        queryClient.setQueryData(["me"], session);
        toast.success(t("toast.welcomeBack"));
        // Admins go straight to the desk, rather than bouncing through the
        // customer dashboard first  login now tells us the role up front.
        router.push(session.user.role === "ADMIN" ? "/admin" : "/dashboard");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toast.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <Logo />
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="rtl-flip me-1.5 size-4" aria-hidden /> {t("backToSite")}
          </Link>
        </Button>
      </div>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:px-6">
        <div className="w-full max-w-md">
          {checkInbox ? (
            <div className="surface-panel p-8 text-center">
              <MailCheck className="mx-auto size-9 text-primary" aria-hidden />
              <h1 className="mt-5 text-xl font-semibold">{t("verifyEmailTitle")}</h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t.rich("verifyEmailBody", {
                  email: () => <span className="num text-foreground">{email}</span>,
                })}
              </p>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => {
                  setCheckInbox(false);
                  router.push("/auth?mode=login");
                }}
              >
                {t("goToLogin")}
              </Button>
            </div>
          ) : (
            <div className="surface-panel p-6 sm:p-8">
              <h1 className="text-2xl font-semibold">
                {isSignup ? t("signupTitle") : t("loginTitle")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {isSignup ? t("signupSubtitle") : t("loginSubtitle")}
              </p>

              <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
                {isSignup && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">{t("fullLegalName")}</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      autoComplete="name"
                      onChange={(e) => setFullName(e.target.value)}
                      aria-invalid={Boolean(errors.fullName)}
                      aria-describedby={errors.fullName ? "fullName-error" : undefined}
                    />
                    {errors.fullName && (
                      <p id="fullName-error" role="alert" className="text-sm text-destructive">
                        {errors.fullName}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                  />
                  {errors.email && (
                    <p id="email-error" role="alert" className="text-sm text-destructive">
                      {errors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t("password")}</Label>
                    {!isSignup && (
                      <Link
                        href="/forgot-password"
                        className="text-xs text-primary transition-opacity hover:opacity-80"
                      >
                        {t("forgotPassword")}
                      </Link>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    autoComplete={isSignup ? "new-password" : "current-password"}
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

                {isSignup && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="terms"
                        checked={accepted}
                        onCheckedChange={(value) => setAccepted(value === true)}
                        aria-describedby={errors.terms ? "terms-error" : undefined}
                      />
                      <Label
                        htmlFor="terms"
                        className="text-sm font-normal leading-relaxed text-muted-foreground"
                      >
                        {t("terms")}
                      </Label>
                    </div>
                    {errors.terms && (
                      <p id="terms-error" role="alert" className="text-sm text-destructive">
                        {errors.terms}
                      </p>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? t("pleaseWait") : isSignup ? t("createAccount") : t("logIn")}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {isSignup ? t("alreadyClient") : t("newHere")}{" "}
                <Link
                  href={`/auth?mode=${isSignup ? "login" : "signup"}`}
                  className="text-primary hover:opacity-80"
                >
                  {isSignup ? t("logIn") : t("openAccount")}
                </Link>
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
