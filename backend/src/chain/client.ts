import { createPublicClient, createWalletClient, fallback, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../env.js";

// Defined manually rather than relying on viem/chains exporting arcTestnet --
// that claim was never verified against the installed viem version (see
// LuckySplit_doc.md section 13.3). fallback() gives the same RPC redundancy
// goal regardless of whether the built-in export exists.
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [env.ARC_RPC_PRIMARY] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://testnet.arcscan.app" },
  },
});

const transport = fallback([
  http(env.ARC_RPC_PRIMARY),
  http(env.ARC_RPC_FALLBACK_1),
  http(env.ARC_RPC_FALLBACK_2),
]);

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport,
});

export const operatorAccount = privateKeyToAccount(env.OPERATOR_PRIVATE_KEY as `0x${string}`);

export const operatorWalletClient = createWalletClient({
  account: operatorAccount,
  chain: arcTestnet,
  transport,
});
