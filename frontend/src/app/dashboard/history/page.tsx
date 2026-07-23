"use client";

import { useEffect, useState } from "react";
import { EventListTable } from "../EventListTable";
import { useAuth } from "@/lib/auth";
import { getMyEvents, type MyEventSummary } from "@/lib/api";

export default function HistoryPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState<MyEventSummary[] | null>(null);

  useEffect(() => {
    if (!token) return;
    getMyEvents(token)
      .then((all) => setEvents(all.filter((e) => e.state === "COMPLETED" || e.state === "CANCELLED")))
      .catch(() => setEvents([]));
  }, [token]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">History</h1>
      <EventListTable events={events} emptyLabel="No completed or cancelled events yet." />
    </div>
  );
}
