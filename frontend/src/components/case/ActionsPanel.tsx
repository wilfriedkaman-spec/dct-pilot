import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRow } from "../../api";
import { Badge } from "../Badge";

export function ActionsPanel({ caseRow }: { caseRow: CaseRow }) {
  const [actions, setActions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reload() { api.get(`/cases/${caseRow.id}/actions-register`).then((r) => setActions(r.data)); }
  useEffect(reload, [caseRow.id]);

  async function setStatus(id: string, statut: string) {
    setError(null);
    try { await api.patch(`/actions-register/${id}`, { statut }); reload(); }
    catch (err) { setError(apiErrorMessage(err)); }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Distinct des NC : décisions/tâches issues des réunions, constats 🟠, évolutions du besoin ou réserves de réception.</p>
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr><th>Description</th><th>Origine</th><th>Échéance</th><th>Statut</th><th></th></tr>
        </thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a.id} className="border-t border-slate-100">
              <td className="py-1.5">{a.description}</td>
              <td className="text-xs">{a.origine}</td>
              <td className="text-xs">{a.date_limite ?? "—"}</td>
              <td><Badge label={a.statut} tone={a.statut === "termine" ? "valide" : a.statut === "en_cours" ? "a_corriger" : "default"} /></td>
              <td className="text-right">
                {a.statut !== "termine" && (
                  <button onClick={() => setStatus(a.id, "termine")} className="text-xs text-blue-600 hover:underline">clôturer</button>
                )}
              </td>
            </tr>
          ))}
          {actions.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-400">Aucune action.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
