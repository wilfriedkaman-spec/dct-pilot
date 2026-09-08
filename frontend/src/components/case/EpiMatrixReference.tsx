import { useEffect, useState } from "react";
import { api, type EpiMatrixEntry } from "../../api";

const COLUMNS: { key: keyof EpiMatrixEntry; label: string }[] = [
  { key: "casque", label: "Casque" },
  { key: "gilet_hv", label: "Gilet HV" },
  { key: "chaussures_securite", label: "Chaussures" },
  { key: "gants", label: "Gants" },
  { key: "lunettes", label: "Lunettes" },
  { key: "protection_auditive", label: "Prot. auditive" },
  { key: "masque_respirateur", label: "Masque" },
  { key: "harnais", label: "Harnais" },
  { key: "vetement_hv_adapte", label: "Vêtement HV" },
];

function cell(v: string) {
  const cls = v === "O" ? "text-emerald-700 font-semibold" : v === "R" ? "text-amber-600" : v === "N/A" ? "text-slate-300" : "text-slate-600 text-[10px]";
  return <span className={cls}>{v}</span>;
}

// Annexe I — matrice de référence (O = obligatoire, R = recommandé selon
// les risques, N/A = non applicable). Purement documentaire : consultée en
// contexte lors de l'inspection QHSE (point S1 "port des EPI"), pas de
// saisie possible ici.
export function EpiMatrixReference() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EpiMatrixEntry[]>([]);

  useEffect(() => {
    if (open && rows.length === 0) api.get("/epi-matrix").then((r) => setRows(r.data));
  }, [open]);

  return (
    <div className="rounded-md border border-slate-200">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50">
        {open ? "▾" : "▸"} Consulter la matrice EPI de référence (Annexe I)
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-slate-100 p-2">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-1 pr-2">Activité</th>
                {COLUMNS.map((c) => <th key={c.key} className="pb-1 px-1 text-center">{c.label}</th>)}
                <th className="pb-1 pl-2">Autres EPI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.activite} className="border-t border-slate-100">
                  <td className="py-1 pr-2 font-medium text-slate-700">{r.activite}</td>
                  {COLUMNS.map((c) => <td key={c.key} className="py-1 px-1 text-center">{cell(r[c.key] as string)}</td>)}
                  <td className="py-1 pl-2 text-slate-500">{r.autres_epi_specifiques ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
