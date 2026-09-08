import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Company } from "../api";
import { useApp } from "../context/AppContext";

// A1 — Réception / enregistrement (Secrétariat). Rôle strictement factuel :
// aucun champ de qualification (criticité, contrôleur...) n'apparaît ici,
// exactement comme le référentiel l'exige.
export function NewCaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { currentUser } = useApp();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", nature_travaux: "", requesting_service: "",
    case_type: "type1_prestataire",
    trigger_document_type: "bon_commande",
    trigger_document_number: "", trigger_document_date: "",
    purchase_order_number: "", amount: "", company_id: "",
  });

  useEffect(() => { api.get("/companies").then((res) => setCompanies(res.data)); }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!currentUser) { setError("Sélectionnez d'abord un utilisateur connecté (Amon pour la saisie A1)."); return; }
    setSaving(true);
    setError(null);
    try {
      await api.post("/cases", {
        ...form,
        amount: form.amount ? Number(form.amount) : null,
        company_id: form.company_id || null,
        registered_by: currentUser.id,
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">A1 — Réception / enregistrement</h2>
          <p className="text-sm text-slate-500">Rôle strictement factuel — aucune qualification à ce stade.</p>
        </div>

        <div className="space-y-4 px-6 py-4">
          {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-slate-700">Intitulé et nature des travaux *</label>
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Nature des travaux (détail)</label>
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.nature_travaux} onChange={(e) => set("nature_travaux", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Service demandeur *</label>
              <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.requesting_service} onChange={(e) => set("requesting_service", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Entreprise / prestataire</label>
              <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.company_id} onChange={(e) => set("company_id", e.target.value)}>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => set("case_type", "type1_prestataire")}
              className={`rounded-md border p-3 text-left text-sm ${form.case_type === "type1_prestataire" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}
            >
              <div className="font-medium">🟦 Type 1</div>
              <div className="text-xs text-slate-500">Prestation/travaux avec prestataire — lettre de commande, BC, devis validé</div>
            </button>
            <button
              type="button"
              onClick={() => set("case_type", "type2_direct")}
              className={`rounded-md border p-3 text-left text-sm ${form.case_type === "type2_direct" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}
            >
              <div className="font-medium">🟩 Type 2</div>
              <div className="text-xs text-slate-500">Travaux autorisés en direct — courrier d'accord du DG</div>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Document déclencheur *</label>
              <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.trigger_document_type} onChange={(e) => set("trigger_document_type", e.target.value)}>
                <option value="lettre_commande">Lettre de commande</option>
                <option value="bon_commande">Bon de commande</option>
                <option value="devis_valide">Devis validé</option>
                <option value="accord_dg">Accord DG</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">N° document *</label>
              <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.trigger_document_number} onChange={(e) => set("trigger_document_number", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Date *</label>
              <input type="date" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.trigger_document_date} onChange={(e) => set("trigger_document_date", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">N° bon de commande</label>
              <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.purchase_order_number} onChange={(e) => set("purchase_order_number", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Montant (FCFA)</label>
              <input type="number" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Annuler</button>
          <button
            onClick={submit}
            disabled={saving || !form.title || !form.requesting_service || !form.trigger_document_number || !form.trigger_document_date}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer et transmettre au Responsable DCT"}
          </button>
        </div>
      </div>
    </div>
  );
}
