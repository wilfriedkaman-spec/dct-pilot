import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CaseRow } from "../api";
import { Badge } from "../components/Badge";
import { NewCaseModal } from "./NewCaseModal";
import { useApp } from "../context/AppContext";

export function CasesList() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [showNew, setShowNew] = useState(false);
  const { can } = useApp();

  function reload() {
    api.get("/cases").then((res) => setCases(res.data));
  }

  useEffect(() => { reload(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Dossiers</h1>
        {/* Migration v8 (RBAC, Q6) : la création d'un dossier est réservée
           au secrétariat, au chef de service et au chef de département. */}
        {can("dossier", "creer") ? (
          <button
            onClick={() => setShowNew(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Nouveau dossier
          </button>
        ) : (
          <span className="text-xs text-slate-400" title="Rôle non autorisé à créer un dossier">
            Création de dossier non autorisée pour ce rôle
          </span>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Dossier</th><th>Type</th><th>Entreprise</th>
              <th>Phase</th><th>Statut</th><th>Criticité</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/dossiers/${c.id}`} className="font-medium text-slate-900 hover:text-blue-600">{c.case_number}</Link>
                  <div className="text-xs text-slate-500">{c.title}</div>
                </td>
                <td className="text-xs">{c.case_type === "type1_prestataire" ? "Type 1 — Prestataire" : "Type 2 — Direct"}</td>
                <td className="text-xs">{c.company_name ?? "—"}</td>
                <td><Badge label={c.phase} /></td>
                <td className="text-xs text-slate-600">{c.status}</td>
                <td>{c.niveau_critique_global ? <Badge label={c.niveau_critique_global} tone={c.niveau_critique_global} /> : "—"}</td>
              </tr>
            ))}
            {cases.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-400">Aucun dossier. Cliquez sur « + Nouveau dossier ».</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewCaseModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); reload(); }}
        />
      )}
    </div>
  );
}
