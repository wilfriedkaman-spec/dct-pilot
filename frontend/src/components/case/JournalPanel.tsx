import { useEffect, useState } from "react";
import { api, type CaseRow } from "../../api";

export function JournalPanel({ caseRow }: { caseRow: CaseRow }) {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => { api.get(`/cases/${caseRow.id}/event-log`).then((r) => setEvents(r.data)); }, [caseRow.id]);

  return (
    <div>
      <div className="mb-2 inline-block rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-white">append-only</div>
      <ul className="space-y-1 text-sm">
        {events.map((e) => (
          <li key={e.id} className="rounded border border-slate-100 px-3 py-1.5">
            <span className="text-xs text-slate-400">{new Date(e.created_at).toLocaleString("fr-FR")}</span>{" "}
            <strong>{e.event_type.replaceAll("_", " ")}</strong> {e.actor_name ? `— ${e.actor_name}` : ""}
          </li>
        ))}
        {events.length === 0 && <li className="text-slate-400">Aucun événement.</li>}
      </ul>
    </div>
  );
}
