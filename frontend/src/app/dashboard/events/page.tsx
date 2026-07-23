"use client";

import { useEffect, useState } from "react";
import { EventListTable } from "../EventListTable";
import { useAuth } from "@/lib/auth";
import { getMyEvents, type MyEventSummary } from "@/lib/api";

export default function MyEventsPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState<MyEventSummary[] | null>(null);

  useEffect(() => {
    if (!token) return;
    getMyEvents(token).then(setEvents).catch(() => setEvents([]));
  }, [token]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">My Events</h1>
      <EventListTable events={events} emptyLabel="No events yet — create your first one." />
    </div>
  );
}
