"use client";

import { useRouter } from "next/navigation";
import { StateBadge, ModeBadge } from "@/components/Badge";
import { formatUsdc, formatDate } from "@/lib/format";
import type { MyEventSummary } from "@/lib/api";

export function EventListTable({
  events,
  emptyLabel,
}: {
  events: MyEventSummary[] | null;
  emptyLabel: string;
}) {
  const router = useRouter();

  if (!events) return <p className="text-sm text-muted animate-pulse">Loading…</p>;
  if (events.length === 0) return <div className="glass-card p-8 text-center text-muted">{emptyLabel}</div>;

  return (
    <div className="glass-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted border-b border-white/8">
            <th className="py-3 px-5 font-medium">Event</th>
            <th className="py-3 px-5 font-medium">Mode</th>
            <th className="py-3 px-5 font-medium">Winners</th>
            <th className="py-3 px-5 font-medium">Prize Pool</th>
            <th className="py-3 px-5 font-medium">Created</th>
            <th className="py-3 px-5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr
              key={e.id}
              onClick={() => router.push(`/dashboard/events/${e.id}`)}
              className="border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/5"
            >
              <td className="py-3 px-5 text-white">#{e.contractEventId ?? "…"}</td>
              <td className="py-3 px-5">
                <ModeBadge mode={e.mode} />
              </td>
              <td className="py-3 px-5 text-white">
                {e.numWinners}/{e.numWallets}
              </td>
              <td className="py-3 px-5 text-white">{formatUsdc(e.totalDeposit)} USDC</td>
              <td className="py-3 px-5 text-muted">{formatDate(e.createdAt)}</td>
              <td className="py-3 px-5">
                <StateBadge state={e.state} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
