import { decodeEventLog, type Abi, type TransactionReceipt } from "viem";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const abi = JSON.parse(readFileSync(join(__dirname, "LuckySplit.abi.json"), "utf8")) as Abi;

/** Extracts the on-chain eventId from an `EventCreated` log in a createEvent receipt. */
export function extractEventId(receipt: TransactionReceipt): number {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (decoded.eventName === "EventCreated") {
        const args = decoded.args as unknown as { eventId: bigint };
        return Number(args.eventId);
      }
    } catch {
      // log from a different contract/topic -- skip
    }
  }
  throw new Error("EventCreated log not found in receipt");
}
