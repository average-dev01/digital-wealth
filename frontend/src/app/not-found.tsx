/**
 * Root 404. It renders above `app/[locale]/`, where no locale is known and
 * `app/layout.tsx` is a pass-through — so this has to supply `<html>`/`<body>`
 * itself, exactly as global-error.tsx does. Without them the response is a
 * document fragment with no <head>, so none of the styling applies.
 *
 * For the same reason the copy stays English and the link is a plain <a>:
 * next-intl's hooks and its locale-aware <Link> throw outside the provider,
 * which only exists under [locale]. A hard navigation to "/" goes through the
 * middleware, which sends the visitor on to their own locale.
 */
export default function NotFound() {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <h1 className="text-7xl font-bold text-foreground">404</h1>
            <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The page you're looking for doesn't exist or has been moved.
            </p>
            <div className="mt-6">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
