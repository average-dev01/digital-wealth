import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { MARKETING_ASSETS, formatCryptoAmount } from "@/lib/market";
import { Link } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "services.meta" });
  return {
    title: t("title"),
    description: t("description"),
    openGraph: { title: t("title"), description: t("ogDescription") },
  };
}

const STEPS = ["deposit", "confirmation", "withdrawal"] as const;
// FEES ARE CLEARLY-LABELLED PLACEHOLDERS for the demonstration build.
const FEES = ["administration", "deposit", "withdrawal", "conversion", "statements"] as const;

export default async function Services({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("services");

  return (
    <SiteLayout>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <section aria-labelledby="custody-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal>
          <h2 id="custody-heading" className="text-2xl font-semibold">
            {t("custodyHeading")}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {t("custodyBody")}
          </p>
        </Reveal>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((key, index) => (
            <Reveal key={key} delay={index * 90}>
              <article className="surface-panel h-full p-6">
                <span className="num text-xs text-primary">{`0${index + 1}`}</span>
                <h3 className="mt-2 text-lg font-semibold">{t(`steps.${key}.title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t(`steps.${key}.body`)}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="networks-heading"
        className="border-y border-border/70 bg-surface/30"
      >
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="networks-heading" className="text-2xl font-semibold">
            {t("networksHeading")}
          </h2>
          <div className="surface-panel mt-8 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colAsset")}</TableHead>
                  <TableHead>{t("colNetwork")}</TableHead>
                  <TableHead className="text-end">{t("colMinimum")}</TableHead>
                  <TableHead className="text-end">{t("colPrecision")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MARKETING_ASSETS.map((currency) => (
                  <TableRow key={currency.code}>
                    <TableCell className="font-medium">
                      <span className="num">{currency.code}</span>{" "}
                      <span className="text-muted-foreground">{currency.name}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{currency.network}</TableCell>
                    <TableCell className="num text-end">
                      {formatCryptoAmount(currency.minDeposit, currency.decimals)} {currency.code}
                    </TableCell>
                    <TableCell className="num text-end text-muted-foreground">
                      {t("decimalPlaces", { count: currency.decimals })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      <section aria-labelledby="fees-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="fees-heading" className="text-2xl font-semibold">
          {t("feesHeading")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("feesNote")}</p>
        <div className="surface-panel mt-8 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colItem")}</TableHead>
                <TableHead>{t("colRate")}</TableHead>
                <TableHead>{t("colBasis")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEES.map((key) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{t(`fees.${key}.item`)}</TableCell>
                  <TableCell className="num text-primary">{t(`fees.${key}.rate`)}</TableCell>
                  <TableCell className="text-muted-foreground">{t(`fees.${key}.basis`)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-10">
          <Button asChild size="lg">
            <Link href="/auth?mode=signup">{t("openAccount")}</Link>
          </Button>
        </div>
      </section>
    </SiteLayout>
  );
}
