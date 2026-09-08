import { useEffect, useState } from "react";
import { api, apiErrorMessage, openAuthenticatedPdf, type CaseRow, type User } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";
import { RisksPanel } from "./RisksPanel";
import { MarketRiskPanel } from "./MarketRiskPanel";
import { StartupChecklistPanel } from "./StartupChecklistPanel";

export function PreparationPanel({ caseRow, onUpdated }: { caseRow: CaseRow; users: User[]; onUpdated: () => void }) {
  const { currentUser, can } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [qhse, setQhse] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<{ checklist: Record<string, boolean>; autorise: boolean } | null>(null);
  const [signatoryName, setSignatoryName] = useState("");
  const [meetingParticipants, setMeetingParticipants] = useState("");
  const [meetingCr, setMeetingCr] = useState("");
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [b1Validations, setB1Validations] = useState<any[]>([]);
  const [personName, setPersonName] = useState("");
  const [personFunction, setPersonFunction] = useState("");
  const [authorizations, setAuthorizations] = useState<any[]>([]);

  function reload() {
    api.get(`/cases/${caseRow.id}/qhse-engagement`).then((r) => setQhse(r.data));
    api.get(`/cases/${caseRow.id}/prerequisite-documents`).then((r) => setDocs(r.data));
    api.get(`/cases/${caseRow.id}/startup-checklist`).then((r) => setChecklist(r.data));
    api.get(`/cases/${caseRow.id}/personnel`).then((r) => setPersonnel(r.data));
    api.get(`/cases/${caseRow.id}/b1-validations`).then((r) => setB1Validations(r.data)).catch(() => setB1Validations([]));
    api.get(`/cases/${caseRow.id}/startup-authorizations`).then((r) => setAuthorizations(r.data)).catch(() => setAuthorizations([]));
  }
  useEffect(reload, [caseRow.id]);

  const latestQhse = qhse[0];
  const latestB1 = b1Validations[b1Validations.length - 1];

  async function addPersonnel() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/personnel`, {
        company_id: caseRow.company_id, full_name: personName, function: personFunction,
      });
      setPersonName(""); setPersonFunction("");
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function validateB1() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/b1-validation`, { statut: "valide", validated_by: currentUser?.id });
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function validateQhse() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/qhse-engagement`, {
        signatory_name: signatoryName || "Représentant entreprise",
        signatory_matches_b1: true,
        statut: "valide",
        validated_by: currentUser?.id,
      });
      setSignatoryName("");
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function addPlanningDoc() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/prerequisite-documents`, {
        document_type: "planning", statut: "valide", validated_by: currentUser?.id,
      });
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function submitMeeting() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/kickoff-meeting`, {
        meeting_date: new Date().toISOString().slice(0, 10),
        participants: meetingParticipants.split(",").map((s) => s.trim()).filter(Boolean),
        compte_rendu: meetingCr, created_by: currentUser?.id,
      });
      setMeetingParticipants(""); setMeetingCr("");
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function authorizeStart() {
    if (!checklist) return;
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/startup-authorization`, {
        checklist: checklist.checklist, autorise: checklist.autorise, decided_by: currentUser?.id,
      });
      reload();
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">B1 — Espace Entreprise (personnel)</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {personnel.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-1.5">
              <span>{p.full_name} — {p.function}</span>
            </li>
          ))}
          {personnel.length === 0 && <li className="text-slate-400">Aucun personnel déclaré.</li>}
        </ul>
        <div className="mt-3 flex gap-2">
          <input placeholder="Nom et prénoms" value={personName} onChange={(e) => setPersonName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm flex-1" />
          <input placeholder="Fonction" value={personFunction} onChange={(e) => setPersonFunction(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm flex-1" />
          <button onClick={addPersonnel} disabled={!personName || !personFunction}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50">
            + Ajouter
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          Statut B1 : <Badge label={latestB1?.statut ?? "en attente"} tone={latestB1?.statut} />
          {latestB1?.statut !== "valide" && (
            <button onClick={validateB1} disabled={personnel.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
              Valider le personnel 🟢
            </button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">B2 — Engagement QHSE/SST <span className="text-xs text-red-600">point d'arrêt absolu</span></h3>
        {latestQhse ? (
          <div className="mt-2 flex items-center gap-2 text-sm">
            Statut actuel : <Badge label={latestQhse.statut} tone={latestQhse.statut} /> — signataire {latestQhse.signatory_name}
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Aucun engagement déposé. Tant que non validé, aucun accès à B3.</p>
        )}
        {(!latestQhse || latestQhse.statut !== "valide") && (
          <div className="mt-3 flex gap-2">
            <input placeholder="Nom du signataire" value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm flex-1" />
            <button onClick={validateQhse} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700">
              Déposer et valider 🟢
            </button>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">B3 — Documents préalables (hors PAQ)</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-1.5">
              <span>{d.document_type}</span>
              <Badge label={d.statut ?? "non applicable"} tone={d.statut} />
            </li>
          ))}
          {docs.length === 0 && <li className="text-slate-400">Aucun document déposé.</li>}
        </ul>
        <button onClick={addPlanningDoc} className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          + Déposer le planning (validé)
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">
          Classification du marché (Annexe B) <span className="text-xs text-slate-500">niveau de risque et exigences documentaires cumulatives</span>
        </h3>
        <div className="mt-2">
          <MarketRiskPanel caseRow={caseRow} onUpdated={() => { reload(); onUpdated(); }} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">
          B3bis — Analyse des risques du chantier <span className="text-xs text-slate-500">méthode Probabilité×Gravité, référentiel QHSE</span>
        </h3>
        <div className="mt-2">
          <RisksPanel caseRow={caseRow} users={[]} onUpdated={() => { reload(); onUpdated(); }} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">B5 — Réunion de prise de contact <span className="text-xs text-slate-500">obligatoire</span></h3>
        <div className="mt-2 space-y-2">
          <input placeholder="Participants (séparés par des virgules)" value={meetingParticipants} onChange={(e) => setMeetingParticipants(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <textarea placeholder="Compte rendu factuel" value={meetingCr} onChange={(e) => setMeetingCr(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" rows={2} />
          <button onClick={submitMeeting} disabled={!meetingCr} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            Enregistrer le compte rendu
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">
          Check-list de démarrage détaillée (Annexe E) <span className="text-xs text-slate-500">29 points — remplace l'ancienne case tautologique</span>
        </h3>
        <div className="mt-2">
          <StartupChecklistPanel caseRow={caseRow} onUpdated={() => { reload(); onUpdated(); }} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">B6 — Autorisation de démarrage <span className="text-xs text-slate-500">checklist calculée, aucune ressaisie</span></h3>
        {checklist && (
          <>
            <ul className="mt-2 space-y-1 text-sm">
              {Object.entries(checklist.checklist).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2">
                  <span>{v ? "✅" : "🔴"}</span> {k.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
            {/* Migration v8 (RBAC, Q2/Q4/Q5) : réservé au chef de service et
               au chef de département — un contrôleur ne peut plus
               déclencher lui-même l'autorisation de démarrage. */}
            {can("validation_b6", "valider") ? (
              <button onClick={authorizeStart} disabled={caseRow.phase !== "A" && caseRow.phase !== "B"}
                className={`mt-3 rounded-md px-4 py-2 text-sm font-medium text-white ${checklist.autorise ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-400"}`}>
                {checklist.autorise ? "🟢 Autoriser le démarrage → passer en exécution (C)" : "🔴 Démarrage non autorisé (point d'arrêt)"}
              </button>
            ) : (
              <p className="mt-3 text-xs text-slate-400">
                Seuls le chef de service et le chef de département peuvent autoriser le démarrage.
              </p>
            )}
            {authorizations.length > 0 && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                Dernière décision : <Badge label={authorizations[0].statut} tone={authorizations[0].statut === "autorise" ? "normal" : "critique"} />
                le {new Date(authorizations[0].decided_at).toLocaleDateString("fr-FR")} — {authorizations[0].decided_by_name}
                <button onClick={() => openAuthenticatedPdf(`/cases/${caseRow.id}/documents/autorisation-demarrage.pdf`)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                  📄 Télécharger l'autorisation (PDF)
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
