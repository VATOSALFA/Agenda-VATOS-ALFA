import AgendaView from "@/components/agenda/agenda-view";

export default function Home() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <AgendaView />
    </div>
  );
}
