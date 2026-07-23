"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { StateBadge, ModeBadge } from "@/components/Badge";
import { getPublicEvent, getMyEvent, type EventDetailDto } from "@/lib/api";
import { formatUsdc, truncateAddress } from "@/lib/format";
import { useAuth } from "@/lib/auth";

const LIVE_STATES = new Set(["COMMITTED", "DISTRIBUTING"]);

export function EventDetailClient({
  id,
  isPublic,
  actions,
}: {
  id: string;
  isPublic: boolean;
  actions?: (event: EventDetailDto, refresh: () => void) => React.ReactNode;
}) {
  const { token } = useAuth();
  const [event, setEvent] = useState<EventDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = isPublic ? await getPublicEvent(id) : await getMyEvent(token!, id);
      setEvent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event");
    }
  }, [id, isPublic, token]);

  useEffect(() => {
    if (!isPublic && !token) return;
    // Deferred so the setState calls inside load() don't run synchronously
    // in the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(load);
  }, [load, isPublic, token]);

  useEffect(() => {
    if (!event || !LIVE_STATES.has(event.state)) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [event, load]);

  if (error) return <div className="glass-card p-6 text-red">{error}</div>;
  if (!event) return <div className="glass-card p-6 text-muted animate-pulse">Loading event…</div>;

  const showAmounts = event.state === "COMPLETED";

  return (
    <div className="space-y-6">
      <div className="glass-card p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            {event.organizer && (
              <Link href={`/organizers/${event.organizer.id}`} className="text-sm text-muted hover:text-white">
                by {event.organizer.displayName}
              </Link>
            )}
            <h1 className="text-2xl font-bold text-white mt-1">
              Event #{event.contractEventId ?? "…"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ModeBadge mode={event.mode} />
            <StateBadge state={event.state} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Info label="Wallets" value={String(event.numWallets)} />
          <Info label="Winners" value={String(event.numWinners)} />
          <Info label="Prize pool" value={event.totalDeposit ? `${formatUsdc(event.totalDeposit)} USDC` : "-"} />
          <Info
            label="Target block"
            value={event.targetBlock ?? "-"}
          />
        </div>

        {LIVE_STATES.has(event.state) && (
          <div className="mt-4 flex items-center gap-2 text-sm text-pink">
            <span className="h-2 w-2 rounded-full bg-pink animate-pulse" />
            Live — processing on-chain, refreshing automatically…
          </div>
        )}

        {actions && <div className="mt-6 flex flex-wrap gap-3">{actions(event, load)}</div>}
      </div>

      <div className="glass-card p-6">
        <h2 className="font-semibold text-white mb-4">
          Wallets{" "}
          {!showAmounts && event.wallets.length > 0 && (
            <span className="text-xs text-muted font-normal">(amounts hidden until completed)</span>
          )}
        </h2>
        {event.wallets.length === 0 ? (
          <p className="text-sm text-muted">Wallet list becomes public once the event is funded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-white/8">
                  <th className="py-2 pr-4 font-medium">Address</th>
                  <th className="py-2 pr-4 font-medium">Result</th>
                  <th className="py-2 pr-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {event.wallets.map((w) => (
                  <tr key={w.address} className="border-b border-white/5 last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-white">{truncateAddress(w.address, 6)}</td>
                    <td className="py-2 pr-4">
                      {!w.isWinner ? (
                        <span className="text-muted text-xs">—</span>
                      ) : w.blocked ? (
                        <span className="flex items-center gap-1.5 text-xs text-red">
                          <XCircle size={14} /> Won but blocked (refunded)
                        </span>
                      ) : w.paid ? (
                        <span className="flex items-center gap-1.5 text-xs text-green">
                          <CheckCircle2 size={14} /> Paid
                        </span>
                      ) : (
                        <span className="text-xs text-pink">Winner — pending</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right text-white">
                      {showAmounts && w.amount ? `${formatUsdc(w.amount)} USDC` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card p-6">
        <h2 className="font-semibold text-white mb-4">On-chain transactions</h2>
        {event.txs.length === 0 ? (
          <p className="text-sm text-muted">No transactions yet.</p>
        ) : (
          <ul className="space-y-2">
            {event.txs.map((tx) => (
              <li key={tx.txHash} className="flex items-center justify-between text-sm">
                <span className="text-white">{tx.kind}</span>
                <a
                  href={tx.explorerUrl ?? `https://testnet.arcscan.app/tx/${tx.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-violet hover:text-magenta text-xs font-mono"
                >
                  {truncateAddress(tx.txHash, 6)} <ExternalLink size={12} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted text-xs mb-1">{label}</p>
      <p className="text-white font-medium">{value}</p>
    </div>
  );
}
