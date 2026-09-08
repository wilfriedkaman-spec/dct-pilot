import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRow, type ChecklistLibraryItem } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";

const SECTION_LABELS: Record<string, string> = {
  administratif: "Administratif",
  organisation: "Organisation",
  sst: "SST",
  environnement: "Environnement",
  portuaire: "Contraintes portuaires",
};

const CONCLUSION_OPTIONS = [
  { value: "conforme", label: "🟢 Conforme" },
  { value: "conforme_sous_reserve", label: "🟠 Conforme sous réserve" },
  { value: "non_conforme", label: "🔴 Non conforme" },
];

// [Migration v6] Remplace l'ancienne case "check-list de démarrage réalisée"
// (auparavant toujours vraie dès qu'une réunion était tenue — une
// tautologie). Les 29 points sont ceux de l'Annexe E, verbatim. Soumission
// en un seul envoi transactionnel : un déclencheur différé refuse côté
// base toute check-list incomplète, même si l'écran devrait déjà l'empêcher.
export function StartupChecklistPanel({ caseRow, onUpdated }: { caseRow: CaseRow; onUpdated: () => void }) {
  const { currentUser } = useApp();
  const [library, setLibrary] = useState<ChecklistLibraryItem[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [responses, setResponses] = useState<Record<string, { reponse: string; observation: string }>>({});
  const [prestataireRep, setPrestataireRep] = useState("");
  const [conclusion, setConclusion] = useState("conforme");
  const [reserves, setReserves] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get("/startup-checklist-library").then((r) => setLibrary(r.data));
    api.get(`/cases/${caseRow.id}/detailed-startup-checklists`).then((r) => setHistory(r.data));
  }
  useEffect(reload, [caseRow.id]);

  function setResp(code: string, field: "reponse" | "observation", value: string) {
    setResponses((r) => ({ ...r, [code]: { reponse: r[code]?.reponse ?? "", observation: r[code]?.observation ?? "", [field]: value } }));
  }

  const answeredCount = library.filter((l) => responses[l.item_code]?.reponse).length;
  const complete = library.length > 0 && answeredCount === library.length;

  async function submit() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/detailed-startup-checklists`, {
        controller_id: currentUser?.id,
        prestataire_representative: prestataireRep || null,
        conclusion,
        reserves: reserves || null,
        responses: library.map((l) => ({
          item_code: l.item_code,
          reponse: responses[l.item_code]?.reponse || "na",
          observation: responses[l.item_code]?.observation || null,
        })),
      });
      setResponses({}); setPrestataireRep(""); setReserves(""); setConclusion("conforme"); setShowForm(false);
      reload();
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  const sections = [...new Set(library.map((l) => l.section))];

  return (
    <div>
      {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="space-y-2">
        {history.map((h) => (
          <div key={h.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span>{new Date(h.visit_date).toLocaleDateString("fr-FR")} — {h.controller_name ?? "—"} — {h.responses.length} points renseignés</span>
            <Badge label={h.conclusion} tone={h.conclusion === "conforme" ? "valide" : h.conclusion === "conforme_sous_reserve" ? "a_corriger" : "critique"} />
          </div>
        ))}
        {history.length === 0 && <div className="text-sm text-slate-400">Aucune check-list de démarrage détaillée renseignée.</div>}
      </div>

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          + Renseigner la check-list de démarrage (29 points — Annexe E)
        </button>
      )}

      {showForm && (
        <div className="mt-3 space-y-4 rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">Progression : {answeredCount} / {library.length}</div>
            <input placeholder="Représentant du prestataire présent" value={prestataireRep} onChange={(e) => setPrestataireRep(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          {sections.map((section) => (
            <div key={section}>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{SECTION_LABELS[section] ?? section}</div>
              <div className="space-y-1">
                {library.filter((l) => l.section === section).map((item) => (
                  <div key={item.item_code} className="flex flex-wrap items-center gap-2 rounded border border-slate-100 px-2 py-1.5 text-sm">
                    <span className="flex-1 min-w-[240px]">{item.label}</span>
                    <div className="flex gap-1">
                      {["oui", "non", "na"].map((v) => (
                        <button key={v} onClick={() => setResp(item.item_code, "reponse", v)}
                          className={`rounded px-2 py-0.5 text-xs border ${responses[item.item_code]?.reponse === v
                            ? v === "oui" ? "bg-emerald-600 text-white border-emerald-600" : v === "non" ? "bg-red-600 text-white border-red-600" : "bg-slate-500 text-white border-slate-500"
                            : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                          {v === "oui" ? "Oui" : v === "non" ? "Non" : "N/A"}
                        </button>
                      ))}
                    </div>
                    <input placeholder="Observation" value={responses[item.item_code]?.observation ?? ""}
                      onChange={(e) => setResp(item.item_code, "observation", e.target.value)}
                      className="min-w-[160px] flex-1 rounded border border-slate-200 px-2 py-0.5 text-xs" />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <div>
              <label className="block text-xs text-slate-500">Conclusion</label>
              <select value={conclusion} onChange={(e) => setConclusion(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                {CONCLUSION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs text-slate-500">Réserves (si applicable)</label>
              <input value={reserves} onChange={(e) => setReserves(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <button onClick={submit} disabled={!complete}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              Enregistrer la check-list ({answeredCount}/{library.length})
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Annuler
            </button>
          </div>
          {!complete && <p className="text-xs text-orange-600">Les 29 points doivent être renseignés (Oui/Non/N.A.) avant l'enregistrement — refusé côté base sinon.</p>}
        </div>
      )}
    </div>
  );
}
