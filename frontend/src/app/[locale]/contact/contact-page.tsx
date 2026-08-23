"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Mail, MapPin, Phone, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContact } from "@/lib/api/contact";

type ContactValues = { name: string; email: string; message: string };
type FieldErrors = Partial<Record<keyof ContactValues, string>>;

/** Contact details are data, not copy  they read the same in every language. */
const DETAILS = [
  { key: "email", icon: Mail, value: "clients@digitalwealthpartners.com" },
  { key: "phone", icon: Phone, value: "+1 (555) 010-4400" },
  { key: "office", icon: MapPin, value: "1 Placeholder Square, London EC2" },
] as const;

export function ContactPage() {
  const t = useTranslations("contact");
  const [values, setValues] = useState<ContactValues>({ name: "", email: "", message: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sent, setSent] = useState(false);

  // Built here rather than at module scope so the validation messages come
  // from the active locale's catalogue.
  const contactSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(2, t("errors.nameMin")).max(100, t("errors.nameMax")),
        email: z.string().trim().email(t("errors.emailInvalid")).max(255, t("errors.emailMax")),
        message: z
          .string()
          .trim()
          .min(10, t("errors.messageMin"))
          .max(2000, t("errors.messageMax")),
      }),
    [t],
  );

  const mutation = useMutation({
    mutationFn: (payload: ContactValues) => submitContact(payload),
    onSuccess: () => {
      setSent(true);
      setValues({ name: "", email: "", message: "" });
      toast.success(t("toastSuccess"));
    },
    onError: () => toast.error(t("toastError")),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = contactSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  return (
    <SiteLayout>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="surface-panel p-6 sm:p-8">
          {sent ? (
            <div className="flex flex-col items-start gap-4">
              <CheckCircle2 className="size-8 text-success" aria-hidden />
              <h2 className="text-xl font-semibold">{t("sentTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("sentBody")}</p>
              <Button variant="outline" onClick={() => setSent(false)}>
                {t("sendAnother")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <h2 className="text-xl font-semibold">{t("formHeading")}</h2>

              <div className="space-y-2">
                <Label htmlFor="name">{t("fullName")}</Label>
                <Input
                  id="name"
                  value={values.name}
                  onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  autoComplete="name"
                />
                {errors.name && (
                  <p id="name-error" role="alert" className="text-sm text-destructive">
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={values.email}
                  onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  autoComplete="email"
                />
                {errors.email && (
                  <p id="email-error" role="alert" className="text-sm text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">{t("messageLabel")}</Label>
                <Textarea
                  id="message"
                  rows={6}
                  value={values.message}
                  onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={errors.message ? "message-error" : undefined}
                />
                {errors.message && (
                  <p id="message-error" role="alert" className="text-sm text-destructive">
                    {errors.message}
                  </p>
                )}
              </div>

              <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
                {mutation.isPending ? t("sending") : t("send")}
              </Button>
            </form>
          )}
        </div>

        <div className="space-y-4">
          {DETAILS.map((item) => (
            <div key={item.key} className="surface-panel flex items-start gap-4 p-5">
              <item.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-semibold">{t(`cards.${item.key}`)}</p>
                <p className="num mt-1 text-sm text-muted-foreground">{item.value}</p>
              </div>
            </div>
          ))}
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            {t("credentialWarning")}
          </p>
        </div>
      </section>
    </SiteLayout>
  );
}
