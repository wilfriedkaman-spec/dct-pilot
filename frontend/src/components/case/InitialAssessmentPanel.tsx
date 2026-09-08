import { useState } from "react";
import { api, apiErrorMessage, type CaseRow } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";

const CONCLUSIONS = [
  { value: "favorable", label: "🟢 Favorable" },
  { value: "favorable_avec_reserves", label: "🟠 Favorable avec réserves" },
  { value: "defavorable", label: "🔴 Défavorable" },
  { value: "impossibilite_attester", label: "⚪ Impossibilité d'attester" },
] as const;

const CHECKS = [
  { key: "doe_disponible", label: "DOE disponible" },
  { key: "documents_garantie", label: "Documents de garantie disponibles" },
  { key: "essais_disponibles", label: "Résultats d'essais disponibles" },
  { key: "conformite_apparente", label: "Conformité apparente aux plans/CCTP" },
  { key: "anomalies_a3_levees", label: "Anomalies relevées en A3 levées" },
  { key: "validation_qhse_finale", label: "Validation QHSE finale" },
] as const;

export function InitialAssessmentPanel({ caseRow, onUpdated }: { caseRow: CaseRow; onUpdated: () => void }) {
  const { currentUser } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    avancement_estime: "", travaux_realises: "", travaux_en_cours: "", travaux_restants: "",
    anomalies_visibles: "", controles_impossibles: "", conclusion_partie_executee: "" as string,
    partie_restante: "oui" as "oui" | "non",
  });

  const [checks, setChecks] = useState({
    doe_disponible: caseRow.pre_closure_checks?.doe_disponible ?? false,
    documents_garantie: caseRow.pre_closure_checks?.documents_garantie ?? false,
    essais_disponibles: caseRow.pre_closure_checks?.essais_disponibles ?? false,
    conformite_apparente: caseRow.pre_closure_checks?.conformite_apparente ?? false,
    anomalies_a3_levees: caseRow.pre_closure_checks?.anomalies_a3_levees ?? false,
    validation_qhse_finale: caseRow.pre_closure_checks?.validation_qhse_finale ?? false,
  });

  async function confirmRouting() {
    setSaving(true); setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/a2-confirm-routing`, { updated_by: currentUser?.id });
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); } finally { setSaving(false); }
  }

  async function submitA3() {
    setSaving(true); setError(null);
    try {
      if (!form.conclusion_partie_executee) throw { response: { data: { error: "La conclusion de la partie exécutée est obligatoire." } } };
      await api.post(`/cases/${caseRow.id}/initial-assessment`, {
        assessed_by: currentUser?.id,
        avancement_estime: form.avancement_estime ? Number(form.avancement_estime) : null,
        travaux_realises: form.travaux_realises || null,
        travaux_en_cours: form.travaux_en_cours || null,
        travaux_restants: form.travaux_restants || null,
        anomalies_visibles: form.anomalies_visibles || null,
        controles_impossibles: form.controles_impossibles, // obligatoire, y compris chaîne vide explicite
        conclusion_partie_executee: form.conclusion_partie_executee,
        partie_restante_existe: form.partie_restante === "oui",
      });
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); } finally { setSaving(false); }
  }

  async function saveChecks() {
    setSaving(true); setError(null);
    try {
      await api.put(`/cases/${caseRow.id}/pre-closure-checks`, { ...checks, updated_by: currentUser?.id });
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); } finally { setSaving(false); }
  }

  const latestAssessment = caseRow.initial_assessments?.[0] ?? null;
  const showRoutingConfirm = caseRow.status === "a2_ouvert";
  const showA3Form = caseRow.status === "a3_constat_en_cours" && !latestAssessment;
  const showA4 = caseRow.status === "a4_verifications_en_cours" || caseRow.status === "a4_verifications_soldees"
    || (latestAssessment && latestAssessment.partie_restante_existe === false);

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        A3 — Constat initial (si état ≠ non démarré, ou régularisation a posteriori) et A4 — Vérifications
        avant clôture (si aucune partie ne reste à exécuter). Jamais de clôture directe depuis A3.
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>État à la prise en charge : {caseRow.etat_prise_en_charge ? <Badge label={caseRow.etat_prise_en_charge} /> : <span className="text-slate-400">— pas encore connu (saisir les dates clés)</span>}</span>
        <span>Situation : {caseRow.situation_administrative ? <Badge label={caseRow.situation_administrative} /> : <span className="text-slate-400">—</span>}</span>
      </div>

      {showRoutingConfirm && (
        <div className="rounded-md border border-slate-200 p-4">
          <div className="mb-2 text-sm text-slate-600">
            Dossier ouvert. Une fois l'état à la prise en charge connu (dates clés saisies) et la situation
            administrative confirmée, valide le routage : phase B directement si rien à constater, sinon A3.
          </div>
          <button onClick={confirmRouting} disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Confirmer et poursuivre →
          </button>
        </div>
      )}

      {showA3Form && (
        <div className="rounded-md border border-slate-200 p-4 space-y-3">
          <div className="text-sm font-medium text-slate-700">A3 — Constat initial (contrôleur affecté)</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Avancement estimé (%)</label>
              <input type="number" min={0} max={100} value={form.avancement_estime}
                onChange={(e) => setForm((f) => ({ ...f, avancement_estime: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Reste-t-il une partie à exécuter ?</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm((f) => ({ ...f, partie_restante: "oui" }))}
                  className={`rounded-md border p-2 text-xs ${form.partie_restante === "oui" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                  Oui — reste à exécuter
                </button>
                <button type="button" onClick={() => setForm((f) => ({ ...f, partie_restante: "non" }))}
                  className={`rounded-md border p-2 text-xs ${form.partie_restante === "non" ? "border-orange-500 bg-orange-50" : "border-slate-200"}`}>
                  Non — tout exécuté (→ A4)
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Travaux réalisés</label>
            <textarea value={form.travaux_realises} onChange={(e) => setForm((f) => ({ ...f, travaux_realises: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Travaux en cours</label>
              <textarea value={form.travaux_en_cours} onChange={(e) => setForm((f) => ({ ...f, travaux_en_cours: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Travaux restants</label>
              <textarea value={form.travaux_restants} onChange={(e) => setForm((f) => ({ ...f, travaux_restants: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Anomalies visibles</label>
            <textarea value={form.anomalies_visibles} onChange={(e) => setForm((f) => ({ ...f, anomalies_visibles: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Contrôles devenus impossibles à réaliser * <span className="text-slate-400">(champ obligatoire, y compris vide)</span>
            </label>
            <textarea value={form.controles_impossibles} onChange={(e) => setForm((f) => ({ ...f, controles_impossibles: e.target.value }))}
              placeholder="Aucun" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Conclusion — partie exécutée *</label>
            <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-4">
              {CONCLUSIONS.map((c) => (
                <button key={c.value} type="button" onClick={() => setForm((f) => ({ ...f, conclusion_partie_executee: c.value }))}
                  className={`rounded-md border p-2 text-xs ${form.conclusion_partie_executee === c.value ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={submitA3} disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              Figer le constat initial
            </button>
          </div>
        </div>
      )}

      {latestAssessment && (
        <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm">
          <div className="text-xs font-medium text-slate-500 mb-1">Constat initial enregistré le {new Date(latestAssessment.created_at).toLocaleDateString("fr-FR")}</div>
          <div>Conclusion partie exécutée : <Badge label={latestAssessment.conclusion_partie_executee ?? "—"} /></div>
          <div className="mt-1">Partie restante à exécuter : <strong>{latestAssessment.partie_restante_existe ? "Oui — dossier avancé en phase B" : "Non — dossier en vérifications avant clôture (A4)"}</strong></div>
          {latestAssessment.controles_impossibles !== undefined && (
            <div className="mt-1 text-xs text-slate-500">Contrôles devenus impossibles : {latestAssessment.controles_impossibles || "(aucun)"}</div>
          )}
        </div>
      )}

      {showA4 && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-orange-800">A4 — Vérifications avant clôture</div>
            <Badge label={caseRow.pre_closure_checks?.statut ?? "en_cours"} tone={caseRow.pre_closure_checks?.statut === "solde" ? "valide" : "a_corriger"} />
          </div>
          <ul className="space-y-1.5">
            {CHECKS.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={(checks as any)[c.key]}
                  onChange={(e) => setChecks((s) => ({ ...s, [c.key]: e.target.checked }))} />
                {c.label}
              </li>
            ))}
          </ul>
          <button onClick={saveChecks} disabled={saving}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
            Enregistrer les vérifications
          </button>
          {caseRow.pre_closure_checks?.statut === "solde" && (
            <div className="text-xs text-emerald-700">
              ✅ Vérifications soldées — le dossier est prêt pour la réception (E), qui reste toujours déclenchée par une demande du prestataire.
            </div>
          )}
        </div>
      )}

      {!showRoutingConfirm && !showA3Form && !latestAssessment && !showA4 && (
        <div className="text-sm text-slate-400">
          Rien à faire ici pour ce dossier à ce stade (circuit normal, non démarré à la prise en charge).
        </div>
      )}
    </div>
  );
}
