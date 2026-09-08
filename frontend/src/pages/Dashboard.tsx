import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Badge } from "../components/Badge";

type DashboardData = {
  dossiers_ouverts: number; en_preparation: number; en_execution: number; en_reception: number;
  nc_critiques: number; receptions_en_attente: number;
  recent_cases: { id: string; case_number: string; title: string; phase: string; status: string; niveau_critique_global?: string; controller_name?: string }[];
  alertes: { type: string; detail: string; case_id: string }[];
};

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.get("/dashboard").then((res) => setData(res.data));
  }, []);

  if (!data) return <div className="text-slate-500">Chargement…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Tableau de bord</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Dossiers ouverts" value={data.dossiers_ouverts} />
        <StatCard label="En préparation (B)" value={data.en_preparation} />
        <StatCard label="En exécution (C)" value={data.en_execution} />
        <StatCard label="NC critiques" value={data.nc_critiques} />
        <StatCard label="Réceptions (E)" value={data.en_reception} sub={`${data.receptions_en_attente} en attente de décision`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Dossiers récents</h2>
            <Link to="/dossiers" className="text-sm text-blue-600 hover:underline">Tout voir →</Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="pb-2">Dossier</th><th>Phase</th><th>Statut</th><th>Contrôleur</th><th>Criticité</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_cases.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="py-2">
                    <Link to={`/dossiers/${c.id}`} className="font-medium text-slate-900 hover:text-blue-600">{c.case_number}</Link>
                    <div className="text-xs text-slate-500">{c.title}</div>
                  </td>
                  <td><Badge label={c.phase} /></td>
                  <td className="text-xs text-slate-600">{c.status}</td>
                  <td className="text-xs">{c.controller_name ?? "—"}</td>
                  <td>{c.niveau_critique_global ? <Badge label={c.niveau_critique_global} tone={c.niveau_critique_global} /> : "—"}</td>
                </tr>
              ))}
              {data.recent_cases.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">Aucun dossier pour l'instant.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Alertes</h2>
          <div className="space-y-2">
            {data.alertes.map((a, i) => (
              <Link to={`/dossiers/${a.case_id}`} key={i} className="block rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100">
                {a.type === "nc_critique" ? "🔴" : "🟠"} {a.detail}
              </Link>
            ))}
            {data.alertes.length === 0 && <div className="text-sm text-slate-400">Aucune alerte.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
