import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRow, type ChecklistLibraryItem } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";
import { EpiMatrixReference } from "./EpiMatrixReference";

const SECTION_LABELS: Record<string, string> = {
  sst: "SST",
  materiels: "Matériels",
  environnement: "Environnement",
  organisation: "Organisation",
  portuaire: "Contraintes portuaires",
};

const CONCLUSION_OPTIONS = [
  { value: "conforme", label: "🟢 Conforme" },
  { value: "conforme_avec_observations", label: "🟠 Conforme avec observations" },
  { value: "non_conforme", label: "🔴 Non conforme" },
  { value: "arret_immediat_recommande", label: "⛔ Arrêt immédiat recommandé" },
];

type Declaration =
  | { type: "nc"; criticite: string; exigence_non_respectee: string; constat: string; delai_jours: string }
  | { type: "action"; description: string; responsable: string; date_limite: string };

// [Migration v6] Fiche d'inspection QHSE de chantier (Annexe F, 31 points),
// indépendante du PAQ (C — Exécution). Règle appliquée au niveau
// applicatif, dans une transaction unique avec la soumission (documentée
// en migration v6 : pas de déclencheur possible, la ligne liée est créée
// dans la même requête) : tout point "Non" DOIT être déclaré comme
// non-conformité ou action corrective — jamais un simple constat muet.
export function QhseInspectionPanel({ caseRow, onUpdated }: { caseRow: CaseRow; onUpdated: () => void }) {
  const { currentUser } = useApp();
  const [library, setLibrary] = useState<ChecklistLibraryItem[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [responses, setResponses] = useState<Record<string, { reponse: string; observation: string }>>({});
  const [declarations, setDeclarations] = useState<Record<string, Declaration>>({});
  const [prestataireRep, setPrestataireRep] = useState("");
  const [meteo, setMeteo] = useState("");
  const [conclusion, setConclusion] = useState("conforme");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function reload() {
    api.get("/qhse-inspection-library").then((r) => setLibrary(r.data));
    api.get(`/cases/${caseRow.id}/qhse-inspections`).then((r) => setHistory(r.data));
  }
  useEffect(reload, [caseRow.id]);

  function setResp(code: string, field: "reponse" | "observation", value: string) {
    setResponses((r) => ({ ...r, [code]: { reponse: r[code]?.reponse ?? "", observation: r[code]?.observation ?? "", [field]: value } }));
    if (field === "reponse" && value !== "non") {
      setDeclarations((d) => { const { [code]: _drop, ...rest } = d; return rest; });
    }
  }

  function setDeclarationType(code: string, type: "nc" | "action") {
    setDeclarations((d) => ({
      ...d,
      [code]: type === "nc"
        ? { type: "nc", criticite: "mineure", exigence_non_respectee: "", constat: "", delai_jours: "" }
        : { type: "action", description: "", responsable: "", date_limite: "" },
    }));
  }

  function updateDeclaration(code: string, patch: Partial<Declaration>) {
    setDeclarations((d) => ({ ...d, [code]: { ...(d[code] as any), ...patch } }));
  }

  const answeredCount = library.filter((l) => responses[l.item_code]?.reponse).length;
  const nonCodes = library.filter((l) => responses[l.item_code]?.reponse === "non").map((l) => l.item_code);
  const unresolvedNon = nonCodes.filter((c) => !declarations[c]);
  const complete = library.length > 0 && answeredCount === library.length && unresolvedNon.length === 0;

  async function submit() {
    setError(null); setResult(null);
    try {
      const res = await api.post(`/cases/${caseRow.id}/qhse-inspections`, {
        inspector_id: currentUser?.id,
        prestataire_representative: prestataireRep || null,
        meteo: meteo || null,
        conclusion,
        responses: library.map((l) => {
          const reponse = responses[l.item_code]?.reponse || "na";
          const decl = declarations[l.item_code];
          let declaration: any;
          if (reponse === "non" && decl) {
            if (decl.type === "nc") {
              declaration = { type: "nc", criticite: decl.criticite, exigence_non_respectee: decl.exigence_non_respectee || l.label, constat: decl.constat || responses[l.item_code]?.observation, delai_jours: decl.delai_jours ? Number(decl.delai_jours) : null };
            } else {
              declaration = { type: "action", description: decl.description || l.label, responsable: decl.responsable || null, date_limite: decl.date_limite || null };
            }
          }
          return { item_code: l.item_code, reponse, observation: responses[l.item_code]?.observation || null, declaration };
        }),
      });
      const nbNc = res.data.createdNcs?.length ?? 0;
      const nbAct = res.data.createdActions?.length ?? 0;
      setResult(`Inspection enregistrée — ${nbNc} NC créée(s), ${nbAct} action(s) corrective(s) créée(s).`);
      setResponses({}); setDeclarations({}); setPrestataireRep(""); setMeteo(""); setConclusion("conforme"); setShowForm(false);
      reload();
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  const sections = [...new Set(library.map((l) => l.section))];

  return (
    <div>
      {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {result && <div className="mb-3 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">{result}</div>}

      <div className="space-y-2">
        {history.map((h) => (
          <div key={h.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{new Date(h.inspection_date).toLocaleDateString("fr-FR")} — {h.inspector_name ?? "—"} — {h.responses.length} points</span>
              <Badge label={h.conclusion} tone={h.conclusion === "conforme" ? "valide" : h.conclusion === "conforme_avec_observations" ? "a_corriger" : "critique"} />
            </div>
            {h.non_conformities?.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">NC liées : {h.non_conformities.map((n: any) => `${n.nc_number} (${n.criticite})`).join(", ")}</div>
            )}
          </div>
        ))}
        {history.length === 0 && <div className="text-sm text-slate-400">Aucune inspection QHSE de chantier enregistrée.</div>}
      </div>

      <div className="mt-3">
        <EpiMatrixReference />
      </div>

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          + Nouvelle inspection QHSE (31 points — Annexe F)
        </button>
      )}

      {showForm && (
        <div className="mt-3 space-y-4 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-slate-700">Progression : {answeredCount} / {library.length}</div>
            <input placeholder="Représentant du prestataire" value={prestataireRep} onChange={(e) => setPrestataireRep(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
            <input placeholder="Météo" value={meteo} onChange={(e) => setMeteo(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>

          {sections.map((section) => (
            <div key={section}>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{SECTION_LABELS[section] ?? section}</div>
              <div className="space-y-1">
                {library.filter((l) => l.section === section).map((item) => {
                  const reponse = responses[item.item_code]?.reponse;
                  const decl = declarations[item.item_code];
                  return (
                    <div key={item.item_code} className="rounded border border-slate-100 px-2 py-1.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex-1 min-w-[240px]">{item.label}</span>
                        <div className="flex gap-1">
                          {["oui", "non", "na"].map((v) => (
                            <button key={v} onClick={() => setResp(item.item_code, "reponse", v)}
                              className={`rounded px-2 py-0.5 text-xs border ${reponse === v
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

                      {reponse === "non" && (
                        <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 p-2">
                          {!decl && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-orange-800">Point "Non" — déclaration obligatoire :</span>
                              <button onClick={() => setDeclarationType(item.item_code, "nc")} className="rounded border border-orange-300 bg-white px-2 py-0.5 hover:bg-orange-100">Créer une NC</button>
                              <button onClick={() => setDeclarationType(item.item_code, "action")} className="rounded border border-orange-300 bg-white px-2 py-0.5 hover:bg-orange-100">Créer une action corrective</button>
                            </div>
                          )}
                          {decl?.type === "nc" && (
                            <div className="space-y-1">
                              <div className="flex flex-wrap gap-2">
                                <select value={decl.criticite} onChange={(e) => updateDeclaration(item.item_code, { criticite: e.target.value })}
                                  className="rounded border border-slate-300 px-2 py-1 text-xs">
                                  <option value="mineure">Mineure</option>
                                  <option value="majeure">Majeure</option>
                                  <option value="critique">Critique</option>
                                </select>
                                <input placeholder="Exigence non respectée" value={decl.exigence_non_respectee}
                                  onChange={(e) => updateDeclaration(item.item_code, { exigence_non_respectee: e.target.value })}
                                  className="flex-1 min-w-[160px] rounded border border-slate-300 px-2 py-1 text-xs" />
                                <input type="number" placeholder="Délai (jours)" value={decl.delai_jours}
                                  onChange={(e) => updateDeclaration(item.item_code, { delai_jours: e.target.value })}
                                  className="w-28 rounded border border-slate-300 px-2 py-1 text-xs" />
                              </div>
                              <input placeholder="Constat" value={decl.constat}
                                onChange={(e) => updateDeclaration(item.item_code, { constat: e.target.value })}
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                              <button onClick={() => setDeclarations((d) => { const { [item.item_code]: _x, ...rest } = d; return rest; })}
                                className="text-xs text-slate-400 hover:text-red-600">annuler la déclaration</button>
                            </div>
                          )}
                          {decl?.type === "action" && (
                            <div className="space-y-1">
                              <input placeholder="Description de l'action corrective" value={decl.description}
                                onChange={(e) => updateDeclaration(item.item_code, { description: e.target.value })}
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                              <div className="flex gap-2">
                                <input placeholder="Responsable" value={decl.responsable}
                                  onChange={(e) => updateDeclaration(item.item_code, { responsable: e.target.value })}
                                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
                                <input type="date" value={decl.date_limite}
                                  onChange={(e) => updateDeclaration(item.item_code, { date_limite: e.target.value })}
                                  className="rounded border border-slate-300 px-2 py-1 text-xs" />
                              </div>
                              <button onClick={() => setDeclarations((d) => { const { [item.item_code]: _x, ...rest } = d; return rest; })}
                                className="text-xs text-slate-400 hover:text-red-600">annuler la déclaration</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
            <button onClick={submit} disabled={!complete}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              Enregistrer l'inspection ({answeredCount}/{library.length})
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Annuler
            </button>
          </div>
          {answeredCount < library.length && <p className="text-xs text-orange-600">Les 31 points doivent être renseignés avant l'enregistrement.</p>}
          {unresolvedNon.length > 0 && <p className="text-xs text-orange-600">Point(s) "Non" sans déclaration : {unresolvedNon.join(", ")}.</p>}
        </div>
      )}
    </div>
  );
}
