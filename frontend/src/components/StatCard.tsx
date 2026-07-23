import type { ReactNode } from "react";

const ICON_BG: Record<string, string> = {
  blue: "bg-blue/20 text-blue",
  purple: "bg-purple/20 text-purple",
  pink: "bg-pink/20 text-pink",
  green: "bg-green/20 text-green",
};

export function StatCard({
  icon,
  color,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  color: keyof typeof ICON_BG;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="glass-card p-5 flex items-center gap-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${ICON_BG[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-bold text-white leading-tight">{value}</p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}
