import { Router } from "express";
import { z } from "zod";
import { isAddress, getAddress, recoverMessageAddress } from "viem";
import { db } from "../db.js";
import { createOrganizerWallet } from "../circle/wallets.js";
import { generateCreatorToken, hashToken } from "../services/auth.js";
import { issueNonce, buildLoginMessage, consumeNonce } from "../services/walletAuth.js";

export const authRouter = Router();

// GET /api/auth/nonce?address=0x... -- fetch the message to sign next.
authRouter.get("/nonce", (req, res) => {
  const address = String(req.query.address ?? "");
  if (!isAddress(address)) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }
  res.json(issueNonce(address));
});

const loginSchema = z.object({
  address: z.string(),
  signature: z.string(),
  // Only used the first time this address logs in; ignored for returning
  // organizers, so the frontend can always send it without knowing in
  // advance whether the address is new -- one signature, one round trip.
  displayName: z.string().min(1).max(80).optional(),
});

// POST /api/auth/login -- verifies the wallet actually signed the nonce
// from /nonce, then finds-or-creates the organizer and issues a fresh
// bearer token (rotates any previous one for this organizer).
authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { address, signature, displayName } = parsed.data;
  if (!isAddress(address)) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }

  const nonce = consumeNonce(address);
  if (!nonce) {
    res.status(400).json({ error: "Nonce expired or missing -- request a new one from /api/auth/nonce" });
    return;
  }

  const message = buildLoginMessage(address, nonce);
  const recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    res.status(401).json({ error: "Signature does not match address" });
    return;
  }

  const checksummed = getAddress(address);
  const existing = await db.organizer.findUnique({ where: { loginWalletAddress: checksummed } });

  if (existing) {
    const token = generateCreatorToken();
    await db.organizer.update({
      where: { id: existing.id },
      data: { creatorTokenHash: hashToken(token) },
    });
    res.json({
      id: existing.id,
      displayName: existing.displayName,
      walletAddress: existing.circleWalletAddress,
      creatorToken: token,
    });
    return;
  }

  if (!displayName) {
    res.status(400).json({ error: "First-time sign-in requires a display name" });
    return;
  }

  const wallet = await createOrganizerWallet();
  const token = generateCreatorToken();
  const organizer = await db.organizer.create({
    data: {
      displayName,
      loginWalletAddress: checksummed,
      creatorTokenHash: hashToken(token),
      circleWalletId: wallet.walletId,
      circleWalletAddress: wallet.address,
    },
  });

  res.status(201).json({
    id: organizer.id,
    displayName: organizer.displayName,
    walletAddress: organizer.circleWalletAddress,
    creatorToken: token,
  });
});
