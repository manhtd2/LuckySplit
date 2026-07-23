import { isAddress, getAddress } from "viem";

export interface WalletListError {
  index: number;
  input: string;
  reason: "invalid_format" | "duplicate";
}

export interface WalletListValidation {
  ok: boolean;
  errors: WalletListError[];
  /** Checksummed, ascending-sorted addresses -- ready for createEvent(). */
  sorted: `0x${string}`[];
}

/**
 * LuckySplit_doc.md section 4: "Validate định dạng, báo lỗi cụ thể để
 * organizer tự sửa (không tự ý loại bỏ)" -- report every bad entry with its
 * original input and position, never silently drop or dedupe.
 */
export function validateWalletList(raw: string[]): WalletListValidation {
  const errors: WalletListError[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    const input = raw[i].trim();
    if (!isAddress(input)) {
      errors.push({ index: i, input, reason: "invalid_format" });
      continue;
    }
    const checksummed = getAddress(input);
    if (seen.has(checksummed.toLowerCase())) {
      errors.push({ index: i, input, reason: "duplicate" });
      continue;
    }
    seen.add(checksummed.toLowerCase());
  }

  const sorted = [...seen]
    .map((a) => getAddress(a))
    .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));

  return { ok: errors.length === 0, errors, sorted };
}
