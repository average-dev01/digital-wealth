import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TOKEN_TTL_MS,
} from "../lib/jwt";
import { generateOpaqueToken, hashToken } from "../lib/tokens";
import { sendPasswordResetEmail } from "../lib/mailer";
import { setAccessCookie, setRefreshCookie, clearAuthCookies } from "../lib/cookies";
import { seedNewUser } from "../lib/walletService";
import { requireAuth } from "../middleware/requireAuth";
import { authRateLimit } from "../middleware/rateLimit";

export const authRouter = Router();

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);
const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Password must be under 72 characters");

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2, "Please enter your full legal name").max(120),
});

async function issueSession(res: import("express").Response, userId: string, email: string) {
  const accessToken = signAccessToken({ sub: userId, email });
  const refreshToken = signRefreshToken({ sub: userId });

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  setAccessCookie(res, accessToken);
  setRefreshCookie(res, refreshToken);
}

function publicUser(user: {
  id: string;
  email: string;
  fullName: string;
  country: string | null;
  dob: Date | null;
  kycStatus: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    country: user.country,
    dob: user.dob,
    kycStatus: user.kycStatus,
    createdAt: user.createdAt,
  };
}

/**
 * Every endpoint that returns a session also returns `isAdmin`, so the client
 * can route straight to the right landing page instead of guessing and
 * correcting itself after a follow-up /me call.
 */
async function isAdminUser(userId: string): Promise<boolean> {
  const membership = await prisma.userRole.findFirst({ where: { userId, role: "admin" } });
  return membership !== null;
}

authRouter.post("/signup", authRateLimit, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid signup details" });
    return;
  }
  const { email, password, fullName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { email, passwordHash, fullName } });
    await seedNewUser(tx, created.id);
    return created;
  });

  await issueSession(res, user.id, user.email);
  // A brand-new signup is always a customer, but the shape stays consistent.
  res.status(201).json({ user: publicUser(user), isAdmin: false });
});

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1) });

authRouter.post("/login", authRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password" });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // A suspended account authenticates but is refused a session, so the admin
  // panel's suspend action has a visible consequence. Checked after the
  // password so it can't be used to probe which emails exist.
  if (!user.isActive) {
    res
      .status(403)
      .json({ error: "This account has been suspended. Contact support for assistance." });
    return;
  }

  await issueSession(res, user.id, user.email);
  res.json({ user: publicUser(user), isAdmin: await isAdminUser(user.id) });
});

authRouter.post("/logout", async (req, res) => {
  const refreshCookie = req.signedCookies?.refresh_token as string | undefined;
  if (refreshCookie) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshCookie), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearAuthCookies(res);
  res.status(204).end();
});

authRouter.post("/refresh", async (req, res) => {
  const refreshCookie = req.signedCookies?.refresh_token as string | undefined;
  const payload = refreshCookie ? verifyRefreshToken(refreshCookie) : null;
  if (!refreshCookie || !payload) {
    res.status(401).json({ error: "Session expired, please log in again" });
    return;
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshCookie) },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    clearAuthCookies(res);
    res.status(401).json({ error: "Session expired, please log in again" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    clearAuthCookies(res);
    res.status(401).json({ error: "Session expired, please log in again" });
    return;
  }

  // Rotate: revoke the presented refresh token and issue a fresh pair.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  await issueSession(res, user.id, user.email);
  res.json({ user: publicUser(user), isAdmin: await isAdminUser(user.id) });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: publicUser(user), isAdmin: await isAdminUser(user.id) });
});

const updateMeSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full legal name").max(120).optional(),
  country: z.string().trim().min(2, "Enter your country of residence").max(80).optional(),
  dob: z.string().min(1, "Enter your date of birth").optional(),
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid profile update" });
    return;
  }

  const data: { fullName?: string; country?: string; dob?: Date } = {};
  if (parsed.data.fullName !== undefined) data.fullName = parsed.data.fullName;
  if (parsed.data.country !== undefined) data.country = parsed.data.country;
  if (parsed.data.dob !== undefined) data.dob = new Date(parsed.data.dob);

  const user = await prisma.user.update({ where: { id: req.userId! }, data });
  res.json({ user: publicUser(user), isAdmin: await isAdminUser(user.id) });
});

const forgotPasswordSchema = z.object({ email: emailSchema });

authRouter.post("/forgot-password", authRateLimit, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Always return 204 regardless of whether the account exists, so the
  // response can't be used to enumerate registered emails.
  if (user) {
    const token = generateOpaqueToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const resetUrl = `${process.env.FRONTEND_ORIGIN}/en/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, resetUrl);
  }

  res.status(204).end();
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

authRouter.post("/reset-password", authRateLimit, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    res.status(400).json({ error: "This reset link is invalid or has expired" });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    // Revoke every existing session on password change.
    await tx.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return updated;
  });

  await issueSession(res, user.id, user.email);
  res.json({ user: publicUser(user), isAdmin: await isAdminUser(user.id) });
});
