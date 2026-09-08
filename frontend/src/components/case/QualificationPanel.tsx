import { useState } from "react";
import { api, apiErrorMessage, type CaseRow, type User } from "../../api";
import { useApp } from "../../context/AppContext";

const FAMILLES = ["technique", "sst", "exploitation", "environnement"] as const;

export function QualificationPanel({ caseRow, users, onUpdated }: { caseRow: CaseRow; users: User[]; onUpdated: () => void }) {
  const { currentUser } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    assigned_controller_id: caseRow.assigned_controller_id ?? "",
    assigned_qhse_referent_id: caseRow.assigned_qhse_referent_id ?? "",
    origine_besoin: caseRow.origine_besoin ?? "direction_service",
    situation_administrative: caseRow.situation_administrative ?? "normal",
    scores: { technique: 1, sst: 1, exploitation: 0, environnement: 0 } as Record<string, number>,
  });

  const controllers = users.filter((u) => u.role_code === "controleur");
  const qhseRefs = users.filter((u) => u.role_code === "referent_qhse");

  const maxScore = Object.values(form.scores).reduce((a, b) => Math.max(a, b), 0);
  const criticiteProvisoire = maxScore >= 3 ? "elevee" : maxScore === 2 ? "moyenne" : "faible";

  async function submit(status: "a2_ouvert") {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/cases/${caseRow.id}/qualification`, {
        status,
        responsible_dct_id: currentUser?.id,
        assigned_controller_id: form.assigned_controller_id || null,
        assigned_qhse_referent_id: form.assigned_qhse_referent_id || null,
        origine_besoin: form.origine_besoin,
        situation_administrative: form.situation_administrative,
        criticite_provisoire: criticiteProvisoire,
        criticality_scores: FAMILLES.map((f) => ({ famille: f, score: form.scores[f] })),
      });
      onUpdated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const dejaOuvert = caseRow.status !== "a1_en_enregistrement" && caseRow.status !== "a1_recu";

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        A2 — Prise de connaissance et qualification (Responsable DCT). Le contrôleur technique est
        <strong> obligatoire et bloquant</strong> pour passer au statut « Dossier ouvert ».
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Contrôleur technique affecté * <span className="text-red-600">bloquant</span></label>
          <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.assigned_controller_id}
            onChange={(e) => setForm((f) => ({ ...f, assigned_controller_id: e.target.value }))}>
            <option value="">— non affecté —</option>
            {controllers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Référent QHSE/SST</label>
          <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.assigned_qhse_referent_id}
            onChange={(e) => setForm((f) => ({ ...f, assigned_qhse_referent_id: e.target.value }))}>
            <option value="">— non affecté —</option>
            {qhseRefs.map((u) => <option key={u.id} value={u.id}>{u.full_name} (transversal)</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Origine du besoin</label>
          <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.origine_besoin} onChange={(e) => setForm((f) => ({ ...f, origine_besoin: e.target.value }))}>
            <option value="direction_service">Direction/service</option>
            <option value="permissionnaire">Permissionnaire</option>
            <option value="urgence">Urgence</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Situation administrative</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForm((f) => ({ ...f, situation_administrative: "normal" }))}
              className={`rounded-md border p-2 text-xs ${form.situation_administrative === "normal" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
              Circuit normal
            </button>
            <button type="button" onClick={() => setForm((f) => ({ ...f, situation_administrative: "regularisation_a_posteriori" }))}
              className={`rounded-md border p-2 text-xs ${form.situation_administrative === "regularisation_a_posteriori" ? "border-orange-500 bg-orange-50" : "border-slate-200"}`}>
              Régularisation a posteriori (→ A3 obligatoire)
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-sm font-medium text-slate-700">Criticité provisoire — 4 familles</div>
        <div className="grid grid-cols-4 gap-3">
          {FAMILLES.map((f) => (
            <div key={f} className="rounded-md border border-slate-200 p-2">
              <div className="text-xs capitalize text-slate-500">{f}</div>
              <input type="range" min={0} max={4} value={form.scores[f]}
                onChange={(e) => setForm((s) => ({ ...s, scores: { ...s.scores, [f]: Number(e.target.value) } }))}
                className="w-full" />
              <div className="text-xs text-slate-600">{form.scores[f]}/4</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-sm">Criticité provisoire calculée : <strong className="uppercase">{criticiteProvisoire}</strong> <span className="text-xs text-slate-500">(recalculée en B4 avec les corps d'état réels)</span></div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => submit("a2_ouvert")} disabled={saving || dejaOuvert}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {dejaOuvert ? "Dossier déjà ouvert" : saving ? "Validation…" : "Valider → Ouvrir le dossier"}
        </button>
      </div>
    </div>
  );
}
