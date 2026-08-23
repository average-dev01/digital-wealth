import type { NextFunction, Request, Response } from "express";

/**
 * Logs every request as it finishes: `METHOD path status Nms`, with the
 * response's `{error}` message appended for any 4xx/5xx so a failure is
 * identifiable from the terminal alone. Never logs the request body —
 * auth routes carry passwords in it.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const originalJson = res.json.bind(res);
  let body: unknown;

  res.json = (data: unknown) => {
    body = data;
    return originalJson(data);
  };

  res.on("finish", () => {
    const ms = Date.now() - start;
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`;

    if (res.statusCode >= 400) {
      const message =
        body && typeof body === "object" && "error" in body
          ? (body as { error?: unknown }).error
          : undefined;
      console.error(`[http] ${line}${typeof message === "string" ? `  ${message}` : ""}`);
    } else {
      console.log(`[http] ${line}`);
    }
  });

  next();
}
