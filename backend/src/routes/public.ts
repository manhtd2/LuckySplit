import { Router } from "express";
import { db } from "../db.js";

export const publicRouter = Router();

const EXPLORER_TX = (hash: string) => `https://testnet.arcscan.app/tx/${hash}`;

publicRouter.get("/events", async (_req, res) => {
  const events = await db.event.findMany({
    orderBy: { createdAt: "desc" },
    include: { organizer: { select: { id: true, displayName: true } } },
  });

  res.json(
    events.map((e) => ({
      id: e.id,
      contractEventId: e.contractEventId,
      organizer: e.organizer,
      mode: e.mode,
      numWallets: e.numWallets,
      numWinners: e.numWinners,
      state: e.state,
      createdAt: e.createdAt,
      completedAt: e.completedAt,
    })),
  );
});

// doc section 8: wallet list public from the moment funds are locked
// (before randomness runs); only per-wallet AMOUNTS stay hidden until
// Completed. isWinner/paid/blocked can surface earlier as "đang xử lý"
// real-time progress during Distributing.
publicRouter.get("/events/:id", async (req, res) => {
  const event = await db.event.findUnique({
    where: { id: req.params.id },
    include: {
      organizer: { select: { id: true, displayName: true } },
      wallets: true,
      txs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const walletsPublic = event.state === "OPEN" ? [] : event.wallets;
  const showAmounts = event.state === "COMPLETED";

  res.json({
    id: event.id,
    contractEventId: event.contractEventId,
    organizer: event.organizer,
    mode: event.mode,
    numWallets: event.numWallets,
    numWinners: event.numWinners,
    fixedAmountPerWinner: showAmounts ? event.fixedAmountPerWinner : null,
    totalDeposit: event.totalDeposit,
    state: event.state,
    targetBlock: event.targetBlock?.toString() ?? null,
    createdAt: event.createdAt,
    fundedAt: event.fundedAt,
    committedAt: event.committedAt,
    revealedAt: event.revealedAt,
    completedAt: event.completedAt,
    wallets: walletsPublic.map((w) => ({
      address: w.address,
      isWinner: w.isWinner,
      paid: w.paid,
      blocked: w.blocked,
      amount: showAmounts ? w.amount : null,
    })),
    txs: event.txs.map((t) => ({
      kind: t.kind,
      txHash: t.txHash,
      status: t.status,
      explorerUrl: EXPLORER_TX(t.txHash),
      createdAt: t.createdAt,
    })),
  });
});

// KOL trust-building leaderboard (doc section 8: public organizer history
// substitutes for identity verification). Ranked by USDC actually paid to
// winners -- not gross deposit, so blocklist refunds/dust don't inflate a
// KOL's standing. `amount` is stored as a decimal-string base-unit column
// (to avoid float precision loss), which Prisma's groupBy/_sum can't
// aggregate directly since it isn't a numeric column type -- summed with
// BigInt in application code instead.
publicRouter.get("/leaderboard", async (_req, res) => {
  const paidEntries = await db.walletEntry.findMany({
    where: { paid: true },
    select: { amount: true, eventId: true, event: { select: { organizerId: true } } },
  });

  const stats = new Map<string, { total: bigint; eventIds: Set<string> }>();
  for (const entry of paidEntries) {
    if (!entry.amount) continue;
    const orgId = entry.event.organizerId;
    const s = stats.get(orgId) ?? { total: 0n, eventIds: new Set<string>() };
    s.total += BigInt(entry.amount);
    s.eventIds.add(entry.eventId);
    stats.set(orgId, s);
  }

  const organizers = await db.organizer.findMany({
    where: { id: { in: [...stats.keys()] } },
    select: { id: true, displayName: true },
  });

  const leaderboard = organizers
    .map((o) => {
      const s = stats.get(o.id)!;
      return {
        id: o.id,
        displayName: o.displayName,
        totalDistributed: s.total.toString(),
        eventCount: s.eventIds.size,
      };
    })
    .sort((a, b) => {
      const diff = BigInt(b.totalDistributed) - BigInt(a.totalDistributed);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

  res.json(leaderboard);
});

publicRouter.get("/organizers/:id", async (req, res) => {
  const organizer = await db.organizer.findUnique({
    where: { id: req.params.id },
    include: { events: { orderBy: { createdAt: "desc" } } },
  });
  if (!organizer) {
    res.status(404).json({ error: "Organizer not found" });
    return;
  }

  res.json({
    id: organizer.id,
    displayName: organizer.displayName,
    walletAddress: organizer.circleWalletAddress,
    events: organizer.events.map((e) => ({
      id: e.id,
      mode: e.mode,
      numWallets: e.numWallets,
      numWinners: e.numWinners,
      state: e.state,
      createdAt: e.createdAt,
      completedAt: e.completedAt,
    })),
  });
});
