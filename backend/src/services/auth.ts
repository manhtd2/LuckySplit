import { randomBytes, createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "../db.js";

/**
 * No OAuth/KYC by design (LuckySplit_doc.md section 2: "không xác minh danh
 * tính organizer"). A random token is generated once, handed to the client,
 * and only its hash is ever persisted -- functions as a bearer "creator key".
 */
export function generateCreatorToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AuthedRequest extends Request {
  organizerId?: string;
}

export async function requireOrganizer(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const organizer = await db.organizer.findUnique({ where: { creatorTokenHash: hashToken(token) } });
  if (!organizer) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  req.organizerId = organizer.id;
  next();
}
