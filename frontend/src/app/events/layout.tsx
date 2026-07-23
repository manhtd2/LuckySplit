import { PublicHeader } from "@/components/PublicHeader";

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col">
      <PublicHeader />
      <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">{children}</main>
    </div>
  );
}
