import { useEffect, useState } from "react";
import { api, type KpiIndicator } from "../api";

// [Migration v6] 8 des 12 indicateurs formels de l'Annexe L sont
// réellement calculés à partir des données de l'application (vue SQL
// qhse_kpi_dashboard). Les 4 autres n'ont aucune source de données dans ce
// prototype (Annexe H « déclaration d'incident » et Annexe K « évaluation
// prestataire » non implémentées ; aucune notion d'inspection
// "programmée") — affichés distinctement comme non suivis, avec la raison,
// plutôt que masqués ou simulés.
function pctColor(valeur: number | null, objectif: number | null) {
  if (valeur === null || objectif === null) return "text-slate-900";
  if (valeur >= objectif) return "text-emerald-600";
  if (valeur >= objectif * 0.8) return "text-amber-600";
  return "text-red-600";
}

function IndicatorCard({ ind }: { ind: KpiIndicator }) {
  if (ind.non_suivi) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Indicateur {ind.code} — non suivi</div>
        <div className="mt-1 text-sm text-slate-500">{ind.label}</div>
        <div className="mt-2 text-xs italic text-slate-400">{ind.raison}</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Indicateur {ind.code}</div>
      <div className="mt-1 text-sm text-slate-700">{ind.label}</div>
      <div className={`mt-2 text-2xl font-semibold ${pctColor(ind.valeur, ind.objectif)}`}>
        {ind.valeur === null ? "—" : `${ind.valeur}${ind.unite}`}
      </div>
      {ind.objectif !== null && <div className="mt-1 text-xs text-slate-400">Objectif : {ind.objectif}{ind.unite}</div>}
      {ind.note && <div className="mt-1 text-xs italic text-slate-400">{ind.note}</div>}
    </div>
  );
}

export function QhseKpiDashboard() {
  const [data, setData] = useState<{ indicateurs: KpiIndicator[] } | null>(null);

  useEffect(() => {
    api.get("/dashboard/qhse-kpi").then((r) => setData(r.data));
  }, []);

  if (!data) return <div className="text-slate-500">Chargement…</div>;

  const reels = data.indicateurs.filter((i) => !i.non_suivi);
  const nonSuivis = data.indicateurs.filter((i) => i.non_suivi);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Tableau de bord des indicateurs QHSE</h1>
        <p className="text-sm text-slate-500">Référentiel QHSE du Prestataire — Annexe L. {reels.length} indicateur(s) calculé(s) sur données réelles, {nonSuivis.length} non suivi(s) dans ce prototype.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reels.map((ind) => <IndicatorCard key={ind.code} ind={ind} />)}
      </div>

      {nonSuivis.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-600">Indicateurs non suivis (source de données absente du prototype)</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {nonSuivis.map((ind) => <IndicatorCard key={ind.code} ind={ind} />)}
          </div>
        </div>
      )}
    </div>
  );
}
