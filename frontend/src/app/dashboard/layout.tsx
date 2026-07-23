"use client";

import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/auth";
import { OnboardingGate } from "./OnboardingGate";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, organizer } = useAuth();

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-muted">Loading…</div>;
  }

  if (!organizer) {
    return <OnboardingGate />;
  }

  return (
    <div className="flex-1 flex">
      <Sidebar />
      <main className="flex-1 px-6 sm:px-8 py-8 overflow-y-auto">{children}</main>
    </div>
  );
}
