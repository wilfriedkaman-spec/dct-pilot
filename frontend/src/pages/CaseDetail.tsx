import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type CaseRow } from "../api";
import { useApp } from "../context/AppContext";
import { PhaseBoard } from "../components/PhaseBoard";
import { Badge } from "../components/Badge";
import { QualificationPanel } from "../components/case/QualificationPanel";
import { InitialAssessmentPanel } from "../components/case/InitialAssessmentPanel";
import { PlanningPanel } from "../components/case/PlanningPanel";
import { PreparationPanel } from "../components/case/PreparationPanel";
import { PermitsPanel } from "../components/case/PermitsPanel";
import { ExecutionPanel } from "../components/case/ExecutionPanel";
import { QhseInspectionPanel } from "../components/case/QhseInspectionPanel";
import { IncidentDeclarationPanel } from "../components/case/IncidentDeclarationPanel";
import { NcPanel } from "../components/case/NcPanel";
import { ActionsPanel } from "../components/case/ActionsPanel";
import { ReceptionPanel } from "../components/case/ReceptionPanel";
import { JournalPanel } from "../components/case/JournalPanel";

const TABS = [
  { key: "qualification", label: "A2 — Qualification" },
  { key: "planning", label: "Dates clés & suivi" },
  { key: "constat", label: "A3/A4 — Constat & vérifications" },
  { key: "preparation", label: "B — Préparation" },
  { key: "permits", label: "Permis et autorisations" },
  { key: "execution", label: "C — Exécution / PAQ" },
  { key: "qhse_inspection", label: "C — Inspection QHSE" },
  { key: "incidents", label: "Incidents QHSE" },
  { key: "nc", label: "D — Non-conformités" },
  { key: "actions", label: "Registre des actions" },
  { key: "reception", label: "E — Réception" },
  { key: "journal", label: "Journal des événements" },
] as const;

export function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { users } = useApp();
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("qualification");

  function reload() {
    if (id) api.get(`/cases/${id}`).then((r) => setCaseRow(r.data));
  }
  useEffect(reload, [id]);

  if (!caseRow) return <div className="text-slate-500">Chargement…</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{caseRow.case_number} — {caseRow.title}</h1>
            <div className="mt-1 text-sm text-slate-500">
              {caseRow.company_name ?? "—"} · Contrôleur : {caseRow.controller_name ?? "non affecté"} · Référent QHSE : {caseRow.qhse_referent_name ?? "non affecté"}
            </div>
          </div>
          <div className="flex gap-2">
            <Badge label={`Phase ${caseRow.phase}`} />
            {caseRow.niveau_critique_global && <Badge label={caseRow.niveau_critique_global} tone={caseRow.niveau_critique_global} />}
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Statut : <span className="font-mono">{caseRow.status}</span>
          {caseRow.situation_administrative === "regularisation_a_posteriori" && (
            <span className="ml-2 rounded bg-orange-100 px-2 py-0.5 text-orange-700">Régularisation a posteriori</span>
          )}
        </div>
      </div>

      <PhaseBoard currentPhase={caseRow.phase} />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 pt-3">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-t-md px-3 py-2 text-sm ${tab === t.key ? "bg-slate-100 font-medium text-slate-900" : "text-slate-500 hover:text-slate-800"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === "qualification" && <QualificationPanel caseRow={caseRow} users={users} onUpdated={reload} />}
          {tab === "planning" && <PlanningPanel caseRow={caseRow} onUpdated={reload} />}
          {tab === "constat" && <InitialAssessmentPanel caseRow={caseRow} onUpdated={reload} />}
          {tab === "preparation" && <PreparationPanel caseRow={caseRow} users={users} onUpdated={reload} />}
          {tab === "permits" && <PermitsPanel caseRow={caseRow} onUpdated={reload} />}
          {tab === "execution" && <ExecutionPanel caseRow={caseRow} users={users} onUpdated={reload} />}
          {tab === "qhse_inspection" && <QhseInspectionPanel caseRow={caseRow} onUpdated={reload} />}
          {tab === "incidents" && <IncidentDeclarationPanel caseRow={caseRow} onUpdated={reload} />}
          {tab === "nc" && <NcPanel caseRow={caseRow} users={users} onUpdated={reload} />}
          {tab === "actions" && <ActionsPanel caseRow={caseRow} />}
          {tab === "reception" && <ReceptionPanel caseRow={caseRow} users={users} onUpdated={reload} />}
          {tab === "journal" && <JournalPanel caseRow={caseRow} />}
        </div>
      </div>
    </div>
  );
}
