import { describe, expect, it } from "vitest";
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

/** Primes the CSRF cookie on the agent and returns its value for the X-CSRF-Token header. */
async function primeCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const res = await agent.get("/health");
  const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const raw = cookies.find((c) => c.startsWith("csrf_token="));
  if (!raw) throw new Error("csrf_token cookie was not set");
  return decodeURIComponent(raw.split(";")[0]!.split("=")[1]!);
}

function refreshCookie(res: request.Response): string | undefined {
  const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  return cookies.find((c) => c.startsWith("refresh_token="));
}

describe("auth", () => {
  it("signup creates a session and provisions wallets", async () => {
    const agent = request.agent(app);
    const csrfToken = await primeCsrf(agent);
    const email = uniqueEmail("signup");

    const signupRes = await agent
      .post("/auth/signup")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, password: "correct horse battery", fullName: "Ada Lovelace" });

    expect(signupRes.status).toBe(201);
    expect(signupRes.body.user).toMatchObject({ email, fullName: "Ada Lovelace" });

    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.id).toBe(signupRes.body.user.id);
    expect(meRes.body.isAdmin).toBe(false);

    const walletsRes = await agent.get("/wallets");
    expect(walletsRes.status).toBe(200);
    expect(walletsRes.body.wallets.length).toBeGreaterThan(0);

    // A new account starts empty  the app fabricates no opening balance.
    expect(walletsRes.body.wallets.every((w: { balance: string }) => Number(w.balance) === 0)).toBe(
      true,
    );

    // ...and with no invented history: every row a customer ever sees is the
    // result of a real deposit, withdrawal, conversion or admin adjustment.
    const txRes = await agent.get("/wallets/transactions");
    expect(txRes.status).toBe(200);
    expect(txRes.body.transactions).toHaveLength(0);
  });

  it("rejects signup with an email already in use", async () => {
    const agent = request.agent(app);
    const csrfToken = await primeCsrf(agent);
    const email = uniqueEmail("dupe");

    await agent
      .post("/auth/signup")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, password: "correct horse battery", fullName: "First" });

    const secondRes = await agent
      .post("/auth/signup")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, password: "another password", fullName: "Second" });

    expect(secondRes.status).toBe(409);
  });

  it("login succeeds with correct credentials and fails with wrong password", async () => {
    const setupAgent = request.agent(app);
    const setupCsrf = await primeCsrf(setupAgent);
    const email = uniqueEmail("login");
    await setupAgent
      .post("/auth/signup")
      .set("X-CSRF-Token", setupCsrf)
      .send({ email, password: "correct horse battery", fullName: "Login Tester" });

    const loginAgent = request.agent(app);
    const loginCsrf = await primeCsrf(loginAgent);

    const badRes = await loginAgent
      .post("/auth/login")
      .set("X-CSRF-Token", loginCsrf)
      .send({ email, password: "wrong password" });
    expect(badRes.status).toBe(401);

    const goodRes = await loginAgent
      .post("/auth/login")
      .set("X-CSRF-Token", loginCsrf)
      .send({ email, password: "correct horse battery" });
    expect(goodRes.status).toBe(200);
    expect(goodRes.body.user.email).toBe(email);
  });

  it("refresh rotates the refresh token, invalidating the old one", async () => {
    const agent = request.agent(app);
    const csrfToken = await primeCsrf(agent);
    const email = uniqueEmail("refresh");
    const signupRes = await agent
      .post("/auth/signup")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, password: "correct horse battery", fullName: "Refresh Tester" });
    const oldRefreshCookie = refreshCookie(signupRes);
    expect(oldRefreshCookie).toBeDefined();

    const refreshRes = await agent.post("/auth/refresh").set("X-CSRF-Token", csrfToken);
    expect(refreshRes.status).toBe(200);
    const newRefreshCookie = refreshCookie(refreshRes);
    expect(newRefreshCookie).toBeDefined();
    expect(newRefreshCookie).not.toBe(oldRefreshCookie);

    // Reusing the pre-rotation cookie must now be rejected. The CSRF cookie
    // has to be resent too (a bare `request(app)` call has no cookie jar),
    // or this would 403 on the CSRF check before ever reaching the handler.
    const reuseRes = await request(app)
      .post("/auth/refresh")
      .set("X-CSRF-Token", csrfToken)
      .set("Cookie", [oldRefreshCookie!, `csrf_token=${csrfToken}`]);
    expect(reuseRes.status).toBe(401);
  });

  it("logout revokes the refresh token", async () => {
    const agent = request.agent(app);
    const csrfToken = await primeCsrf(agent);
    const email = uniqueEmail("logout");
    const signupRes = await agent
      .post("/auth/signup")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, password: "correct horse battery", fullName: "Logout Tester" });
    const cookieBeforeLogout = refreshCookie(signupRes);

    const logoutRes = await agent.post("/auth/logout").set("X-CSRF-Token", csrfToken);
    expect(logoutRes.status).toBe(204);

    const reuseRes = await request(app)
      .post("/auth/refresh")
      .set("X-CSRF-Token", csrfToken)
      .set("Cookie", [cookieBeforeLogout!, `csrf_token=${csrfToken}`]);
    expect(reuseRes.status).toBe(401);
  });

  it("rejects /me without a session", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  // The login response is what the client routes on, so an admin has to be
  // identifiable from it directly  otherwise they land on the customer
  // dashboard and only bounce to /admin after a follow-up /me call.
  it("reports admin status on the login response, not just /me", async () => {
    const email = uniqueEmail("adminflag");
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword("admin password"),
        fullName: "Desk Admin",
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, role: "admin" } });

    const agent = request.agent(app);
    const csrfToken = await primeCsrf(agent);
    const loginRes = await agent
      .post("/auth/login")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, password: "admin password" });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.isAdmin).toBe(true);
  });

  it("reports a plain customer as not an admin on login", async () => {
    const agent = request.agent(app);
    const csrfToken = await primeCsrf(agent);
    const email = uniqueEmail("customerflag");
    const signupRes = await agent
      .post("/auth/signup")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, password: "correct horse battery", fullName: "Plain Customer" });
    expect(signupRes.body.isAdmin).toBe(false);

    const loginRes = await agent
      .post("/auth/login")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, password: "correct horse battery" });
    expect(loginRes.body.isAdmin).toBe(false);
  });
});
