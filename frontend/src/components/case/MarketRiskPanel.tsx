import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRow, type DocumentRequirement } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";

const NIVEAU_LABELS: Record<string, string> = {
  niveau_1: "Niveau 1 — risque courant",
  niveau_2: "Niveau 2 — risque significatif",
  niveau_3: "Niveau 3 — risque majeur",
};

// [ARBITRAGE, voir migration v6] Le niveau de risque du marché (Annexe B)
// est toujours une décision humaine du Département, jamais déduite
// automatiquement d'un montant ou d'un corps de métier — le référentiel la
// décrit comme arrêtée "lors de la préparation du chantier ou de la
// réunion de lancement". Cette classification déclenche ensuite des
// exigences documentaires cumulatives (niveau 2 ⊂ niveau 3) suivies via B3.
export function MarketRiskPanel({ caseRow, onUpdated }: { caseRow: CaseRow; onUpdated: () => void }) {
  const { currentUser } = useApp();
  const [niveau, setNiveau] = useState(caseRow.niveau_risque_marche ?? "");
  const [justification, setJustification] = useState(caseRow.niveau_risque_marche_justification ?? "");
  const [required, setRequired] = useState<{ niveau: string | null; required: DocumentRequirement[] }>({ niveau: null, required: [] });
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get(`/cases/${caseRow.id}/required-documents`).then((r) => setRequired(r.data)).catch(() => setRequired({ niveau: null, required: [] }));
  }
  useEffect(reload, [caseRow.id, caseRow.niveau_risque_marche]);

  async function classify() {
    if (!niveau) return;
    setError(null);
    try {
      await api.put(`/cases/${caseRow.id}/niveau-risque-marche`, {
        niveau_risque_marche: niveau, justification: justification || null, decided_by: currentUser?.id,
      });
      reload();
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  return (
    <div>
      {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex items-center gap-2 text-sm">
        Niveau actuel :{" "}
        {caseRow.niveau_risque_marche ? (
          <Badge label={NIVEAU_LABELS[caseRow.niveau_risque_marche]} tone={caseRow.niveau_risque_marche === "niveau_3" ? "critique" : caseRow.niveau_risque_marche === "niveau_2" ? "moyenne" : "faible"} />
        ) : (
          <span className="text-slate-400">non classifié</span>
        )}
      </div>
      {caseRow.niveau_risque_marche_justification && (
        <div className="mt-1 text-xs text-slate-500">Justification : {caseRow.niveau_risque_marche_justification}</div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500">Niveau de risque du marché</label>
          <select value={niveau} onChange={(e) => setNiveau(e.target.value as any)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">— choisir —</option>
            {Object.entries(NIVEAU_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-slate-500">Justification (recommandée)</label>
          <input value={justification} onChange={(e) => setJustification(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <button onClick={classify} disabled={!niveau} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          Classifier
        </button>
      </div>

      {required.niveau && (
        <div className="mt-4">
          <div className="text-xs font-medium text-slate-500 mb-1">Documents complémentaires requis pour ce niveau (cumulatifs)</div>
          <ul className="space-y-1 text-sm">
            {required.required.map((d) => (
              <li key={d.document_type} className="flex items-center justify-between rounded border border-slate-100 px-3 py-1.5">
                <span>{d.label}</span>
                <Badge label={d.statut ?? "non déposé"} tone={d.statut ?? undefined} />
              </li>
            ))}
            {required.required.length === 0 && <li className="text-slate-400">Aucune exigence complémentaire pour ce niveau.</li>}
          </ul>
          <p className="mt-1 text-xs text-slate-400">
            Le dépôt/validation de ces documents se fait via l'écran B3 — Documents préalables (même mécanisme, statut suivi ici pour vérifier la complétude vis-à-vis du niveau du marché).
          </p>
        </div>
      )}
    </div>
  );
}
