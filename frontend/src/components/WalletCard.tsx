"use client";

import { useState } from "react";
import { Copy, Check, RefreshCw, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function WalletCard({ compact = false }: { compact?: boolean }) {
  const { organizer, refreshBalance } = useAuth();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (!organizer) return null;

  async function handleCopy() {
    await navigator.clipboard.writeText(organizer!.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshBalance();
    } finally {
      setRefreshing(false);
    }
  }

  const balance = organizer.usdcBalance ?? "0";
  const isEmpty = Number(balance) <= 0;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white font-medium">Your balance</span>
          <span className="text-white font-semibold">{balance} USDC</span>
        </div>
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-between gap-2 rounded-lg bg-white/5 border border-white/10 px-2.5 py-2 text-xs font-mono text-muted hover:text-white hover:bg-white/8 transition"
        >
          <span className="truncate">{organizer.walletAddress}</span>
          {copied ? <Check size={13} className="shrink-0 text-green" /> : <Copy size={13} className="shrink-0" />}
        </button>
      </div>
    );
  }

  return (
    <div className={`glass-card p-6 ${isEmpty ? "glow-ring border-violet/30" : ""}`}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet/15 text-violet">
            <Wallet size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-white">Your LuckySplit wallet</h2>
            <p className="text-xs text-muted">Custodied for you via Circle — no crypto experience needed</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div>
          <p className="text-xs text-muted mb-1">Balance</p>
          <p className="text-3xl font-bold text-white">
            {balance} <span className="text-lg text-muted font-normal">USDC</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted mb-1">Deposit address (Arc Testnet)</p>
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-between gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm font-mono text-white hover:bg-white/8 transition"
          >
            <span className="truncate">{organizer.walletAddress}</span>
            {copied ? <Check size={16} className="shrink-0 text-green" /> : <Copy size={16} className="shrink-0 text-muted" />}
          </button>
        </div>
      </div>

      {isEmpty && (
        <p className="text-sm text-pink mt-4">
          Send USDC to the address above to fund your first event — this is the only wallet you need.
        </p>
      )}
    </div>
  );
}
