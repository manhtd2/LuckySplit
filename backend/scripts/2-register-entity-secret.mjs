// Run yourself: node --env-file=.env scripts/2-register-entity-secret.mjs
// Requires CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET already filled in backend/.env
// (from step 1). Registers the ciphertext with Circle and downloads a
// recovery file OUTSIDE the repo -- store it somewhere safe, never commit it.
import os from "node:os";
import path from "node:path";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  console.error("Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET in backend/.env -- fill those in first.");
  process.exit(1);
}

const recoveryFileDownloadPath = path.join(os.homedir(), ".circle");
const response = await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath,
});

console.log("\nRegistered. Recovery file saved to:", recoveryFileDownloadPath);
console.log("Keep that file safe and never commit it -- it's the only way to recover wallet access.");
console.log("\nNext: run scripts/3-create-wallet-set.mjs to get your CIRCLE_WALLET_SET_ID.\n");
