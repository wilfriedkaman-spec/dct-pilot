const TONE_CLASSES: Record<string, string> = {
  normal: "bg-emerald-100 text-emerald-800",
  a_surveiller: "bg-amber-100 text-amber-800",
  sensible: "bg-orange-100 text-orange-800",
  critique: "bg-red-100 text-red-800",
  faible: "bg-emerald-100 text-emerald-800",
  moyenne: "bg-amber-100 text-amber-800",
  elevee: "bg-orange-100 text-orange-800",
  eleve: "bg-orange-100 text-orange-800",
  valide: "bg-emerald-100 text-emerald-800",
  a_corriger: "bg-amber-100 text-amber-800",
  refuse: "bg-red-100 text-red-800",
  ouverte: "bg-red-100 text-red-800",
  action_en_cours: "bg-amber-100 text-amber-800",
  a_recontroler: "bg-blue-100 text-blue-800",
  cloturee: "bg-emerald-100 text-emerald-800",
  reouverte: "bg-red-100 text-red-800",
  requis: "bg-red-100 text-red-800",
  en_cours: "bg-amber-100 text-amber-800",
  delivre: "bg-emerald-100 text-emerald-800",
  expire: "bg-red-100 text-red-800",
  non_requis: "bg-slate-100 text-slate-500",
  mineure: "bg-slate-100 text-slate-600",
  majeure: "bg-orange-100 text-orange-800",
  modere: "bg-amber-100 text-amber-800",
  default: "bg-slate-100 text-slate-700",
};

export function Badge({ label, tone }: { label: string; tone?: string }) {
  const cls = TONE_CLASSES[tone ?? "default"] ?? TONE_CLASSES.default;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
