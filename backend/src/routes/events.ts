import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { keccak256, parseUnits } from "viem";
import { db } from "../db.js";
import { requireOrganizer, type AuthedRequest } from "../services/auth.js";
import { validateWalletList } from "../services/walletList.js";
import { executeAsOrganizer } from "../circle/wallets.js";
import { contractAddress, luckySplitOperator } from "../chain/contract.js";
import { publicClient } from "../chain/client.js";
import { extractEventId } from "../chain/events.js";
import { env } from "../env.js";

export const eventsRouter = Router();

// GET /api/events -- organizer's own event list, powers the dashboard.
eventsRouter.get("/", requireOrganizer, async (req: AuthedRequest, res) => {
  const events = await db.event.findMany({
    where: { organizerId: req.organizerId! },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    events.map((e) => ({
      id: e.id,
      contractEventId: e.contractEventId,
      mode: e.mode,
      numWallets: e.numWallets,
      numWinners: e.numWinners,
      totalDeposit: e.totalDeposit,
      state: e.state,
      createdAt: e.createdAt,
      completedAt: e.completedAt,
    })),
  );
});

const USDC_DECIMALS = 6;
const modeToContractIndex = { RANDOM_SPLIT: 0, FIXED_AMOUNT: 1 } as const;

const createSchema = z
  .object({
    wallets: z.array(z.string()).min(2).max(200),
    mode: z.enum(["RANDOM_SPLIT", "FIXED_AMOUNT"]),
    numWinners: z.number().int().min(2),
    fixedAmountPerWinner: z.string().optional(), // decimal USDC string, e.g. "1.5"
  })
  .refine((v) => (v.mode === "FIXED_AMOUNT" ? !!v.fixedAmountPerWinner : true), {
    message: "fixedAmountPerWinner is required for FIXED_AMOUNT mode",
  });

// POST /api/events -- doc section 4: validate wallet list format with
// specific per-entry errors, never silently drop/dedupe.
eventsRouter.post("/", requireOrganizer, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { wallets, mode, numWinners, fixedAmountPerWinner } = parsed.data;

  const validation = validateWalletList(wallets);
  if (!validation.ok) {
    res.status(400).json({ error: "Invalid wallet list", details: validation.errors });
    return;
  }
  if (validation.sorted.length < numWinners) {
    res.status(400).json({ error: "numWinners cannot exceed the number of wallets" });
    return;
  }

  const organizer = await db.organizer.findUniqueOrThrow({ where: { id: req.organizerId! } });
  if (!organizer.circleWalletId) {
    res.status(500).json({ error: "Organizer has no wallet" });
    return;
  }

  const fixedAmountBaseUnits =
    mode === "FIXED_AMOUNT" ? parseUnits(fixedAmountPerWinner!, USDC_DECIMALS) : 0n;

  const { txHash } = await executeAsOrganizer({
    walletId: organizer.circleWalletId,
    contractAddress,
    abiFunctionSignature: "createEvent(address[],uint8,uint8,uint256)",
    abiParameters: [validation.sorted, modeToContractIndex[mode], numWinners, fixedAmountBaseUnits.toString()],
  });

  const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
  const contractEventId = extractEventId(receipt);

  const event = await db.event.create({
    data: {
      contractEventId,
      organizerId: organizer.id,
      mode,
      numWallets: validation.sorted.length,
      numWinners,
      fixedAmountPerWinner: mode === "FIXED_AMOUNT" ? fixedAmountBaseUnits.toString() : null,
      state: "OPEN",
      wallets: { create: validation.sorted.map((address) => ({ address })) },
      txs: { create: { kind: "CREATE", txHash, status: "CONFIRMED" } },
    },
  });

  res.status(201).json({ id: event.id, contractEventId, state: event.state, txHash });
});

const fundSchema = z.object({
  // Only used for RANDOM_SPLIT -- FIXED_AMOUNT's total is derived server-side
  // from numWinners * fixedAmountPerWinner so it always matches exactly.
  totalAmount: z.string().optional(),
});

eventsRouter.post("/:id/fund", requireOrganizer, async (req: AuthedRequest, res) => {
  const parsed = fundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const event = await db.event.findUnique({ where: { id: req.params.id }, include: { organizer: true } });
  if (!event || event.organizerId !== req.organizerId) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  if (event.state !== "OPEN") {
    res.status(409).json({ error: `Event must be OPEN, currently ${event.state}` });
    return;
  }

  let amount: bigint;
  if (event.mode === "FIXED_AMOUNT") {
    amount = BigInt(event.fixedAmountPerWinner!) * BigInt(event.numWinners);
  } else {
    if (!parsed.data.totalAmount) {
      res.status(400).json({ error: "totalAmount is required for RANDOM_SPLIT" });
      return;
    }
    amount = parseUnits(parsed.data.totalAmount, USDC_DECIMALS);
  }

  const walletId = event.organizer.circleWalletId!;

  await executeAsOrganizer({
    walletId,
    contractAddress: env.USDC_ADDRESS,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [contractAddress, amount.toString()],
  });

  const { txHash } = await executeAsOrganizer({
    walletId,
    contractAddress,
    abiFunctionSignature: "fundEvent(uint256,uint256)",
    abiParameters: [event.contractEventId!.toString(), amount.toString()],
  });

  await db.event.update({
    where: { id: event.id },
    data: {
      state: "FUNDED",
      totalDeposit: amount.toString(),
      fundedAt: new Date(),
      txs: { create: { kind: "FUND", txHash, status: "CONFIRMED" } },
    },
  });

  res.json({ id: event.id, state: "FUNDED", totalDeposit: amount.toString(), txHash });
});

