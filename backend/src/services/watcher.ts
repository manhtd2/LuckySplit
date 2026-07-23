import { db } from "../db.js";
import { publicClient } from "../chain/client.js";
import { luckySplitRead, luckySplitOperator, EVENT_STATE_NAMES } from "../chain/contract.js";
import { env } from "../env.js";

const POLL_INTERVAL_MS = Number(env.WATCHER_POLL_INTERVAL_MS);
const DISTRIBUTE_BATCH_SIZE = BigInt(env.DISTRIBUTE_BATCH_SIZE);

/**
 * Background loop driving the time-triggered steps that need no organizer
 * intent (doc section 5: "hệ thống tự động chờ... tự động reveal"):
 *   COMMITTED -> (target block reached) -> reveal() -> DISTRIBUTING
 *   DISTRIBUTING -> distribute() in batches -> COMPLETED
 * Idempotent by construction: re-running a tick that finds nothing to do is
 * a no-op, and distribute() batches are already idempotent on-chain.
 */
export function startWatcher() {
  tick().catch((err) => console.error("[watcher] tick failed", err));
  setInterval(() => {
    tick().catch((err) => console.error("[watcher] tick failed", err));
  }, POLL_INTERVAL_MS);
}

async function tick() {
  const currentBlock = await publicClient.getBlockNumber();

  const committed = await db.event.findMany({ where: { state: "COMMITTED" } });
  for (const event of committed) {
    if (event.targetBlock !== null && currentBlock >= event.targetBlock) {
      await revealEvent(event.id);
    }
  }

  const distributing = await db.event.findMany({ where: { state: "DISTRIBUTING" } });
  for (const event of distributing) {
    await distributeBatch(event.id);
  }
}

async function revealEvent(eventId: string) {
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  if (event.state !== "COMMITTED" || !event.commitSecret) return;

  try {
    const txHash = await luckySplitOperator.write.reveal([
      BigInt(event.contractEventId!),
      event.commitSecret as `0x${string}`,
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      // Leave state as COMMITTED so the next tick retries -- without this
      // check a reverted reveal() would still fall through to reading
      // getWinners() (empty, since nothing was selected on-chain) and
      // incorrectly advance the DB to DISTRIBUTING anyway.
      await db.event.update({
        where: { id: eventId },
        data: { txs: { create: { kind: "REVEAL", txHash, status: "FAILED" } } },
      });
      console.error(`[watcher] reveal() reverted on-chain for event ${eventId}, tx ${txHash}`);
      return;
    }

    const winners = (await luckySplitRead.read.getWinners([BigInt(event.contractEventId!)])) as Array<{
      wallet: string;
      amount: bigint;
      paid: boolean;
      blocked: boolean;
    }>;

    await db.$transaction([
      ...winners.map((w) =>
        db.walletEntry.updateMany({
          where: { eventId, address: { equals: w.wallet, mode: "insensitive" } },
          data: { isWinner: true, amount: w.amount.toString() },
        }),
      ),
      db.event.update({
        where: { id: eventId },
        data: {
          state: "DISTRIBUTING",
          revealedAt: new Date(),
          txs: { create: { kind: "REVEAL", txHash, status: "CONFIRMED" } },
        },
      }),
    ]);

    console.log(`[watcher] revealed event ${eventId} (${winners.length} winners)`);
  } catch (err) {
    console.error(`[watcher] reveal failed for event ${eventId}`, err);
  }
}

async function distributeBatch(eventId: string) {
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  if (event.state !== "DISTRIBUTING") return;

  try {
    const txHash = await luckySplitOperator.write.distribute([
      BigInt(event.contractEventId!),
      DISTRIBUTE_BATCH_SIZE,
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      // Leave state as DISTRIBUTING so the next tick retries the batch.
      await db.event.update({
        where: { id: eventId },
        data: { txs: { create: { kind: "DISTRIBUTE_BATCH", txHash, status: "FAILED" } } },
      });
      console.error(`[watcher] distribute() reverted on-chain for event ${eventId}, tx ${txHash}`);
      return;
    }

    const winners = (await luckySplitRead.read.getWinners([BigInt(event.contractEventId!)])) as Array<{
      wallet: string;
      amount: bigint;
      paid: boolean;
      blocked: boolean;
    }>;

    const [, , , stateIndex] = (await luckySplitRead.read.getEventSummary([
      BigInt(event.contractEventId!),
    ])) as [string, number, number, number, ...unknown[]];

    const isCompleted = EVENT_STATE_NAMES[stateIndex] === "COMPLETED";

    await db.$transaction([
      ...winners.map((w) =>
        db.walletEntry.updateMany({
          where: { eventId, address: { equals: w.wallet, mode: "insensitive" } },
          data: { paid: w.paid, blocked: w.blocked },
        }),
      ),
      db.event.update({
        where: { id: eventId },
        data: {
          state: isCompleted ? "COMPLETED" : "DISTRIBUTING",
          completedAt: isCompleted ? new Date() : undefined,
          txs: { create: { kind: "DISTRIBUTE_BATCH", txHash, status: "CONFIRMED" } },
        },
      }),
    ]);

    console.log(`[watcher] distributed batch for event ${eventId}${isCompleted ? " -- COMPLETED" : ""}`);
  } catch (err) {
    console.error(`[watcher] distribute failed for event ${eventId}`, err);
  }
}
