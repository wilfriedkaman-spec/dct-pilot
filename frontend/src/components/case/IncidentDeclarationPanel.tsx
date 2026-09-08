import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRow } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";

const TYPE_LABELS: Record<string, string> = {
  presqu_accident: "Presqu'accident",
  incident: "Incident",
  accident: "Accident",
};

const CONSEQUENCE_LABELS: Record<string, string> = {
  aucune: "Aucune",
  degat_materiel: "Dégât matériel",
  blessure_legere: "Blessure légère",
  blessure_grave: "Blessure grave",
  deces: "Décès",
};

const CONSEQUENCE_TONE: Record<string, string> = {
  aucune: "default",
  degat_materiel: "moyenne",
  blessure_legere: "a_corriger",
  blessure_grave: "critique",
  deces: "critique",
};

// [ARBITRAGE, migration v7] Le référentiel (Annexe H) décrit l'usage de
// cette fiche sans fournir de liste de champs — voir le commentaire SQL de
// la migration. Un accident déclaré "blessure grave" ou "décès" fait
// automatiquement basculer le dossier en niveau de criticité "critique"
// (calculé côté serveur, jamais laissé à l'appréciation de l'écran).
export function IncidentDeclarationPanel({ caseRow, onUpdated }: { caseRow: CaseRow; onUpdated: () => void }) {
  const { currentUser, can } = useApp();
  const [declarations, setDeclarations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [typeEvenement, setTypeEvenement] = useState("presqu_accident");
  const [dateEvenement, setDateEvenement] = useState(new Date().toISOString().slice(0, 10));
  const [heure, setHeure] = useState("");
  const [lieu, setLieu] = useState("");
  const [personnesImpliquees, setPersonnesImpliquees] = useState("");
  const [descriptionFaits, setDescriptionFaits] = useState("");
  const [consequences, setConsequences] = useState("aucune");
  const [arretTravail, setArretTravail] = useState(false);
  const [nombreJours, setNombreJours] = useState("");
  const [temoins, setTemoins] = useState("");
  const [causes, setCauses] = useState("");
  const [mesures, setMesures] = useState("");
  const [addAction, setAddAction] = useState(false);
  const [actionDescription, setActionDescription] = useState("");
  const [actionResponsable, setActionResponsable] = useState("");

  function reload() {
    api.get(`/cases/${caseRow.id}/incident-declarations`).then((r) => setDeclarations(r.data));
  }
  useEffect(reload, [caseRow.id]);

  function resetForm() {
    setTypeEvenement("presqu_accident"); setDateEvenement(new Date().toISOString().slice(0, 10));
    setHeure(""); setLieu(""); setPersonnesImpliquees(""); setDescriptionFaits("");
    setConsequences("aucune"); setArretTravail(false); setNombreJours(""); setTemoins("");
    setCauses(""); setMesures(""); setAddAction(false); setActionDescription(""); setActionResponsable("");
  }

  async function submit() {
    setError(null);
    try {
      await api.post(`/cases/${caseRow.id}/incident-declarations`, {
        type_evenement: typeEvenement, date_evenement: dateEvenement, heure_evenement: heure || null,
        lieu: lieu || null, personnes_impliquees: personnesImpliquees || null, description_faits: descriptionFaits,
        consequences, arret_travail: arretTravail, nombre_jours_arret: nombreJours ? Number(nombreJours) : null,
        temoins: temoins || null, causes_identifiees: causes || null, mesures_immediates: mesures || null,
        declared_by: currentUser?.id,
        action_corrective: addAction ? { description: actionDescription, responsable: actionResponsable || null } : undefined,
      });
      resetForm(); setShowForm(false);
      reload(); onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  return (
    <div>
      {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="space-y-2">
        {declarations.map((d) => (
          <div key={d.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium text-slate-900">{TYPE_LABELS[d.type_evenement]}</span>
                <span className="ml-2 text-xs text-slate-500">{new Date(d.date_evenement).toLocaleDateString("fr-FR")}{d.lieu ? ` — ${d.lieu}` : ""}</span>
              </div>
              <Badge label={CONSEQUENCE_LABELS[d.consequences]} tone={CONSEQUENCE_TONE[d.consequences]} />
            </div>
            <div className="mt-1 text-slate-600">{d.description_faits}</div>
            {d.actions_liees?.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">Action(s) corrective(s) liée(s) : {d.actions_liees.map((a: any) => a.description).join(", ")}</div>
            )}
          </div>
        ))}
        {declarations.length === 0 && <div className="text-sm text-slate-400">Aucun incident, accident ou presqu'accident déclaré sur ce dossier.</div>}
      </div>

      {/* Migration v8 (RBAC, Q4) : ouvert à tous les rôles de terrain, pas
         au secrétariat ni à l'administrateur. */}
      {!showForm && (
        can("declaration_incident", "creer") ? (
          <button onClick={() => setShowForm(true)} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            + Déclarer un incident / accident / presqu'accident (Annexe H)
          </button>
        ) : (
          <p className="mt-3 text-xs text-slate-400">Ce rôle ne peut pas déclarer d'incident.</p>
        )
      )}

      {showForm && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap gap-2">
            <select value={typeEvenement} onChange={(e) => setTypeEvenement(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {Object.entries(TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input type="date" value={dateEvenement} onChange={(e) => setDateEvenement(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <input placeholder="Heure (ex. 14h30)" value={heure} onChange={(e) => setHeure(e.target.value)} className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <input placeholder="Lieu" value={lieu} onChange={(e) => setLieu(e.target.value)} className="flex-1 min-w-[140px] rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <input placeholder="Personnes impliquées" value={personnesImpliquees} onChange={(e) => setPersonnesImpliquees(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <textarea placeholder="Description des faits" value={descriptionFaits} onChange={(e) => setDescriptionFaits(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" rows={2} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-600">Conséquences :</label>
            <select value={consequences} onChange={(e) => setConsequences(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {Object.entries(CONSEQUENCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={arretTravail} onChange={(e) => setArretTravail(e.target.checked)} />
              Arrêt de travail
            </label>
            {arretTravail && (
              <input type="number" placeholder="Nombre de jours" value={nombreJours} onChange={(e) => setNombreJours(e.target.value)}
                className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            )}
          </div>
          {(consequences === "blessure_grave" || consequences === "deces") && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              ⚠️ Cette conséquence fera automatiquement basculer le dossier en niveau de criticité "critique".
            </div>
          )}
          <input placeholder="Témoins" value={temoins} onChange={(e) => setTemoins(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="Causes identifiées" value={causes} onChange={(e) => setCauses(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input placeholder="Mesures immédiates prises" value={mesures} onChange={(e) => setMesures(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={addAction} onChange={(e) => setAddAction(e.target.checked)} />
            Créer une action corrective liée
          </label>
          {addAction && (
            <div className="flex gap-2 rounded-md border border-slate-100 bg-slate-50 p-2">
              <input placeholder="Description de l'action" value={actionDescription} onChange={(e) => setActionDescription(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="Responsable" value={actionResponsable} onChange={(e) => setActionResponsable(e.target.value)}
                className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm" />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={!descriptionFaits || (addAction && !actionDescription)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              Enregistrer la déclaration
            </button>
            <button onClick={() => { resetForm(); setShowForm(false); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
