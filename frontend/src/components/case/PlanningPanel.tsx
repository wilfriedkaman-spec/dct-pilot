import { useEffect, useState } from "react";
import { api, apiErrorMessage, type CaseRow } from "../../api";
import { useApp } from "../../context/AppContext";
import { Badge } from "../Badge";

const DATE_TYPES: { key: string; label: string; verbal?: boolean }[] = [
  { key: "premiere_info_dct", label: "1ère information du DCT", verbal: true },
  { key: "premiere_intervention_dct", label: "1ère intervention du DCT" },
  { key: "reception_document_reference", label: "Réception du document de référence" },
  { key: "production_os", label: "Production de l'OS" },
  { key: "notification_os", label: "Notification de l'OS" },
  { key: "demarrage_reel", label: "Démarrage réel des travaux" },
  { key: "fin_travaux_constatee", label: "Fin des travaux constatée" },
];

const ETAT_LABEL: Record<string, string> = { non_demarre: "Non démarré", en_cours: "En cours", termine: "Terminé" };

export function PlanningPanel({ caseRow, onUpdated }: { caseRow: CaseRow; onUpdated: () => void }) {
  const { currentUser } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, { value: string; verbal: boolean }>>({});
  const [dateFinPrevue, setDateFinPrevue] = useState(caseRow.date_fin_prevue ?? "");
  const [avancement, setAvancement] = useState(caseRow.avancement_pourcentage?.toString() ?? "");
  const [overrideEtat, setOverrideEtat] = useState(false);
  const [etatCorrige, setEtatCorrige] = useState("termine");
  const [justification, setJustification] = useState("");

  useEffect(() => {
    const map: Record<string, { value: string; verbal: boolean }> = {};
    for (const d of caseRow.key_dates ?? []) {
      map[d.date_type] = { value: d.date_value ? d.date_value.slice(0, 10) : "", verbal: d.is_verbal };
    }
    setDates(map);
    setDateFinPrevue(caseRow.date_fin_prevue ? caseRow.date_fin_prevue.slice(0, 10) : "");
    setAvancement(caseRow.avancement_pourcentage?.toString() ?? "");
  }, [caseRow]);

  function setDate(key: string, value: string) {
    setDates((d) => ({ ...d, [key]: { value, verbal: d[key]?.verbal ?? false } }));
  }
  function setVerbal(key: string, verbal: boolean) {
    setDates((d) => ({ ...d, [key]: { value: d[key]?.value ?? "", verbal } }));
  }

  async function saveDates() {
    setError(null);
    try {
      await api.put(`/cases/${caseRow.id}/key-dates`, {
        updated_by: currentUser?.id,
        dates: DATE_TYPES.map((t) => ({
          date_type: t.key,
          date_value: dates[t.key]?.value || null,
          is_verbal: dates[t.key]?.verbal ?? false,
        })),
      });
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function savePlanning() {
    setError(null);
    try {
      await api.patch(`/cases/${caseRow.id}/planning`, {
        date_fin_prevue: dateFinPrevue || null,
        avancement_pourcentage: avancement === "" ? null : Number(avancement),
        updated_by: currentUser?.id,
      });
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function confirmerEtat() {
    setError(null);
    try {
      await api.patch(`/cases/${caseRow.id}/qualification`, {
        etat_prise_en_charge: etatCorrige,
        etat_prise_en_charge_source: "corrige_justifie",
        etat_prise_en_charge_justification: justification,
      });
      setOverrideEtat(false); setJustification("");
      onUpdated();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">État de prise en charge</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span>Calcul automatique :</span>
          <Badge label={caseRow.etat_prise_en_charge_auto ? ETAT_LABEL[caseRow.etat_prise_en_charge_auto] : "en attente de dates"} />
          {caseRow.etat_prise_en_charge_source === "corrige_justifie" && (
            <>
              <span className="text-slate-400">—</span>
              <span>Retenu (corrigé par le Responsable) :</span>
              <Badge label={caseRow.etat_prise_en_charge ? ETAT_LABEL[caseRow.etat_prise_en_charge] : "—"} tone="critique" />
            </>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Signal auto « terminé » : date de fin de travaux constatée renseignée, ou constat initial (A3) concluant qu'aucune partie ne reste à exécuter.
          Le Responsable DCT garde la main pour corriger, avec justification obligatoire.
        </p>
        {!overrideEtat ? (
          <button onClick={() => setOverrideEtat(true)} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">
            Corriger l'état retenu
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select value={etatCorrige} onChange={(e) => setEtatCorrige(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="non_demarre">Non démarré</option>
              <option value="en_cours">En cours</option>
              <option value="termine">Terminé</option>
            </select>
            <input placeholder="Justification (obligatoire)" value={justification} onChange={(e) => setJustification(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            <button onClick={confirmerEtat} disabled={!justification} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
              Confirmer
            </button>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">Dates clés</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {DATE_TYPES.map((t) => (
            <div key={t.key} className="flex items-center gap-2">
              <label className="w-56 shrink-0 text-sm text-slate-700">{t.label}</label>
              <input type="date" value={dates[t.key]?.value ?? ""} onChange={(e) => setDate(t.key, e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              {t.verbal && (
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input type="checkbox" checked={dates[t.key]?.verbal ?? false} onChange={(e) => setVerbal(t.key, e.target.checked)} />
                  verbale
                </label>
              )}
            </div>
          ))}
        </div>
        <button onClick={saveDates} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Enregistrer les dates
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-medium text-slate-900">Suivi planning <span className="text-xs text-slate-500">facteurs retard / écart d'avancement du niveau critique</span></h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500">Date de fin prévue</label>
            <input type="date" value={dateFinPrevue} onChange={(e) => setDateFinPrevue(e.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Avancement déclaré (%)</label>
            <input type="number" min={0} max={100} value={avancement} onChange={(e) => setAvancement(e.target.value)}
              className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <button onClick={savePlanning} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Enregistrer le suivi
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Retard : date de fin prévue dépassée, dossier ni en réception ni clôturé. Écart d'avancement : avancement déclaré
          &gt; 20 points en retard sur l'avancement attendu au prorata du temps écoulé depuis le démarrage réel.
        </p>
      </section>
    </div>
  );
}
