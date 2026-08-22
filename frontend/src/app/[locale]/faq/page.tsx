import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "faq.meta" });
  return {
    title: t("title"),
    description: t("description"),
    openGraph: { title: t("title"), description: t("ogDescription") },
  };
}

const QUESTIONS = [
  "custody",
  "verification",
  "deposit",
  "withdrawal",
  "assets",
  "fees",
  "live",
  "twoFactor",
] as const;

export default async function Faq({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("faq");

  return (
    <SiteLayout>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Accordion type="single" collapsible className="surface-panel divide-y divide-border px-2">
          {QUESTIONS.map((key, index) => (
            <AccordionItem key={key} value={`item-${index}`} className="border-b-0 px-4">
              <AccordionTrigger className="text-start text-sm font-medium hover:no-underline">
                {t(`questions.${key}.q`)}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {t(`questions.${key}.a`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/contact">{t("askTeam")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/auth?mode=signup">{t("openAccount")}</Link>
          </Button>
        </div>
      </section>
    </SiteLayout>
  );
}
