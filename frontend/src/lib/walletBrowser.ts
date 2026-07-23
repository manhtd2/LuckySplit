"use client";

import type { EIP1193Provider } from "viem";
import { stringToHex } from "viem";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

/** Requests account access from an injected browser wallet (MetaMask etc). */
export async function connectBrowserWallet(): Promise<string> {
  const provider = window.ethereum;
  if (!provider) {
    throw new Error("No browser wallet found. Install MetaMask or another EVM wallet extension.");
  }
  const accounts = (await provider.request({ method: "eth_requestAccounts", params: undefined })) as string[];
  if (!accounts[0]) throw new Error("No account returned by wallet");
  return accounts[0];
}

/** Signs a plain text message (personal_sign) -- chain-agnostic, proves key ownership only. */
export async function signMessageWithBrowserWallet(address: string, message: string): Promise<string> {
  const provider = window.ethereum;
  if (!provider) {
    throw new Error("No browser wallet found. Install MetaMask or another EVM wallet extension.");
  }
  const signature = await provider.request({
    method: "personal_sign",
    params: [stringToHex(message), address as `0x${string}`],
  });
  return signature;
}