// POST /api/events/:id/start -- "Bắt đầu": backend generates the secret
// (organizer never sees or influences it, doc section 5), operator commits
// on-chain. The watcher service picks up the wait-for-target-block +
// reveal + distribute steps automatically from here.
eventsRouter.post("/:id/start", requireOrganizer, async (req: AuthedRequest, res) => {
  const event = await db.event.findUnique({ where: { id: req.params.id } });
  if (!event || event.organizerId !== req.organizerId) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  if (event.state !== "FUNDED") {
    res.status(409).json({ error: `Event must be FUNDED, currently ${event.state}` });
    return;
  }

  const secret = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
  const commitHash = keccak256(secret);

  const currentBlock = await publicClient.getBlockNumber();
  // Biased toward the top of the contract's [20,30] window rather than the
  // midpoint: gas estimation + nonce lookup + broadcast (a few sequential
  // RPC round trips) eat several blocks of latency at Arc's ~2.3 blocks/sec,
  // and that latency only ever pushes the actual inclusion block number UP
  // relative to this read, never down -- so bias up, not down.
  const targetBlock = currentBlock + 28n;

  const txHash = await luckySplitOperator.write.commit([
    BigInt(event.contractEventId!),
    commitHash,
    targetBlock,
  ]);

  // write() only returns once the tx is broadcast, not once it's mined --
  // must confirm it actually succeeded before trusting COMMITTED in the DB.
  // A caught real bug: without this check, a reverted commit (e.g. the
  // block-delay window slipping under real-world RPC latency) still got
  // marked COMMITTED, and the watcher then retried reveal() forever against
  // a contract still sitting in FUNDED with an empty commitHash.
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    await db.event.update({
      where: { id: event.id },
      data: { txs: { create: { kind: "COMMIT", txHash, status: "FAILED" } } },
    });
    res.status(502).json({ error: `commit() reverted on-chain (tx ${txHash}) -- try starting again` });
    return;
  }

  await db.event.update({
    where: { id: event.id },
    data: {
      state: "COMMITTED",
      commitSecret: secret,
      targetBlock,
      committedAt: new Date(),
      txs: { create: { kind: "COMMIT", txHash, status: "CONFIRMED" } },
    },
  });

  res.json({ id: event.id, state: "COMMITTED", targetBlock: targetBlock.toString(), txHash });
});

eventsRouter.post("/:id/cancel", requireOrganizer, async (req: AuthedRequest, res) => {
  const event = await db.event.findUnique({ where: { id: req.params.id }, include: { organizer: true } });
  if (!event || event.organizerId !== req.organizerId) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  if (event.state !== "FUNDED") {
    res.status(409).json({ error: `Can only cancel while FUNDED (irreversible after that), currently ${event.state}` });
    return;
  }

  const { txHash } = await executeAsOrganizer({
    walletId: event.organizer.circleWalletId!,
    contractAddress,
    abiFunctionSignature: "cancelEvent(uint256)",
    abiParameters: [event.contractEventId!.toString()],
  });

  await db.event.update({
    where: { id: event.id },
    data: { state: "CANCELLED", txs: { create: { kind: "CANCEL", txHash, status: "CONFIRMED" } } },
  });

  res.json({ id: event.id, state: "CANCELLED", txHash });
});

eventsRouter.get("/:id", requireOrganizer, async (req: AuthedRequest, res) => {
  const event = await db.event.findUnique({
    where: { id: req.params.id },
    include: { wallets: true, txs: { orderBy: { createdAt: "asc" } } },
  });
  if (!event || event.organizerId !== req.organizerId) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  // Prisma's BigInt fields (targetBlock, tx.blockNumber) don't survive
  // JSON.stringify/res.json() as-is -- serialize explicitly. commitSecret is
  // dropped: it's internal-only, never exposed via any API response.
  res.json({
    id: event.id,
    contractEventId: event.contractEventId,
    mode: event.mode,
    numWallets: event.numWallets,
    numWinners: event.numWinners,
    fixedAmountPerWinner: event.fixedAmountPerWinner,
    totalDeposit: event.totalDeposit,
    state: event.state,
    targetBlock: event.targetBlock?.toString() ?? null,
    createdAt: event.createdAt,
    fundedAt: event.fundedAt,
    committedAt: event.committedAt,
    revealedAt: event.revealedAt,
    completedAt: event.completedAt,
    wallets: event.wallets.map((w) => ({
      address: w.address,
      isWinner: w.isWinner,
      paid: w.paid,
      blocked: w.blocked,
      amount: w.amount,
    })),
    txs: event.txs.map((t) => ({
      kind: t.kind,
      txHash: t.txHash,
      status: t.status,
      explorerUrl: `https://testnet.arcscan.app/tx/${t.txHash}`,
      createdAt: t.createdAt,
    })),
  });
});
