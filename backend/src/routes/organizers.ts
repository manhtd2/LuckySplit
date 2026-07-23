import { Router } from "express";
import { db } from "../db.js";
import { getWalletUsdcBalance } from "../circle/wallets.js";
import { requireOrganizer, type AuthedRequest } from "../services/auth.js";

export const organizersRouter = Router();

// Profile creation now happens via POST /api/auth/login (sign-in with the
// organizer's own wallet) -- see routes/auth.ts.

organizersRouter.get("/me", requireOrganizer, async (req: AuthedRequest, res) => {
  const organizer = await db.organizer.findUniqueOrThrow({ where: { id: req.organizerId! } });
  const usdcBalance = await getWalletUsdcBalance(organizer.circleWalletId!);
  res.json({
    id: organizer.id,
    displayName: organizer.displayName,
    walletAddress: organizer.circleWalletAddress,
    usdcBalance,
  });
});

// Lightweight endpoint for polling the wallet balance (e.g. while the
// dashboard waits for a deposit) without refetching the full profile.
organizersRouter.get("/me/balance", requireOrganizer, async (req: AuthedRequest, res) => {
  const organizer = await db.organizer.findUniqueOrThrow({ where: { id: req.organizerId! } });
  const usdcBalance = await getWalletUsdcBalance(organizer.circleWalletId!);
  res.json({ usdcBalance });
});
