import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { StateBadge, ModeBadge } from "@/components/Badge";
import { getPublicOrganizer } from "@/lib/api";
import { formatDate } from "@/lib/format";

export default async function OrganizerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organizer = await getPublicOrganizer(id).catch(() => null);

  return (
    <div className="flex-1 flex flex-col">
      <PublicHeader />
      <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        {!organizer ? (
          <div className="glass-card p-6 text-red">Organizer not found.</div>
        ) : (
          <>
            <div className="glass-card p-6 mb-6">
              <h1 className="text-2xl font-bold text-white">{organizer.displayName}</h1>
              <p className="text-xs text-muted font-mono mt-1">{organizer.walletAddress}</p>
              <p className="text-sm text-muted mt-3">
                {organizer.events.length} event{organizer.events.length === 1 ? "" : "s"} organized —
                public history builds trust since organizers aren&apos;t identity-verified.
              </p>
            </div>

            <div className="glass-card divide-y divide-white/8">
              {organizer.events.map((e) => (
                <Link
                  key={e.id}
                  href={`/events/${e.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-white/5 transition"
                >
                  <div>
                    <p className="font-medium text-white">Event #{e.contractEventId ?? "…"}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {e.numWallets} wallets · {e.numWinners} winners · {formatDate(e.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ModeBadge mode={e.mode} />
                    <StateBadge state={e.state} />
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
