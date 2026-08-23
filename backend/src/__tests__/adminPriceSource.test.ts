/**
 * Admin-side rules for live vs manual pricing.
 *
 * The cross-field rules ("live needs an asset id", "manual needs a price") are
 * enforced in the route handler rather than in the zod schema, because PATCH
 * sends a subset and validity depends on the row already in the database.
 * These cases pin that behaviour down for both verbs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

const app = createApp();

let counter = 0;
function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}-${Date.now()}-${counter}@example.com`;
}

async function primeCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const res = await agent.get("/health");
  const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const raw = cookies.find((c) => c.startsWith("csrf_token="));
  if (!raw) throw new Error("csrf_token cookie was not set");
  return decodeURIComponent(raw.split(";")[0]!.split("=")[1]!);
}

async function signInAdmin() {
  const email = uniqueEmail("admin");
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword("admin password"), fullName: "Desk Admin" },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: "admin" } });

  const agent = request.agent(app);
  const csrf = await primeCsrf(agent);
  await agent
    .post("/auth/login")
    .set("X-CSRF-Token", csrf)
    .send({ email, password: "admin password" });
  return { agent, csrf };
}

/** Stubs the provider so linking a currency doesn't reach the real network. */
function stubProvider(price = 64300.38, logo: string | null = "https://cdn.test/btc.png") {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/coins/")) {
      return { ok: true, status: 200, json: async () => ({ logo }) } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "btc-bitcoin",
          last_updated: "2026-08-19T03:35:14Z",
          quotes: { USD: { price, percent_change_24h: 0.22 } },
        },
      ],
    } as Response;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("live vs manual pricing", () => {
  it("rejects a live currency with no asset id", async () => {
    const { agent, csrf } = await signInAdmin();

    const res = await agent
      .post("/admin/currencies")
      .set("X-CSRF-Token", csrf)
      .send({ symbol: "LIVE1", name: "No Link", decimals: 8, priceSource: "live" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/market asset/i);
  });

  it("rejects a manual currency with no price", async () => {
    const { agent, csrf } = await signInAdmin();

    const res = await agent
      .post("/admin/currencies")
      .set("X-CSRF-Token", csrf)
      .send({ symbol: "MAN1", name: "No Price", decimals: 8, priceSource: "manual" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/price above zero/i);
  });

  it("seeds price, 24h change and logo when a currency is linked", async () => {
    const { agent, csrf } = await signInAdmin();
    stubProvider();

    const res = await agent.post("/admin/currencies").set("X-CSRF-Token", csrf).send({
      symbol: "LBTC",
      name: "Linked Bitcoin",
      decimals: 8,
      priceSource: "live",
      externalPriceId: "btc-bitcoin",
    });

    expect(res.status).toBe(201);
    expect(Number(res.body.currency.mockPriceUsd)).toBeCloseTo(64300.38, 4);
    expect(Number(res.body.currency.priceChange24h)).toBeCloseTo(0.22, 4);
    expect(res.body.currency.iconUrl).toBe("https://cdn.test/btc.png");
    expect(res.body.currency.priceUpdatedAt).toBeTruthy();
  });

  it("still creates the currency when the provider is down, at the submitted price", async () => {
    const { agent, csrf } = await signInAdmin();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const res = await agent.post("/admin/currencies").set("X-CSRF-Token", csrf).send({
      symbol: "LDOWN",
      name: "Provider Down",
      decimals: 8,
      priceSource: "live",
      externalPriceId: "btc-bitcoin",
      mockPriceUsd: 5,
    });

    // A provider outage must not block catalogue administration  the next
    // scheduled refresh corrects the price.
    expect(res.status).toBe(201);
    expect(Number(res.body.currency.mockPriceUsd)).toBeCloseTo(5, 4);
    expect(res.body.currency.iconUrl).toBeNull();
  });

  it("switches an existing manual currency to live", async () => {
    const { agent, csrf } = await signInAdmin();
    const existing = await prisma.currency.findUniqueOrThrow({ where: { symbol: "BTC" } });
    stubProvider();

    const res = await agent
      .patch(`/admin/currencies/${existing.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ priceSource: "live", externalPriceId: "btc-bitcoin" });

    expect(res.status).toBe(200);
    expect(res.body.currency.priceSource).toBe("live");
    expect(Number(res.body.currency.mockPriceUsd)).toBeCloseTo(64300.38, 4);
  });

  it("refuses to switch to live without an asset id", async () => {
    const { agent, csrf } = await signInAdmin();
    const existing = await prisma.currency.findUniqueOrThrow({ where: { symbol: "BTC" } });

    const res = await agent
      .patch(`/admin/currencies/${existing.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ priceSource: "live" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/market asset/i);
  });

  it("keeps the last known price when switching live back to manual", async () => {
    const { agent, csrf } = await signInAdmin();
    const existing = await prisma.currency.findUniqueOrThrow({ where: { symbol: "ETH" } });
    stubProvider();

    await agent
      .patch(`/admin/currencies/${existing.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ priceSource: "live", externalPriceId: "btc-bitcoin" });

    const res = await agent
      .patch(`/admin/currencies/${existing.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ priceSource: "manual" });

    expect(res.status).toBe(200);
    expect(res.body.currency.priceSource).toBe("manual");
    // The feed's last figure stays as the starting point for manual editing.
    expect(Number(res.body.currency.mockPriceUsd)).toBeCloseTo(64300.38, 4);
  });

  it("does not re-seed when an unrelated field changes", async () => {
    const { agent, csrf } = await signInAdmin();
    const existing = await prisma.currency.findUniqueOrThrow({ where: { symbol: "BTC" } });
    const spy = stubProvider();

    await agent
      .patch(`/admin/currencies/${existing.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ priceSource: "live", externalPriceId: "btc-bitcoin" });
    const callsAfterLink = spy.mock.calls.length;

    await agent
      .patch(`/admin/currencies/${existing.id}`)
      .set("X-CSRF-Token", csrf)
      .send({ name: "Renamed Bitcoin" });

    expect(spy.mock.calls.length).toBe(callsAfterLink);
  });
});

describe("admin price-feed endpoints", () => {
  it("refuses anonymous callers", async () => {
    expect((await request(app).get("/admin/price-feed/status")).status).toBe(401);
    expect((await request(app).get("/admin/price-feed/search?q=btc")).status).toBe(401);
  });

  it("requires at least two characters to search", async () => {
    const { agent } = await signInAdmin();

    const res = await agent.get("/admin/price-feed/search?q=b");

    expect(res.status).toBe(400);
  });

  it("returns search hits from the provider", async () => {
    const { agent } = await signInAdmin();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        currencies: [
          { id: "btc-bitcoin", name: "Bitcoin", symbol: "BTC", rank: 1, is_active: true },
        ],
      }),
    } as Response);

    const res = await agent.get("/admin/price-feed/search?q=bitcoin");

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ externalId: "btc-bitcoin", symbol: "BTC" });
  });

  it("reports provider failure as a 502 rather than a 500", async () => {
    const { agent } = await signInAdmin();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const res = await agent.get("/admin/price-feed/search?q=bitcoin");

    expect(res.status).toBe(502);
  });

  it("exposes provider and interval on status", async () => {
    const { agent } = await signInAdmin();

    const res = await agent.get("/admin/price-feed/status");

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("coinpaprika");
    expect(res.body.intervalMs).toBeGreaterThan(0);
  });
});
