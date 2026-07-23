"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, CheckCircle2, Clock, Coins, ShieldCheck, ExternalLink } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StateBadge, ModeBadge } from "@/components/Badge";
import { LinkButton } from "@/components/Button";
import { WalletCard } from "@/components/WalletCard";
import { useAuth } from "@/lib/auth";
import { getMyEvents, type MyEventSummary } from "@/lib/api";
import { formatUsdc } from "@/lib/format";

export default function DashboardPage() {
  const { token, organizer } = useAuth();
  const [events, setEvents] = useState<MyEventSummary[] | null>(null);

  useEffect(() => {
    if (!token) return;
    getMyEvents(token).then(setEvents).catch(() => setEvents([]));
  }, [token]);

  const completed = events?.filter((e) => e.state === "COMPLETED") ?? [];
  const inProgress = events?.filter((e) => !["OPEN", "COMPLETED", "CANCELLED"].includes(e.state)) ?? [];
  const totalDistributed = completed.reduce((sum, e) => sum + BigInt(e.totalDeposit ?? "0"), 0n);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome back, <span className="gradient-text">{organizer?.displayName}</span> 👋
          </h1>
          <p className="text-muted text-sm mt-1">Create. Randomize. Share joy.</p>
        </div>
        <LinkButton href="/dashboard/create">+ Create New Event</LinkButton>
      </div>

      <WalletCard />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Calendar size={20} />} color="blue" label="Total Events" value={String(events?.length ?? "…")} hint="All time" />
        <StatCard
          icon={<CheckCircle2 size={20} />}
          color="purple"
          label="Completed"
          value={String(completed.length)}
          hint={events?.length ? `${Math.round((completed.length / events.length) * 100)}% completion` : undefined}
        />
        <StatCard icon={<Clock size={20} />} color="pink" label="In Progress" value={String(inProgress.length)} hint="Active events" />
        <StatCard
          icon={<Coins size={20} />}
          color="pink"
          label="Total Distributed"
          value={`${formatUsdc(totalDistributed.toString())} USDC`}
          hint="Across completed events"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Recent Events</h2>
            <Link href="/dashboard/events" className="text-xs text-violet hover:text-magenta">
              View all
            </Link>
          </div>
          {!events ? (
            <p className="text-sm text-muted animate-pulse">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted">No events yet — create your first one.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-white/8">
                    <th className="py-2 pr-4 font-medium">Event</th>
                    <th className="py-2 pr-4 font-medium">Mode</th>
                    <th className="py-2 pr-4 font-medium">Prize Pool</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 5).map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => (window.location.href = `/dashboard/events/${e.id}`)}
                      className="border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/5"
                    >
                      <td className="py-3 pr-4 text-white">
                        #{e.contractEventId ?? "…"}
                        <div className="text-xs text-muted">
                          {e.numWallets} wallets · {e.numWinners} winners
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <ModeBadge mode={e.mode} />
                      </td>
                      <td className="py-3 pr-4 text-white">{formatUsdc(e.totalDeposit)} USDC</td>
                      <td className="py-3 pr-4">
                        <StateBadge state={e.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass-card p-6 flex flex-col items-center text-center">
          <div className="flex items-center gap-2 text-xs text-green mb-4 self-start">
            <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" /> Live on Arc Testnet
          </div>
          <div className="h-28 w-28 rounded-full glow-ring flex items-center justify-center bg-gradient-to-br from-violet/20 to-magenta/20 border border-violet/30 mb-4">
            <ShieldCheck size={40} className="text-violet" />
          </div>
          <h3 className="font-semibold text-white">Transparent & Verifiable</h3>
          <p className="text-sm text-muted mt-2">
            All random results are committed on-chain. Anyone can verify the outcome independently on Arc
            Explorer.
          </p>
          <a
            href="https://testnet.arcscan.app"
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center gap-1.5 text-sm text-violet hover:text-magenta"
          >
            View on Arc Explorer <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}
