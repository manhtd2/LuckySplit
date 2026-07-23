"use client";

import { use, useState } from "react";
import { EventDetailClient } from "@/app/events/[id]/EventDetailClient";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { fundEvent, startEvent, cancelEvent, ApiError, type EventDetailDto } from "@/lib/api";
import { formatUsdc } from "@/lib/format";

export default function ManageEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <EventDetailClient
      id={id}
      isPublic={false}
      actions={(event, refresh) => <OrganizerActions event={event} onDone={refresh} />}
    />
  );
}

function OrganizerActions({ event, onDone }: { event: EventDetailDto; onDone: () => void }) {
  const { token, organizer } = useAuth();
  const [totalAmount, setTotalAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (!token) return null;

  if (event.state === "OPEN") {
    const computedTotal =
      event.mode === "FIXED_AMOUNT" && event.fixedAmountPerWinner
        ? (BigInt(event.fixedAmountPerWinner) * BigInt(event.numWinners)).toString()
        : null;

    const balance = Number(organizer?.usdcBalance ?? "0");
    const requiredDisplay = event.mode === "RANDOM_SPLIT" ? totalAmount : computedTotal ? formatUsdc(computedTotal) : "0";
    const required = Number(requiredDisplay || "0");
    const insufficient = required > 0 && balance < required;

    return (
      <div className="w-full space-y-3">
        {error && <p className="text-sm text-red">{error}</p>}
        <p className="text-xs text-muted">
          Wallet balance: <span className="text-white font-medium">{organizer?.usdcBalance ?? "…"} USDC</span>
        </p>
        {event.mode === "RANDOM_SPLIT" ? (
          <div className="flex items-center gap-2">
            <input
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="Total prize pool (USDC)"
              className="rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-muted focus:outline-none focus:border-violet"
            />
            <Button disabled={busy !== null || !totalAmount} onClick={() => run("fund", () => fundEvent(token, event.id, totalAmount))}>
              {busy === "fund" ? "Funding…" : "Fund event"}
            </Button>
          </div>
        ) : (
          <Button disabled={busy !== null} onClick={() => run("fund", () => fundEvent(token, event.id))}>
            {busy === "fund"
              ? "Funding…"
              : `Fund ${computedTotal ? formatUsdc(computedTotal) : ""} USDC`}
          </Button>
        )}
        {insufficient && (
          <p className="text-xs text-pink">
            Not enough balance yet — send more USDC to your wallet address on the Dashboard first.
          </p>
        )}
      </div>
    );
  }

  if (event.state === "FUNDED") {
    return (
      <div className="w-full space-y-3">
        {error && <p className="text-sm text-red">{error}</p>}
        {!confirmStart ? (
          <div className="flex gap-3">
            <Button onClick={() => setConfirmStart(true)}>Start random draw</Button>
            <Button variant="danger" disabled={busy !== null} onClick={() => run("cancel", () => cancelEvent(token, event.id))}>
              {busy === "cancel" ? "Cancelling…" : "Cancel & refund"}
            </Button>
          </div>
        ) : (
          <div className="glass-card border-pink/30 p-4 space-y-3">
            <p className="text-sm font-medium text-white">This cannot be undone after this step.</p>
            <p className="text-xs text-muted">
              Once started, the commit is locked on-chain and cannot be redone or reversed. The result is
              revealed automatically once the target block is reached.
            </p>
            <div className="flex gap-3">
              <Button disabled={busy !== null} onClick={() => run("start", () => startEvent(token, event.id))}>
                {busy === "start" ? "Committing…" : "Confirm — start now"}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmStart(false)}>
                Back
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
