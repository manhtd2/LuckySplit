// Run yourself: node --env-file=.env scripts/3-create-wallet-set.mjs
// Requires CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in backend/.env, and step 2
// (entity secret registration) already done. Creates the wallet set that
// holds every organizer's Circle-custodied wallet.
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  console.error("Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET in backend/.env.");
  process.exit(1);
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const res = await client.createWalletSet({ name: "LuckySplit" });
const walletSetId = res.data?.walletSet?.id;

if (!walletSetId) {
  console.error("Circle did not return a wallet set id:", JSON.stringify(res.data));
  process.exit(1);
}

console.log("\nWallet set created. Copy this into backend/.env as CIRCLE_WALLET_SET_ID:\n");
console.log(walletSetId);
console.log("\nAll Circle setup steps done -- backend/.env should now be fully filled in.\n");
