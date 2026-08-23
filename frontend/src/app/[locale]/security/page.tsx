import type { Metadata } from "next";
import { Snowflake, KeyRound, ShieldCheck, ScanFace, Siren, ScrollText } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { Reveal } from "@/components/site/Reveal";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "security.meta" });
  return {
    title: t("title"),
    description: t("description"),
    openGraph: { title: t("title"), description: t("ogDescription") },
  };
}

/** Icon per control; the wording lives in messages/*.json. */
const CONTROLS = [
  { key: "coldStorage", icon: Snowflake },
  { key: "keyManagement", icon: KeyRound },
  { key: "twoFactor", icon: ShieldCheck },
  { key: "identity", icon: ScanFace },
  { key: "monitoring", icon: Siren },
  { key: "records", icon: ScrollText },
] as const;

export default async function Security({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("security");

  // Verification statuses render in the mono face and stay untranslated 
  // they're the literal values the platform stores.
  const status = (value: string) => <span className="num">{value}</span>;

  return (
    <SiteLayout>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <section aria-labelledby="controls-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="controls-heading" className="text-2xl font-semibold">
          {t("controlsHeading")}
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CONTROLS.map((control, index) => (
            <Reveal key={control.key} delay={index * 70}>
              <article className="surface-panel h-full p-6">
                <div className="flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                  <control.icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-5 text-base font-semibold">
                  {t(`controls.${control.key}.title`)}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  {t(`controls.${control.key}.body`)}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section aria-labelledby="aml-heading" className="border-y border-border/70 bg-surface/30">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 id="aml-heading" className="text-2xl font-semibold">
            {t("amlHeading")}
          </h2>
          <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>{t("aml1")}</p>
            <p>{t("aml2")}</p>
            <p>
              {t.rich("aml3", {
                pending: () => status(t("statusPending")),
                verified: () => status(t("statusVerified")),
                rejected: () => status(t("statusRejected")),
              })}
            </p>
          </div>

          <h2 className="mt-12 text-2xl font-semibold">{t("disclaimerHeading")}</h2>
          <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>{t("disclaimer1")}</p>
            <p>{t("disclaimer2")}</p>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
