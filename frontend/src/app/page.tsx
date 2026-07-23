import Link from "next/link";
import { Sparkles, ShieldCheck, Users, Trophy } from "lucide-react";
import { PublicHeader } from "@/components/PublicHeader";
import { StateBadge, ModeBadge } from "@/components/Badge";
import { LinkButton } from "@/components/Button";
import { getPublicEvents, getLeaderboard } from "@/lib/api";
import { formatDate, formatUsdc } from "@/lib/format";

const RANK_STYLE = [
  "bg-gradient-to-br from-yellow-300 to-yellow-600 text-black", // 1st
  "bg-gradient-to-br from-slate-300 to-slate-500 text-black", // 2nd
  "bg-gradient-to-br from-amber-600 to-amber-800 text-white", // 3rd
];

export default async function HomePage() {
  const [events, leaderboard] = await Promise.all([
    getPublicEvents().catch(() => []),
    getLeaderboard().catch(() => []),
  ]);

  return (
    <div className="flex-1 flex flex-col">
      <PublicHeader />

      <section className="px-6 py-16 text-center max-w-4xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Empower Communities. <span className="gradient-text">Instant USDC Rewards</span> with
          Ultra-Fast, Low-Cost Arc Gas Fees.
        </h1>
        <p className="mt-4 text-muted text-lg">
          LuckySplit empowers KOLs and communities to host 100% transparent events on Arc. Experience
          lightning-fast P2P transactions, ultra-low fees, and pay gas directly with USDC.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <LinkButton href="/dashboard">Create an event</LinkButton>
          <LinkButton href="#events" variant="secondary">
            Explore events
          </LinkButton>
        </div>
      </section>

      <section className="px-6 pb-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto w-full">
        <FeatureCard
          icon={<Sparkles size={20} />}
          title="On-chain randomness"
          body="Winner selection and amount splitting run fully on-chain — anyone can independently verify the result."
        />
        <FeatureCard
          icon={<ShieldCheck size={20} />}
          title="Immutable & transparent"
          body="No upgrades, no backdoors. Every wallet, tx, and block height is public on Arc Explorer."
        />
        <FeatureCard
          icon={<Users size={20} />}
          title="No crypto needed"
          body="Organizers don't need a wallet — LuckySplit custodies via Circle. Winners just receive USDC."
        />
      </section>

      <section className="px-6 py-10 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={20} className="text-yellow-400" />
          <h2 className="text-xl font-bold">Top KOLs</h2>
          <span className="text-xs text-muted font-normal">— ranked by USDC actually distributed to winners</span>
        </div>
        {leaderboard.length === 0 ? (
          <div className="glass-card p-8 text-center text-muted">
            No completed events yet — the first KOL to distribute a prize takes the top spot.
          </div>
        ) : (
          <div className="glass-card divide-y divide-white/8">
            {leaderboard.map((entry, i) => (
              <Link
                key={entry.id}
                href={`/organizers/${entry.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    RANK_STYLE[i] ?? "bg-white/8 text-muted"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white truncate">{entry.displayName}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {entry.eventCount} event{entry.eventCount === 1 ? "" : "s"} distributed
                  </p>
                </div>
                <p className="text-white font-semibold shrink-0">{formatUsdc(entry.totalDistributed)} USDC</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="events" className="px-6 py-10 max-w-4xl mx-auto w-full flex-1">
        <h2 className="text-xl font-bold mb-4">Recent events</h2>
        {events.length === 0 ? (
          <div className="glass-card p-8 text-center text-muted">No events yet. Be the first to create one.</div>
        ) : (
          <div className="glass-card divide-y divide-white/8">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-white/5 transition"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">by {e.organizer.displayName}</p>
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
        )}
      </section>

      <footer className="px-6 py-6 text-center text-xs text-muted border-t border-white/8">
        © 2026 LuckySplit — built on Arc Testnet
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="glass-card p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet/15 text-violet mb-3">
        {icon}
      </div>
      <h3 className="font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-muted">{body}</p>
    </div>
  );
}
