import { useEffect, useState } from "react";
import { api, apiErrorMessage, openAuthenticatedPdf, type CaseRow, type User } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";
import { ContractorEvaluationPanel } from "./ContractorEvaluationPanel";

export function ReceptionPanel({ caseRow, users, onUpdated }: { caseRow: CaseRow; users: User[]; onUpdated: () => void }) {
  const { currentUser, can } = useApp();
  const [requests, setRequests] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checklistPreview, setChecklistPreview] = useState<Record<string, boolean> | null>(null);
  const [reserves, setReserves] = useState<Record<string, any[]>>({});
  const [newReserve, setNewReserve] = useState<Record<string, { description: string; responsable: string; delai: string }>>({});
  const [leveeText, setLeveeText] = useState<Record<string, string>>({});

  function reload() {
    api.get(`/cases/${caseRow.id}/reception-requests`).then((r) => {
      setRequests(r.data);
      for (const req of r.data) {
        if (req.decision?.decision === "favorable_avec_reserves") {
          api.get(`/reception-decisions/${req.decision.id}/reserves`).then((rr) =>
            setReserves((prev) => ({ ...prev, [req.decision.id]: rr.data }))
          );
        }
      }
    });
    api.get(`/cases/${caseRow.id}/reception-checklist`).then((r) => setChecklistPreview(r.data));
  }
  useEffect(reload, [caseRow.id]);

  async function addReserve(decisionId: string) {
    setError(null);
    const draft = newReserve[decisionId];
    if (!draft?.description) return;
    try {
      await api.post(`/reception-decisions/${decisionId}/reserves`, {
        description: draft.description, responsable: draft.responsable || null, delai: draft.delai || null,
      });
      setNewReserve((prev) => ({ ...prev, [decisionId]: { description: "", responsable: "", delai: "" } }));
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function leverReserve(reserveId: string, decisionId: string) {
    setError(null);
    try {
      await api.patch(`/reserves/${reserveId}/lever`, { constat_levee: leveeText[reserveId] || "(sans commentaire)" });
      setLeveeText((prev) => ({ ...prev, [reserveId]: "" }));
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
    void decisionId;
  }

  async function requestReception() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/reception-requests`, { requested_by_company_contact: "Entreprise" });
      reload(); onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  const chefService = users.find((u) => u.role_code === "chef_service");
  const chefDepartement = users.find((u) => u.role_code === "chef_departement");

  async function escalade(reqId: string) {
    setError(null);
    const kone = users.find((u) => u.role_code === "chef_service");
    try {
      await api.patch(`/reception-requests/${reqId}/escalade`, {
        chef_service_id: kone?.id, decision_kaman: "delegue", visite_conducted_by: kone?.id,
      });
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function pushChecklist(reqId: string) {
    if (!checklistPreview) return;
    try { await api.post(`/reception-requests/${reqId}/checklist`, checklistPreview); reload(); }
    catch (err) { setError(apiErrorMessage(err)); }
  }

  async function decide(reqId: string, decision: string) {
    setError(null);
    try {
      const res = await api.post(`/reception-requests/${reqId}/decision`, { decision, decided_by: currentUser?.id });
      reload(); onUpdated();
      if (decision === "favorable" || decision === "favorable_avec_reserves") {
        window.__lastDecisionId = res.data.id;
      }
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function closeDossier(decisionId: string) {
    setError(null);
    try {
      await api.post(`/reception-decisions/${decisionId}/close`, { closed_by: currentUser?.id });
      reload(); onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        La réception ne se déclenche jamais automatiquement : Prestataire demande → Contrôleur informe → {chefService?.full_name ?? "Chef de service"} remonte → {chefDepartement?.full_name ?? "Chef de département"} décide.
      </div>

      {(requests.length === 0
        || requests[0]?.decision?.decision === "impossibilite_receptionner"
        || requests[0]?.decision?.decision === "defavorable") && (
        <button onClick={requestReception} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Enregistrer une demande de réception (prestataire)
          {requests.length > 0 && " — nouvelle tentative"}
        </button>
      )}

      {requests.map((r) => (
        <div key={r.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
          <div className="text-sm text-slate-600">Demande du {new Date(r.requested_at).toLocaleDateString("fr-FR")}</div>

          {!r.chef_service_id && (
            <button onClick={() => escalade(r.id)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Remonter au chef de service puis décision du chef de département
            </button>
          )}

          {r.chef_service_id && !r.checklist && checklistPreview && (
            <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500 mb-1">E1 — Checklist automatique</div>
              <ul className="text-sm space-y-0.5">
                {Object.entries(checklistPreview).map(([k, v]) => <li key={k}>{v ? "✅" : "🔴"} {k.replaceAll("_", " ")}</li>)}
              </ul>
              <button onClick={() => pushChecklist(r.id)} className="mt-2 rounded-md bg-slate-700 px-3 py-1.5 text-xs text-white hover:bg-slate-800">
                Figer la checklist
              </button>
            </div>
          )}

          {/* Migration v8 (RBAC, Q2) : réservé au chef de service et au chef
             de département. */}
          {r.checklist && !r.decision && (
            can("reception_decision", "valider") ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <button onClick={() => decide(r.id, "favorable")} className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white">🟢 Favorable</button>
                <button onClick={() => decide(r.id, "favorable_avec_reserves")} className="rounded-md bg-amber-500 px-3 py-2 text-sm text-white">🟠 Avec réserves</button>
                <button onClick={() => decide(r.id, "defavorable")} className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">🔴 Défavorable</button>
                <button onClick={() => decide(r.id, "impossibilite_receptionner")} className="rounded-md bg-slate-500 px-3 py-2 text-sm text-white">⚪ Impossibilité</button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Seuls le chef de service et le chef de département peuvent statuer sur la réception.</p>
            )
          )}

          {r.decision && (
            <div className="rounded-md border border-slate-100 p-3 text-sm space-y-3">
              <div className="flex items-center gap-2">
                Décision : <Badge label={r.decision.decision} />
                <button onClick={() => openAuthenticatedPdf(`/reception-decisions/${r.decision.id}/documents/pv-reception.pdf`)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                  📄 PV de réception (PDF)
                </button>
              </div>

              {r.decision.decision === "favorable_avec_reserves" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-medium text-amber-800 mb-2">E4 — Réserves</div>
                  <ul className="space-y-2">
                    {(reserves[r.decision.id] ?? []).map((res) => (
                      <li key={res.id} className="rounded border border-amber-100 bg-white p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span>{res.description} {res.responsable && <span className="text-xs text-slate-500">— {res.responsable}</span>} {res.delai && <span className="text-xs text-slate-500">(délai : {new Date(res.delai).toLocaleDateString("fr-FR")})</span>}</span>
                          <Badge label={res.statut} tone={res.statut === "levee" ? "valide" : "a_corriger"} />
                        </div>
                        {res.statut !== "levee" ? (
                          <div className="mt-2 flex gap-2">
                            <input placeholder="Constat de levée" value={leveeText[res.id] ?? ""}
                              onChange={(e) => setLeveeText((prev) => ({ ...prev, [res.id]: e.target.value }))}
                              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                            <button onClick={() => leverReserve(res.id, r.decision.id)} className="rounded-md bg-emerald-600 px-3 py-1 text-xs text-white">Lever</button>
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-slate-500">Levée : {res.constat_levee}</div>
                        )}
                      </li>
                    ))}
                    {(reserves[r.decision.id] ?? []).length === 0 && <li className="text-xs text-slate-400">Aucune réserve enregistrée pour le moment.</li>}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input placeholder="Description de la réserve" value={newReserve[r.decision.id]?.description ?? ""}
                      onChange={(e) => setNewReserve((prev) => ({ ...prev, [r.decision.id]: { ...prev[r.decision.id], description: e.target.value, responsable: prev[r.decision.id]?.responsable ?? "", delai: prev[r.decision.id]?.delai ?? "" } }))}
                      className="flex-1 min-w-[180px] rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
                    <input placeholder="Responsable" value={newReserve[r.decision.id]?.responsable ?? ""}
                      onChange={(e) => setNewReserve((prev) => ({ ...prev, [r.decision.id]: { ...prev[r.decision.id], responsable: e.target.value, description: prev[r.decision.id]?.description ?? "", delai: prev[r.decision.id]?.delai ?? "" } }))}
                      className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
                    <input type="date" value={newReserve[r.decision.id]?.delai ?? ""}
                      onChange={(e) => setNewReserve((prev) => ({ ...prev, [r.decision.id]: { ...prev[r.decision.id], delai: e.target.value, description: prev[r.decision.id]?.description ?? "", responsable: prev[r.decision.id]?.responsable ?? "" } }))}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
                    <button onClick={() => addReserve(r.decision.id)} className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs hover:bg-amber-100">
                      + Ajouter une réserve
                    </button>
                  </div>
                </div>
              )}

              {(r.decision.decision === "defavorable" || r.decision.decision === "impossibilite_receptionner") && caseRow.status !== "cloture" && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Décision {r.decision.decision === "defavorable" ? "défavorable" : "d'impossibilité de réceptionner"} : le PV et l'attestation ne
                  peuvent pas être générés sur cette base — la réception n'est pas accordée. L'entreprise corrige les non-conformités
                  relevées pendant la visite ; une nouvelle demande de réception peut être enregistrée ci-dessus dès que les
                  corrections sont faites, en vue d'un avis favorable.
                </div>
              )}

              {(r.decision.decision === "favorable" || r.decision.decision === "favorable_avec_reserves") && caseRow.status !== "cloture" && (
                <div>
                  {r.decision.decision === "favorable_avec_reserves"
                    && (reserves[r.decision.id] ?? []).some((res) => res.statut !== "levee") && (
                    <div className="mb-2 text-xs text-amber-700">
                      ⚠️ Des réserves restent non levées — la clôture reste possible (règle non bloquante à ce jour), mais à confirmer avec le Chef de département.
                    </div>
                  )}
                  {/* Migration v8 (RBAC, Q1) : clôture définitive réservée
                     au chef de département. */}
                  {can("dossier", "cloturer") ? (
                    <button onClick={() => closeDossier(r.decision.id)} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-white">
                      E5-E6 — Clôturer le dossier
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400">Seul le chef de département peut clôturer définitivement le dossier.</p>
                  )}
                </div>
              )}
              {r.closure && (
                <div className="flex items-center gap-2">
                  <span className="text-emerald-700 font-medium">🔒 Dossier clôturé le {new Date(r.closure.closed_at).toLocaleDateString("fr-FR")}</span>
                  <button onClick={() => openAuthenticatedPdf(`/reception-closures/${r.closure.id}/documents/attestation.pdf`)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                    📄 Attestation de bonne exécution (PDF)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">
          Évaluation QHSE du prestataire (Annexe K) <span className="text-xs text-slate-500">renseignée à la fin des travaux</span>
        </h3>
        <div className="mt-2">
          <ContractorEvaluationPanel caseRow={caseRow} onUpdated={onUpdated} />
        </div>
      </section>
    </div>
  );
}

declare global { interface Window { __lastDecisionId?: string } }
