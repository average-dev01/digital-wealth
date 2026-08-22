import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SiteLayout, PageHero } from "@/components/site/SiteLayout";
import { Reveal } from "@/components/site/Reveal";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about.meta" });
  return {
    title: t("title"),
    description: t("description"),
    openGraph: { title: t("title"), description: t("ogDescription") },
  };
}

/** Keys only — the copy lives in messages/*.json. */
const PILLARS = ["mission", "principles", "clients"] as const;
const TEAM = ["ceo", "cco", "custody", "reporting"] as const;

export default async function About({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  return (
    <SiteLayout>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-2xl font-semibold">{t("storyHeading")}</h2>
            <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>{t("story1")}</p>
              <p>{t("story2")}</p>
              <p>{t("story3")}</p>
            </div>
          </Reveal>

          <Reveal delay={100} className="space-y-4">
            {PILLARS.map((key) => (
              <article key={key} className="surface-panel p-6">
                <h3 className="text-lg font-semibold">{t(`pillars.${key}.title`)}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  {t(`pillars.${key}.body`)}
                </p>
              </article>
            ))}
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="team-heading" className="border-t border-border/70 bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="team-heading" className="text-2xl font-semibold">
            {t("leadership")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("leadershipNote")}</p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TEAM.map((key, index) => {
              const name = t(`team.${key}.name`);
              return (
                <Reveal key={key} delay={index * 70}>
                  <article className="surface-panel h-full p-5">
                    <div
                      aria-hidden
                      className="num flex size-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-sm font-semibold text-primary"
                    >
                      {name
                        .replace(/\[.*?\]\s*/, "")
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </div>
                    <h3 className="mt-4 text-sm font-semibold">{name}</h3>
                    <p className="mt-1 text-xs uppercase tracking-wider text-primary">
                      {t(`team.${key}.role`)}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {t(`team.${key}.bio`)}
                    </p>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
