import { EventDetailClient } from "./EventDetailClient";

export default async function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventDetailClient id={id} isPublic />;
}
