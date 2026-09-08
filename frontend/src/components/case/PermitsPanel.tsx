import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRow, type Permit, type PermitDetectionRule } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";

const PERMIT_TYPES = [
  { value: "feu", label: "Permis de feu" },
  { value: "fouille", label: "Autorisation de fouille" },
  { value: "hauteur", label: "Permis travail en hauteur" },
  { value: "electrique", label: "Autorisation électrique" },
  { value: "acces", label: "Autorisation d'accès" },
  { value: "espace_confine", label: "Permis espace confiné" },
] as const;

const ISSUER_DOMAINS = [
  { value: "capitainerie", label: "Capitainerie" },
  { value: "direction_logistique", label: "Direction de la Logistique" },
  { value: "direction_domaine_patrimoine", label: "Direction du Domaine et du Patrimoine" },
  { value: "autre", label: "Autre" },
];

function permitLabel(type: string) {
  return PERMIT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function PermitsPanel({ caseRow, onUpdated }: { caseRow: CaseRow; onUpdated: () => void }) {
  const { currentUser } = useApp();
  const [permits, setPermits] = useState<Permit[]>([]);
  const [rules, setRules] = useState<PermitDetectionRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [motifDraft, setMotifDraft] = useState<Record<string, string>>({});
  const [newPermit, setNewPermit] = useState({ permit_type: "feu", required_reason: "", issuer_domain: "capitainerie", linked_event_id: "" });

  function reload() {
    api.get(`/cases/${caseRow.id}/permits`).then((r) => setPermits(r.data));
  }
  useEffect(reload, [caseRow.id]);
  useEffect(() => { api.get("/permit-detection-rules").then((r) => setRules(r.data)); }, []);

  const enExecutionOuApres = caseRow.phase === "C" || caseRow.phase === "D" || caseRow.phase === "E";

  async function updatePermit(id: string, patch: Record<string, any>) {
    setError(null);
    try {
      await api.patch(`/permits/${id}`, { ...patch, updated_by: currentUser?.id });
      reload(); onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function ecarter(p: Permit) {
    const motif = motifDraft[p.id];
    if (p.auto_detected && !motif) {
      setError(`Un motif est obligatoire pour écarter le permis "${permitLabel(p.permit_type)}" (détecté automatiquement).`);
      return;
    }
    await updatePermit(p.id, { statut: "non_requis", correction_motif: motif || null });
    setMotifDraft((s) => ({ ...s, [p.id]: "" }));
  }

  async function addPermit() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/permits`, {
        permit_type: newPermit.permit_type,
        required_reason: newPermit.required_reason || null,
        issuer_domain: newPermit.issuer_domain || null,
        linked_event_id: newPermit.linked_event_id || null,
        created_by: currentUser?.id,
      });
      setNewPermit({ permit_type: "feu", required_reason: "", issuer_domain: "capitainerie", linked_event_id: "" });
      reload(); onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  const manquants = permits.filter((p) => p.statut === "requis" || p.statut === "expire"
    || (p.statut === "delivre" && p.expiry_date && new Date(p.expiry_date) < new Date()));

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Le DCT n'émet aucun permis : il vérifie que le bon service externe l'a délivré. Les permis ci-dessous sont
        détectés automatiquement à partir des corps de métier importés en B4 (table indicative, ci-dessous) — toujours
        corrigeables, avec motif obligatoire pour écarter un permis détecté automatiquement.
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      {enExecutionOuApres && manquants.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠️ Alerte : dossier en exécution avec {manquants.length} permis manquant(s) ou expiré(s) —
          {" "}{manquants.map((p) => permitLabel(p.permit_type)).join(", ")}.
        </div>
      )}

      <div className="space-y-3">
        {permits.length === 0 && <div className="text-sm text-slate-400">Aucun permis suivi pour ce dossier à ce stade.</div>}
        {permits.map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-200 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-900">
                {permitLabel(p.permit_type)}
                {p.auto_detected && <span className="ml-2 text-xs font-normal text-slate-400">détecté automatiquement</span>}
              </div>
              <Badge label={p.statut} tone={p.statut} />
            </div>
            {p.required_reason && <div className="text-xs text-slate-500">{p.required_reason}</div>}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <label className="block text-xs text-slate-500">Émetteur (domaine)</label>
                <select value={p.issuer_domain ?? ""} onChange={(e) => updatePermit(p.id, { issuer_domain: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs">
                  {ISSUER_DOMAINS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500">N° du permis</label>
                <input value={p.permit_number ?? ""} onChange={(e) => updatePermit(p.id, { permit_number: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="block text-xs text-slate-500">Date de délivrance</label>
                <input type="date" value={p.issue_date?.slice(0, 10) ?? ""} onChange={(e) => updatePermit(p.id, { issue_date: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="block text-xs text-slate-500">Date d'expiration</label>
                <input type="date" value={p.expiry_date?.slice(0, 10) ?? ""} onChange={(e) => updatePermit(p.id, { expiry_date: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => updatePermit(p.id, { statut: "en_cours" })} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">En cours de délivrance</button>
              <button onClick={() => updatePermit(p.id, { statut: "delivre" })} className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Marquer délivré</button>
              {p.statut !== "non_requis" && (
                <div className="flex flex-1 items-center gap-2">
                  <input placeholder="Motif d'écartement (obligatoire si détecté automatiquement)" value={motifDraft[p.id] ?? ""}
                    onChange={(e) => setMotifDraft((s) => ({ ...s, [p.id]: e.target.value }))}
                    className="flex-1 min-w-[180px] rounded-md border border-slate-300 px-2 py-1 text-xs" />
                  <button onClick={() => ecarter(p)} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Écarter (non requis)</button>
                </div>
              )}
            </div>
            {p.correction_motif && <div className="text-xs text-slate-500">Motif d'écartement : {p.correction_motif}</div>}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 p-4 space-y-2">
        <div className="text-sm font-medium text-slate-700">Ajouter un permis manuellement</div>
        {enExecutionOuApres && (
          <div className="text-xs text-amber-700">
            Dossier en exécution : un permis ajouté ici doit être rattaché à un événement du journal (origine tracée) —
            renseigne l'identifiant de l'événement ci-dessous.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <select value={newPermit.permit_type} onChange={(e) => setNewPermit((s) => ({ ...s, permit_type: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
            {PERMIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={newPermit.issuer_domain} onChange={(e) => setNewPermit((s) => ({ ...s, issuer_domain: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
            {ISSUER_DOMAINS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <input placeholder="Motif / origine" value={newPermit.required_reason}
            onChange={(e) => setNewPermit((s) => ({ ...s, required_reason: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
          {enExecutionOuApres && (
            <input placeholder="ID événement du journal" value={newPermit.linked_event_id}
              onChange={(e) => setNewPermit((s) => ({ ...s, linked_event_id: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
          )}
        </div>
        <button onClick={addPermit} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Ajouter le permis
        </button>
      </div>

      <details className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
        <summary className="cursor-pointer font-medium text-slate-600">Table de correspondance corps de métier → permis (indicative)</summary>
        <ul className="mt-2 space-y-1">
          {rules.map((r) => (
            <li key={r.id}>{r.corps_metier} → {permitLabel(r.permit_type)} ({r.label})</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
