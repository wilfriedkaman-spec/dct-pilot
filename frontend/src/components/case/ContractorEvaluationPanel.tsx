import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRow, type EvaluationCriterion } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";

const SECTION_LABELS: Record<string, string> = {
  sst_environnement: "1. Santé, sécurité et environnement",
  organisation_chantier: "2. Organisation du chantier",
  exigences_contractuelles: "3. Respect des exigences contractuelles",
  gestion_ecarts: "4. Gestion des écarts",
  collaboration_paa: "5. Collaboration avec le Port Autonome d'Abidjan",
};

const APPRECIATION_TONE: Record<string, string> = {
  "Excellent": "valide", "Très satisfaisant": "valide", "Satisfaisant": "moyenne",
  "Acceptable sous réserve": "a_corriger", "Insuffisant": "critique",
};

// Annexe K — grille verbatim (21 critères, 0-4, /84). Le pourcentage et
// l'appréciation sont calculés côté serveur, jamais saisis (voir
// contractorEvaluation.ts) : une seule source de vérité entre la note et
// la conclusion affichée.
export function ContractorEvaluationPanel({ caseRow, onUpdated }: { caseRow: CaseRow; onUpdated: () => void }) {
  const { currentUser, can } = useApp();
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [notes, setNotes] = useState<Record<string, { note: number; observation: string }>>({});
  const [pointsForts, setPointsForts] = useState("");
  const [pointsAmeliorer, setPointsAmeliorer] = useState("");
  const [recommandations, setRecommandations] = useState("");
  const [observations, setObservations] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get("/contractor-evaluation-criteria").then((r) => setCriteria(r.data));
    api.get(`/cases/${caseRow.id}/contractor-evaluations`).then((r) => setHistory(r.data));
  }
  useEffect(reload, [caseRow.id]);

  const answeredCount = criteria.filter((c) => notes[c.item_code]?.note !== undefined).length;
  const complete = criteria.length > 0 && answeredCount === criteria.length;
  const sections = [...new Set(criteria.map((c) => c.section))];

  async function submit() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/contractor-evaluations`, {
        controller_id: currentUser?.id,
        points_forts: pointsForts || null, points_ameliorer: pointsAmeliorer || null,
        recommandations: recommandations || null, observations_complementaires: observations || null,
        scores: criteria.map((c) => ({ item_code: c.item_code, note: notes[c.item_code]?.note ?? 0, observation: notes[c.item_code]?.observation || null })),
      });
      setNotes({}); setPointsForts(""); setPointsAmeliorer(""); setRecommandations(""); setObservations(""); setShowForm(false);
      reload(); onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  return (
    <div>
      {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="space-y-2">
        {history.map((h) => (
          <div key={h.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span>{new Date(h.created_at).toLocaleDateString("fr-FR")} — {h.controller_name ?? "—"}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{h.total} / {h.max} ({h.pourcentage}%)</span>
                <Badge label={h.appreciation} tone={APPRECIATION_TONE[h.appreciation]} />
              </div>
            </div>
          </div>
        ))}
        {history.length === 0 && <div className="text-sm text-slate-400">Aucune évaluation QHSE du prestataire enregistrée.</div>}
      </div>

      {/* Migration v8 (RBAC) : réservé au contrôleur, au chef de service et
         au chef de département. */}
      {!showForm && (
        can("evaluation_prestataire", "creer") ? (
          <button onClick={() => setShowForm(true)} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            + Nouvelle évaluation QHSE du prestataire (Annexe K)
          </button>
        ) : (
          <p className="mt-3 text-xs text-slate-400">Ce rôle ne peut pas remplir la fiche d'évaluation du prestataire.</p>
        )
      )}

      {showForm && (
        <div className="mt-3 space-y-4 rounded-lg border border-slate-200 p-4">
          <div className="text-sm font-medium text-slate-700">Progression : {answeredCount} / {criteria.length}</div>
          {sections.map((section) => (
            <div key={section}>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{SECTION_LABELS[section] ?? section}</div>
              <div className="space-y-1">
                {criteria.filter((c) => c.section === section).map((c) => (
                  <div key={c.item_code} className="flex flex-wrap items-center gap-2 rounded border border-slate-100 px-2 py-1.5 text-sm">
                    <span className="flex-1 min-w-[220px]">{c.label}</span>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((n) => (
                        <button key={n} onClick={() => setNotes((d) => ({ ...d, [c.item_code]: { note: n, observation: d[c.item_code]?.observation ?? "" } }))}
                          className={`h-6 w-6 rounded text-xs border ${notes[c.item_code]?.note === n ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <input placeholder="Observation" value={notes[c.item_code]?.observation ?? ""}
                      onChange={(e) => setNotes((d) => ({ ...d, [c.item_code]: { note: d[c.item_code]?.note ?? 0, observation: e.target.value } }))}
                      className="min-w-[140px] flex-1 rounded border border-slate-200 px-2 py-0.5 text-xs" />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-2">
            <textarea placeholder="Points forts" value={pointsForts} onChange={(e) => setPointsForts(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" rows={2} />
            <textarea placeholder="Points à améliorer" value={pointsAmeliorer} onChange={(e) => setPointsAmeliorer(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" rows={2} />
            <textarea placeholder="Recommandations" value={recommandations} onChange={(e) => setRecommandations(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" rows={2} />
            <textarea placeholder="Observations complémentaires" value={observations} onChange={(e) => setObservations(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" rows={2} />
          </div>

          <div className="flex gap-2">
            <button onClick={submit} disabled={!complete} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              Enregistrer l'évaluation ({answeredCount}/{criteria.length})
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Annuler
            </button>
          </div>
          {!complete && <p className="text-xs text-orange-600">Les 21 critères doivent être notés (0 par défaut si non cliqué) avant l'enregistrement.</p>}
        </div>
      )}
    </div>
  );
}
