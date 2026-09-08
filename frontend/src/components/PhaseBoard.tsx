const PHASES: { code: string; label: string; sub: string[] }[] = [
  { code: "A", label: "Ouverture", sub: ["A1 Réception", "A2 Qualification", "A3 Constat", "A4 Vérifications"] },
  { code: "B", label: "Préparation", sub: ["B1 Entreprise", "B2 QHSE", "B3 Documents", "B4 PAQ", "B5 Réunion", "B6 OS"] },
  { code: "C", label: "Exécution", sub: ["Visites planifiées", "Visites inopinées", "Rapports auto"] },
  { code: "D", label: "Non-conformités", sub: ["Traitement des NC", "Recontrôle", "Levée"] },
  { code: "E", label: "Réception", sub: ["E1 Checklist", "E2 Visite", "E3 Décision", "E4 Réserves", "E5 PV", "E6 Attestation"] },
];

export function PhaseBoard({ currentPhase }: { currentPhase: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
      {PHASES.map((p) => {
        const isCurrent = p.code === currentPhase;
        const order = PHASES.findIndex((x) => x.code === currentPhase);
        const isPast = PHASES.findIndex((x) => x.code === p.code) < order;
        return (
          <div
            key={p.code}
            className={`rounded-lg border p-3 ${
              isCurrent ? "border-blue-500 ring-2 ring-blue-200 bg-blue-50" : isPast ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
            }`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{p.code} · {p.label}</div>
            <ul className="mt-2 space-y-1">
              {p.sub.map((s) => (
                <li key={s} className="rounded bg-white/70 px-2 py-1 text-xs text-slate-600 border border-slate-100">{s}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
