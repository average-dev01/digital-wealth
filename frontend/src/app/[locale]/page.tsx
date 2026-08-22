import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ShieldCheck,
  Landmark,
  LineChart,
  Lock,
  ArrowRight,
  Snowflake,
  FileCheck2,
} from "lucide-react";
import heroImage from "@/assets/hero-vault.jpg";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { MARKETING_ASSETS, formatUsd, formatPercent } from "@/lib/market";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.meta" });
  return {
    title: t("title"),
    description: t("description"),
    openGraph: { title: t("title"), description: t("ogDescription") },
  };
}

// STATS ARE PLACEHOLDERS — replace with verified figures before production use.
const STATS = ["aua", "clients", "coldStorage", "support"] as const;
const STEPS = [
  { key: "open", icon: FileCheck2 },
  { key: "verify", icon: ShieldCheck },
  { key: "fund", icon: LineChart },
] as const;
const TRUST = [
  { key: "cold", icon: Snowflake },
  { key: "segregated", icon: Landmark },
  { key: "kyc", icon: ShieldCheck },
] as const;
const TESTIMONIALS = ["family", "private", "advisor"] as const;

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <SiteLayout>
      <section className="relative overflow-hidden border-b border-border/70">
        <Image
          src={heroImage}
          alt=""
          fill
          priority
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
        <div className="hairline-grid absolute inset-0 opacity-60" />

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
              <Lock className="size-3.5" aria-hidden /> {t("eyebrow")}
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
              {t.rich("heroTitle", {
                gold: (chunks) => <span className="text-gradient-gold">{chunks}</span>,
              })}
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("heroBody")}
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/auth?mode=signup">
                  {t("openAccount")} <ArrowRight className="rtl-flip ms-1.5 size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/services">{t("seeCustody")}</Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={260}>
            <dl className="mt-16 grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-4">
              {STATS.map((key) => (
                <div key={key} className="bg-card/85 px-5 py-6">
                  <dd className="num text-2xl font-semibold text-primary">
                    {t(`stats.${key}.value`)}
                  </dd>
                  <dt className="mt-2 text-sm text-foreground">{t(`stats.${key}.label`)}</dt>
                  <p className="mt-1 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                    {t("placeholderFigure")}
                  </p>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* Supported currencies strip */}
      <section aria-labelledby="assets-heading" className="border-b border-border/70 bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h2
            id="assets-heading"
            className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground"
          >
            {t("assetsHeading")}
          </h2>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {MARKETING_ASSETS.map((currency) => {
              const change = currency.displayChange24h;
              return (
                <li
                  key={currency.code}
                  className="surface-panel px-3 py-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="num text-sm font-semibold">{currency.code}</span>
                    <span aria-hidden className="text-muted-foreground">
                      {currency.symbol}
                    </span>
                  </div>
                  <p className="num mt-2 text-sm">{formatUsd(currency.displayPriceUsd)}</p>
                  <p
                    className={cn(
                      "num mt-1 text-xs",
                      change >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {formatPercent(change)}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="steps-heading" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            {t("onboarding")}
          </p>
          <h2 id="steps-heading" className="mt-3 text-3xl font-semibold sm:text-4xl">
            {t("stepsHeading")}
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal key={step.key} delay={index * 90}>
              <article className="surface-panel h-full p-6">
                <div className="flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                  <step.icon className="size-5" aria-hidden />
                </div>
                <p className="num mt-6 text-xs text-muted-foreground">
                  {t("stepLabel", { number: `0${index + 1}` })}
                </p>
                <h3 className="mt-1.5 text-lg font-semibold">{t(`steps.${step.key}.title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t(`steps.${step.key}.body`)}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section aria-labelledby="trust-heading" className="border-y border-border/70 bg-surface/30">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <Reveal>
            <h2 id="trust-heading" className="text-3xl font-semibold sm:text-4xl">
              {t("trustHeading")}
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{t("trustBody")}</p>
            <ul className="mt-8 space-y-4">
              {TRUST.map((item) => (
                <li key={item.key} className="flex gap-4">
                  <item.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <h3 className="text-sm font-semibold">{t(`trust.${item.key}.title`)}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(`trust.${item.key}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-9">
              <Link href="/security">{t("readSecurity")}</Link>
            </Button>
          </Reveal>

          <Reveal delay={120} className="space-y-4">
            {TESTIMONIALS.map((key) => (
              <figure key={key} className="surface-panel p-6">
                <blockquote className="text-sm leading-relaxed text-foreground">
                  “{t(`testimonials.${key}.quote`)}”
                </blockquote>
                <figcaption className="mt-4 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {t(`testimonials.${key}.name`)}
                  </span>{" "}
                  · {t(`testimonials.${key}.role`)}
                </figcaption>
              </figure>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <div className="surface-panel flex flex-col items-start justify-between gap-6 p-8 sm:p-12 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold sm:text-3xl">{t("ctaTitle")}</h2>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">{t("ctaBody")}</p>
            </div>
            <Button asChild size="lg">
              <Link href="/auth?mode=signup">
                {t("getStarted")} <ArrowRight className="rtl-flip ms-1.5 size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </SiteLayout>
  );
}
