import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRow, type User } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";

export function NcPanel({ caseRow, onUpdated }: { caseRow: CaseRow; users: User[]; onUpdated: () => void }) {
  const { currentUser } = useApp();
  const [ncs, setNcs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionText, setActionText] = useState("");
  const [levyText, setLevyText] = useState("");
  const [criticiteDraft, setCriticiteDraft] = useState<Record<string, string>>({});
  const [motifDraft, setMotifDraft] = useState<Record<string, string>>({});

  function reload() {
    api.get(`/cases/${caseRow.id}/non-conformities`).then((r) => setNcs(r.data));
  }
  useEffect(reload, [caseRow.id]);

  async function declareAction(ncId: string) {
    setError(null);
    try {
      await api.post(`/non-conformities/${ncId}/corrective-action`, { description: actionText, declared_by_company_contact: "Entreprise" });
      setActionText("");
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function requestRecheck(ncId: string) {
    try { await api.post(`/non-conformities/${ncId}/request-recheck`); reload(); }
    catch (err) { setError(apiErrorMessage(err)); }
  }

  async function levyReport(ncId: string, decision: "levee_confirmee" | "maintien") {
    setError(null);
    try {
      await api.post(`/non-conformities/${ncId}/levy-report`, {
        conducted_by: currentUser?.id, constat_levee: levyText || "(sans commentaire)", decision,
      });
      setLevyText("");
      reload();
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function close(ncId: string) {
    setError(null);
    try { await api.patch(`/non-conformities/${ncId}/close`); reload(); onUpdated(); }
    catch (err) { setError(apiErrorMessage(err)); }
  }

  async function correctCriticite(ncId: string) {
    const criticite = criticiteDraft[ncId];
    const motif = motifDraft[ncId];
    if (!criticite || !motif) return;
    setError(null);
    try {
      await api.patch(`/non-conformities/${ncId}/criticite`, { criticite, motif, corrected_by: currentUser?.id });
      setCriticiteDraft((d) => ({ ...d, [ncId]: "" }));
      setMotifDraft((d) => ({ ...d, [ncId]: "" }));
      reload();
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {ncs.length === 0 && <div className="text-sm text-slate-400">Aucune non-conformité sur ce dossier.</div>}
      {ncs.map((nc) => (
        <div key={nc.id} className="rounded-lg border border-slate-200">
          <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setExpanded(expanded === nc.id ? null : nc.id)}>
            <div>
              <span className="font-medium text-slate-900">{nc.nc_number}</span>{" "}
              <Badge label={nc.criticite} tone={nc.criticite} />{" "}
              <span className="text-sm text-slate-600 ml-2">{nc.exigence_non_respectee}</span>
            </div>
            <Badge label={nc.statut} tone={nc.statut} />
          </button>
          {expanded === nc.id && (
            <div className="border-t border-slate-100 px-4 py-3 space-y-3 text-sm">
              <div><strong>Constat :</strong> {nc.constat}</div>
              <div><strong>Angle :</strong> {nc.angle} — <strong>Ouverte par :</strong> {nc.opened_by_name}</div>

              {nc.statut === "ouverte" && (
                <div className="flex gap-2">
                  <input placeholder="Action corrective déclarée par l'entreprise" value={actionText} onChange={(e) => setActionText(e.target.value)}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-1.5" />
                  <button onClick={() => declareAction(nc.id)} disabled={!actionText} className="rounded-md bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">Déclarer</button>
                </div>
              )}

              {nc.corrective_actions?.length > 0 && (
                <div className="rounded bg-slate-50 p-2">
                  <div className="text-xs font-medium text-slate-500 mb-1">Actions correctives déclarées</div>
                  {nc.corrective_actions.map((a: any) => <div key={a.id} className="text-xs">• {a.description}</div>)}
                </div>
              )}

              {nc.statut === "action_en_cours" && (
                <button onClick={() => requestRecheck(nc.id)} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                  Demander le recontrôle
                </button>
              )}

              {nc.statut === "a_recontroler" && nc.criticite === "critique" && (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
                  <div className="mb-2 text-xs text-orange-800">
                    NC critique — visite de levée strictement circonscrite à cette NC, menée par le chef de service ou le chef de département (escalade).
                  </div>
                  <textarea placeholder="Constat de levée" value={levyText} onChange={(e) => setLevyText(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5" rows={2} />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => levyReport(nc.id, "levee_confirmee")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-white">✅ Levée confirmée</button>
                    <button onClick={() => levyReport(nc.id, "maintien")} className="rounded-md bg-red-600 px-3 py-1.5 text-white">⛔ Maintien</button>
                  </div>
                </div>
              )}

              {nc.statut === "a_recontroler" && nc.criticite !== "critique" && (
                <button onClick={() => close(nc.id)} className="rounded-md bg-emerald-600 px-3 py-1.5 text-white">
                  Clôturer (recontrôle par le contrôleur d'origine)
                </button>
              )}

              {nc.statut !== "cloturee" && (
                <div className="rounded-md border border-slate-200 p-2">
                  <div className="mb-1 text-xs text-slate-500">
                    Corriger la sévérité (Mineure/Majeure/Critique — motif obligatoire, jamais automatique pour "Majeure")
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={criticiteDraft[nc.id] ?? ""} onChange={(e) => setCriticiteDraft((d) => ({ ...d, [nc.id]: e.target.value }))}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                      <option value="">— niveau —</option>
                      <option value="mineure">Mineure</option>
                      <option value="majeure">Majeure</option>
                      <option value="critique">Critique</option>
                    </select>
                    <input placeholder="Motif de la correction" value={motifDraft[nc.id] ?? ""}
                      onChange={(e) => setMotifDraft((d) => ({ ...d, [nc.id]: e.target.value }))}
                      className="flex-1 min-w-[160px] rounded-md border border-slate-300 px-2 py-1 text-sm" />
                    <button onClick={() => correctCriticite(nc.id)} disabled={!criticiteDraft[nc.id] || !motifDraft[nc.id]}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-50">
                      Corriger
                    </button>
                  </div>
                </div>
              )}

              {nc.levy_reports?.length > 0 && nc.statut !== "cloturee" && nc.levy_reports.some((l: any) => l.decision === "levee_confirmee") && (
                <button onClick={() => close(nc.id)} className="rounded-md bg-emerald-600 px-3 py-1.5 text-white">Clôturer la NC</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
