import { useTranslations } from "next-intl";

import { Logo } from "./Logo";
import { Link } from "@/i18n/navigation";
import { MARKETING_ASSETS } from "@/lib/market";

export function SiteFooter() {
  const t = useTranslations("footer");
  const strong = (chunks: React.ReactNode) => (
    <span className="font-semibold text-foreground">{chunks}</span>
  );

  return (
    <footer className="border-t border-border/70 bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t("tagline")}
            </p>
            <p className="num mt-4 text-xs text-muted-foreground">
              {t("supportedAssets", { assets: MARKETING_ASSETS.map((c) => c.code).join(" · ") })}
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold">{t("company")}</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="transition-colors hover:text-foreground">
                  {t("about")}
                </Link>
              </li>
              <li>
                <Link href="/services" className="transition-colors hover:text-foreground">
                  {t("howItWorks")}
                </Link>
              </li>
              <li>
                <Link href="/security" className="transition-colors hover:text-foreground">
                  {t("securityCompliance")}
                </Link>
              </li>
              <li>
                <Link href="/faq" className="transition-colors hover:text-foreground">
                  {t("faq")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold">{t("clientAccess")}</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/auth?mode=login" className="transition-colors hover:text-foreground">
                  {t("logIn")}
                </Link>
              </li>
              <li>
                <Link href="/auth?mode=signup" className="transition-colors hover:text-foreground">
                  {t("openAccount")}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition-colors hover:text-foreground">
                  {t("contactUs")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 space-y-4 border-t border-border/70 pt-8 text-xs leading-relaxed text-muted-foreground">
          <p>{t.rich("riskDisclaimer", { strong })}</p>
          <p className="num">{t("copyright", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
