import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getContract, type Abi } from "viem";
import { env } from "../env.js";
import { publicClient, operatorWalletClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const abi = JSON.parse(readFileSync(join(__dirname, "LuckySplit.abi.json"), "utf8")) as Abi;

export const contractAddress = env.LUCKYSPLIT_CONTRACT_ADDRESS as `0x${string}`;

/** Read-only calls, no signer needed. */
export const luckySplitRead = getContract({
  address: contractAddress,
  abi,
  client: publicClient,
});

/** Write calls signed by the platform operator (commit/reveal/distribute --
 *  see LuckySplit_doc.md section 5: content-neutral, no organizer intent needed). */
export const luckySplitOperator = getContract({
  address: contractAddress,
  abi,
  client: { public: publicClient, wallet: operatorWalletClient },
});

export const EVENT_STATE_NAMES = [
  "OPEN",
  "FUNDED",
  "COMMITTED",
  "DISTRIBUTING",
  "COMPLETED",
  "CANCELLED",
] as const;
