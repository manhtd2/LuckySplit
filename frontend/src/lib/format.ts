const USDC_DECIMALS = 6;

/** Formats 6-decimal USDC base units (as a string, to avoid float precision loss) into a display string. */
export function formatUsdc(baseUnits: string | null | undefined): string {
  if (!baseUnits) return "0.00";
  const value = BigInt(baseUnits);
  const divisor = 10n ** BigInt(USDC_DECIMALS);
  const whole = value / divisor;
  const frac = value % divisor;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").slice(0, 2);
  return `${whole.toLocaleString("en-US")}.${fracStr}`;
}

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const EVENT_STATE_LABEL: Record<string, string> = {
  OPEN: "Draft",
  FUNDED: "Funded",
  COMMITTED: "Revealing",
  DISTRIBUTING: "Distributing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const MODE_LABEL: Record<string, string> = {
  RANDOM_SPLIT: "Random Split",
  FIXED_AMOUNT: "Fixed Amount",
};
