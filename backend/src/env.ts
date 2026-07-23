import { z } from "zod";

const schema = z.object({
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  ARC_RPC_PRIMARY: z.string().default("https://rpc.testnet.arc.network"),
  ARC_RPC_FALLBACK_1: z.string().default("https://rpc.quicknode.testnet.arc.network"),
  ARC_RPC_FALLBACK_2: z.string().default("https://rpc.blockdaemon.testnet.arc.network"),

  LUCKYSPLIT_CONTRACT_ADDRESS: z.string().min(1, "LUCKYSPLIT_CONTRACT_ADDRESS is required"),
  USDC_ADDRESS: z.string().default("0x3600000000000000000000000000000000000000"),

  // Platform operator: drives commit/reveal/distribute automatically.
  // Same demo key as the deployer/operator set in contracts/.env for now.
  OPERATOR_PRIVATE_KEY: z.string().min(1, "OPERATOR_PRIVATE_KEY is required"),

  CIRCLE_API_KEY: z.string().min(1, "CIRCLE_API_KEY is required"),
  CIRCLE_ENTITY_SECRET: z.string().min(1, "CIRCLE_ENTITY_SECRET is required"),
  CIRCLE_WALLET_SET_ID: z.string().min(1, "CIRCLE_WALLET_SET_ID is required"),

  WATCHER_POLL_INTERVAL_MS: z.string().default("3000"),
  DISTRIBUTE_BATCH_SIZE: z.string().default("25"),
});

export const env = schema.parse(process.env);
