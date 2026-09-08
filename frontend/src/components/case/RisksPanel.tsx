import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRisk, type CaseRow, type RiskLibraryEntry } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";

const NIVEAU_OPTIONS = [
  { value: "faible", label: "Faible" },
  { value: "modere", label: "Modéré" },
  { value: "eleve", label: "Élevé" },
  { value: "critique", label: "Critique" },
];

export function RisksPanel({ caseRow, onUpdated }: { caseRow: CaseRow; users: import("../../api").User[]; onUpdated?: () => void }) {
  const { currentUser } = useApp();
  const [risks, setRisks] = useState<CaseRisk[]>([]);
  const [library, setLibrary] = useState<RiskLibraryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [libraryId, setLibraryId] = useState("");
  const [activite, setActivite] = useState("");
  const [danger, setDanger] = useState("");
  const [risque, setRisque] = useState("");
  const [personnesExposees, setPersonnesExposees] = useState("");
  const [probabilite, setProbabilite] = useState(3);
  const [gravite, setGravite] = useState(3);
  const [mesuresExistantes, setMesuresExistantes] = useState("");
  const [responsable, setResponsable] = useState("");
  const [echeance, setEcheance] = useState("");

  const [residualDraft, setResidualDraft] = useState<Record<string, string>>({});
  const [mesuresCompDraft, setMesuresCompDraft] = useState<Record<string, string>>({});

  function reload() {
    api.get(`/cases/${caseRow.id}/risks`).then((r) => setRisks(r.data));
    api.get(`/risk-library`).then((r) => setLibrary(r.data)).catch(() => setLibrary([]));
  }
  useEffect(reload, [caseRow.id]);

  function applyLibraryPick(id: string) {
    setLibraryId(id);
    const entry = library.find((l) => l.id === id);
    if (entry) {
      setActivite(entry.label);
      setRisque(entry.description ?? "");
    }
  }

  async function addRisk() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/risks`, {
        risk_library_id: libraryId || null, activite, danger, risque,
        personnes_exposees: personnesExposees, probabilite, gravite,
        mesures_existantes: mesuresExistantes, responsable, echeance: echeance || null,
        created_by: currentUser?.id,
      });
      setLibraryId(""); setActivite(""); setDanger(""); setRisque(""); setPersonnesExposees("");
      setProbabilite(3); setGravite(3); setMesuresExistantes(""); setResponsable(""); setEcheance("");
      setShowForm(false);
      reload();
      onUpdated?.();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function saveMesuresComplementaires(risk: CaseRisk) {
    setError(null);
    try {
      await api.patch(`/cases/${caseRow.id}/risks/${risk.id}`, {
        mesures_complementaires: mesuresCompDraft[risk.id] ?? risk.mesures_complementaires,
      });
      reload();
      onUpdated?.();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function evaluateResidual(risk: CaseRisk) {
    const value = residualDraft[risk.id];
    if (!value) return;
    setError(null);
    try {
      await api.patch(`/cases/${caseRow.id}/risks/${risk.id}`, { niveau_residuel: value, updated_by: currentUser?.id });
      reload();
      onUpdated?.();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  const previewNiveau = (() => {
    const score = probabilite * gravite;
    if (score <= 4) return "faible";
    if (score <= 9) return "modere";
    if (score <= 16) return "eleve";
    return "critique";
  })();

  return (
    <div>
      {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      {risks.length === 0 && <p className="text-sm text-slate-400">Aucun risque analysé pour ce dossier.</p>}

      <div className="space-y-2">
        {risks.map((r) => (
          <div key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium text-slate-900">{r.activite}</span>
                {r.danger && <span className="text-slate-500"> — {r.danger}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">P{r.probabilite}×G{r.gravite}</span>
                <Badge label={`initial : ${r.niveau_initial ?? "—"}`} tone={r.niveau_initial ?? "default"} />
                <Badge label={`résiduel : ${r.niveau_residuel ?? "non évalué"}`} tone={r.niveau_residuel ?? "default"} />
              </div>
            </div>
            {r.risque && <div className="mt-1 text-slate-600">{r.risque}</div>}
            {r.personnes_exposees && <div className="mt-1 text-xs text-slate-500">Personnes exposées : {r.personnes_exposees}</div>}
            {r.mesures_existantes && <div className="mt-1 text-xs text-slate-500">Mesures existantes : {r.mesures_existantes}</div>}

            <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-slate-500">Mesures complémentaires</label>
                <input
                  value={mesuresCompDraft[r.id] ?? r.mesures_complementaires ?? ""}
                  onChange={(e) => setMesuresCompDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              <button onClick={() => saveMesuresComplementaires(r)} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                Enregistrer
              </button>
              <div>
                <label className="block text-xs text-slate-500">Niveau résiduel (après mesures)</label>
                <select
                  value={residualDraft[r.id] ?? r.niveau_residuel ?? ""}
                  onChange={(e) => setResidualDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                >
                  <option value="">— à évaluer —</option>
                  {NIVEAU_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button onClick={() => evaluateResidual(r)} disabled={!residualDraft[r.id]}
                className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50">
                Évaluer
              </button>
            </div>
          </div>
        ))}
      </div>

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          + Ajouter un risque
        </button>
      )}

      {showForm && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
          <select value={libraryId} onChange={(e) => applyLibraryPick(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">— partir d'un risque de référence (Annexe C, facultatif) —</option>
            <optgroup label="Risques génériques">
              {library.filter((l) => l.category === "generique").map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </optgroup>
            <optgroup label="Risques spécifiques au domaine portuaire">
              {library.filter((l) => l.category === "portuaire").map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </optgroup>
          </select>
          <input placeholder="Activité" value={activite} onChange={(e) => setActivite(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="Danger identifié" value={danger} onChange={(e) => setDanger(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="Risque potentiel" value={risque} onChange={(e) => setRisque(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="Personnes exposées" value={personnesExposees} onChange={(e) => setPersonnesExposees(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <div className="flex items-center gap-3">
            <label className="text-sm">
              Probabilité (1-5)
              <select value={probabilite} onChange={(e) => setProbabilite(Number(e.target.value))}
                className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Gravité (1-5)
              <select value={gravite} onChange={(e) => setGravite(Number(e.target.value))}
                className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="text-sm">Niveau initial (calculé) : <Badge label={previewNiveau} tone={previewNiveau} /></span>
          </div>
          <input placeholder="Mesures de prévention existantes" value={mesuresExistantes} onChange={(e) => setMesuresExistantes(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <input placeholder="Responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={addRisk} disabled={!activite} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              Enregistrer le risque
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
