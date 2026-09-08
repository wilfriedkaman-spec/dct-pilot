import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRow, type User } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";

const CORPS_METIER = ["Fondations", "VRD"];

export function ExecutionPanel({ caseRow, onUpdated }: { caseRow: CaseRow; users: User[]; onUpdated: () => void }) {
  const { currentUser } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<string>("");
  const [resultat, setResultat] = useState("conforme");
  const [observation, setObservation] = useState("");
  const [lastCreated, setLastCreated] = useState<string | null>(null);

  function reload() {
    api.get(`/cases/${caseRow.id}/paq-points`).then((r) => setPoints(r.data));
    api.get(`/cases/${caseRow.id}/visits`).then((r) => setVisits(r.data));
  }
  useEffect(reload, [caseRow.id]);

  async function importCorpsMetier(corps: string) {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/paq-points/import`, { corps_metier: corps, created_by: currentUser?.id });
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function removePoint(id: string) {
    const motif = window.prompt("Motif du retrait (obligatoire) :");
    if (!motif) return;
    try {
      await api.patch(`/paq-points/${id}/remove`, { removal_motif: motif });
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function recordResult() {
    if (!selectedPoint) return;
    setError(null);
    setLastCreated(null);
    try {
      // une visite planifiée par saisie, pour rester simple dans ce prototype
      const visit = await api.post(`/cases/${caseRow.id}/visits`, {
        visit_type: "planifiee", conducted_by: currentUser?.id, zone: "Zone chantier",
      });
      const res = await api.post(`/visits/${visit.data.id}/results`, {
        paq_control_point_id: selectedPoint, resultat, observation: observation || null, decided_by: currentUser?.id,
      });
      if (res.data.created_nc) setLastCreated(`🔴 NC créée automatiquement : ${res.data.created_nc.nc_number} (${res.data.created_nc.criticite})`);
      else if (res.data.created_action) setLastCreated(`🟠 Action créée dans le Registre des actions`);
      setObservation("");
      reload();
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  const activePoints = points.filter((p) => !p.removed);

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {lastCreated && <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">{lastCreated}</div>}

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-900">B4 — Construction du PAQ</h3>
          <div className="flex gap-2">
            {CORPS_METIER.map((c) => (
              <button key={c} onClick={() => importCorpsMetier(c)} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                + Importer « {c} »
              </button>
            ))}
          </div>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr><th>Point</th><th>Type</th><th>Angle</th><th></th></tr>
          </thead>
          <tbody>
            {activePoints.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-1.5">{p.designation} <span className="text-xs text-slate-400">({p.corps_metier})</span></td>
                <td><Badge label={p.type} tone={p.type === "PA" ? "critique" : "default"} /></td>
                <td className="text-xs">{p.angle}</td>
                <td className="text-right"><button onClick={() => removePoint(p.id)} className="text-xs text-slate-400 hover:text-red-600">retirer</button></td>
              </tr>
            ))}
            {activePoints.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-400">Aucun point — importez un corps de métier.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">C — Enregistrer un résultat de contrôle</h3>
        <p className="text-xs text-slate-500 mb-2">🔴 non conforme → NC automatique · 🟠 conforme avec observation → Registre des actions.</p>
        <div className="grid grid-cols-3 gap-3">
          <select value={selectedPoint} onChange={(e) => setSelectedPoint(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">— point de contrôle —</option>
            {activePoints.map((p) => <option key={p.id} value={p.id}>{p.designation} ({p.type})</option>)}
          </select>
          <select value={resultat} onChange={(e) => setResultat(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="conforme">🟢 Conforme</option>
            <option value="conforme_avec_observation">🟠 Conforme avec observation</option>
            <option value="non_conforme">🔴 Non conforme</option>
          </select>
          <button onClick={recordResult} disabled={!selectedPoint} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            Enregistrer
          </button>
        </div>
        <input placeholder="Observation" value={observation} onChange={(e) => setObservation(e.target.value)}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">Historique des visites</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {visits.map((v) => (
            <li key={v.id} className="rounded border border-slate-100 px-3 py-1.5">
              {new Date(v.visit_date).toLocaleString("fr-FR")} — {v.visit_type} — {v.conducted_by_name} — {(v.results ?? []).length} résultat(s)
            </li>
          ))}
          {visits.length === 0 && <li className="text-slate-400">Aucune visite enregistrée.</li>}
        </ul>
      </section>
    </div>
  );
}
