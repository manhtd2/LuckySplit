"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";

export function OnboardingGate() {
  const { loginWithWallet } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      await loginWithWallet(displayName.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="glass-card glow-ring p-8 w-full max-w-md">
        <div className="mb-6">
          <Logo />
        </div>
        <h1 className="text-xl font-bold text-white mb-1">Sign in with your wallet</h1>
        <p className="text-sm text-muted mb-6">
          No email, no KYC — just sign a message with your own wallet (e.g. MetaMask) to prove it&apos;s
          you. LuckySplit then creates a <span className="text-white">separate</span> wallet, custodied
          for you via Circle, to hold your event funds — your login wallet never touches that money.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">
              Display name <span className="opacity-70">(only needed the first time you sign in)</span>
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Minh KOL"
              maxLength={80}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-muted focus:outline-none focus:border-violet"
            />
          </div>
          {error && <p className="text-sm text-red">{error}</p>}
          <Button onClick={handleConnect} disabled={loading} className="w-full">
            <Wallet size={16} />
            {loading ? "Waiting for wallet…" : "Connect wallet & sign in"}
          </Button>
        </div>
      </div>
    </div>
  );
}
