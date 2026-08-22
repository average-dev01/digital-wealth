import type { NextFunction, Request, Response } from "express";

import { prisma } from "../lib/prisma";

/** Must run after requireAuth, which sets req.userId. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const membership = await prisma.userRole.findFirst({
    where: { userId: req.userId!, role: "admin" },
  });
  if (!membership) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
