import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { env } from "../env.js";

export const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: env.CIRCLE_API_KEY,
  entitySecret: env.CIRCLE_ENTITY_SECRET,
});

/**
 * One EOA wallet per organizer, created in the shared wallet set from env.
 * EOA (not SCA): Arc's gas asset is USDC itself, so there's no separate
 * native-gas token to sponsor -- see LuckySplit_doc.md section 7 (Circle
 * custody, "LuckySplit custody thay organizer").
 */
export async function createOrganizerWallet(): Promise<{ walletId: string; address: string }> {
  const res = await circleClient.createWallets({
    accountType: "EOA",
    blockchains: ["ARC-TESTNET"],
    count: 1,
    walletSetId: env.CIRCLE_WALLET_SET_ID,
  });

  const wallet = res.data?.wallets?.[0];
  if (!wallet) throw new Error("Circle did not return a wallet");

  return { walletId: wallet.id, address: wallet.address };
}

export async function getWalletUsdcBalance(walletId: string): Promise<string> {
  const res = await circleClient.getWalletTokenBalance({ id: walletId });
  const usdc = res.data?.tokenBalances?.find((b) => b.token?.symbol === "USDC");
  return usdc?.amount ?? "0";
}

/**
 * Contract execution via the organizer's Circle wallet -- used for actions
 * that represent organizer intent (fundEvent's prerequisite `approve`,
 * fundEvent, cancelEvent). Polls until a terminal state (see skill docs);
 * webhook subscription is a follow-up improvement, not needed for MVP scale.
 */
export async function executeAsOrganizer(params: {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: unknown[];
}): Promise<{ txHash: string }> {
  const res = await circleClient.createContractExecutionTransaction({
    walletId: params.walletId,
    contractAddress: params.contractAddress,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters: params.abiParameters,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });

  const txId = res.data?.id;
  if (!txId) throw new Error("Circle did not return a transaction id");

  return pollUntilTerminal(txId);
}

async function pollUntilTerminal(transactionId: string): Promise<{ txHash: string }> {
  const terminal = new Set(["COMPLETE", "FAILED", "DENIED", "CANCELLED"]);
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await circleClient.getTransaction({ id: transactionId });
    const tx = res.data?.transaction;
    if (tx?.state && terminal.has(tx.state)) {
      if (tx.state !== "COMPLETE") {
        throw new Error(`Circle transaction ${transactionId} ended in ${tx.state}`);
      }
      return { txHash: tx.txHash ?? "" };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Circle transaction ${transactionId} did not reach a terminal state in time`);
}
