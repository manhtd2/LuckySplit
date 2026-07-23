import { EVENT_STATE_LABEL, MODE_LABEL } from "@/lib/format";
import type { EventMode, EventState } from "@/lib/api";

const STATE_STYLES: Record<EventState, string> = {
  OPEN: "bg-white/8 text-muted",
  FUNDED: "bg-blue/15 text-blue",
  COMMITTED: "bg-pink/15 text-pink",
  DISTRIBUTING: "bg-blue/15 text-blue",
  COMPLETED: "bg-green/15 text-green",
  CANCELLED: "bg-red/15 text-red",
};

export function StateBadge({ state }: { state: EventState }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${STATE_STYLES[state]}`}>
      {EVENT_STATE_LABEL[state] ?? state}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: EventMode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-violet/15 px-2.5 py-1 text-xs font-medium text-violet">
      {MODE_LABEL[mode] ?? mode}
    </span>
  );
}
