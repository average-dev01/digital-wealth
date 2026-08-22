import rateLimit from "express-rate-limit";

/**
 * Disabled under test: the limiter's store is a module-level singleton shared
 * by every test file in the process, so a suite that signs up more than a
 * handful of users would start getting throttled and fail with confusing
 * 401s rather than a clear rate-limit error.
 */
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;

/** Applied to the auth endpoints most attractive to credential-stuffing/enumeration. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many attempts. Please wait a while before trying again." },
});

/**
 * Guards the two admin endpoints that call out to the market data provider.
 * The free tier has a monthly call budget, and the asset-search box fires on
 * every keystroke — a stuck key must not be able to exhaust it.
 */
export const priceFeedRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many market data requests. Please slow down." },
});

/** Looser, but the contact form is a public unauthenticated write — i.e. a spam target. */
export const contactRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many messages sent. Please try again later." },
});
