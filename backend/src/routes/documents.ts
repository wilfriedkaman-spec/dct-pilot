import { Router } from "express";
import { query, queryOne } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { renderAutorisationDemarrage } from "../documents/autorisationDemarrage.js";
import { renderReceptionPv } from "../documents/receptionPv.js";
import { renderAttestationBonneExecution } from "../documents/attestationBonneExecution.js";

export const documentsRouter = Router();

documentsRouter.get("/cases/:id/documents/autorisation-demarrage.pdf", asyncHandler(async (req, res) => {
  const caseRow = await queryOne("select * from cases where id = $1", [req.params.id]);
  if (!caseRow) return res.status(404).json({ error: "Dossier introuvable" });

  const authorization = await queryOne(
    "select * from case_startup_authorizations where case_id = $1 order by decided_at desc limit 1",
    [req.params.id]
  );
  if (!authorization) {
    return res.status(404).json({ error: "Aucune autorisation de démarrage n'a encore été décidée pour ce dossier — rien à générer." });
  }

  const company = caseRow.company_id ? await queryOne("select * from companies where id = $1", [caseRow.company_id]) : null;
  const decidedBy = await queryOne("select full_name from users where id = $1", [authorization.decided_by]);
  const demarrage = await queryOne(
    "select date_value from case_key_dates where case_id = $1 and date_type = 'demarrage_reel'",
    [req.params.id]
  );

  renderAutorisationDemarrage(res, {
    caseRow,
    company,
    authorization,
    decidedByName: decidedBy?.full_name ?? "—",
    demarrageReel: demarrage?.date_value ?? null,
  });
}));

// E5 — PV de réception (Annexe, cf. Annexe J pour le principe de rendu).
// Généré à partir de la dernière décision de réception réellement prise,
// quelle que soit son issue (favorable, avec réserves, défavorable,
// impossibilité) — un PV documente la visite, pas seulement un accord.
documentsRouter.get("/reception-decisions/:decId/documents/pv-reception.pdf", asyncHandler(async (req, res) => {
  const decision = await queryOne("select * from reception_decisions where id = $1", [req.params.decId]);
  if (!decision) return res.status(404).json({ error: "Décision de réception introuvable." });

  const request = await queryOne("select * from reception_requests where id = $1", [decision.reception_request_id]);
  const caseRow = await queryOne("select * from cases where id = $1", [request.case_id]);
  const company = caseRow.company_id ? await queryOne("select * from companies where id = $1", [caseRow.company_id]) : null;
  const checklist = await queryOne("select * from reception_checklists where reception_request_id = $1", [request.id]);
  const decidedBy = await queryOne("select full_name from users where id = $1", [decision.decided_by]);
  const reserves = decision.decision === "favorable_avec_reserves"
    ? await query("select * from reception_reserves where reception_decision_id = $1 order by delai", [decision.id])
    : [];

  renderReceptionPv(res, {
    caseRow, company, request, checklist, decision,
    decidedByName: decidedBy?.full_name ?? "—", reserves,
  });
}));

// E6 — Attestation de bonne exécution. N'existe que si une clôture a
// réellement été enregistrée (reception_closures) — impossible sans
// décision favorable ou favorable-avec-réserves (voir reception.ts).
documentsRouter.get("/reception-closures/:closureId/documents/attestation.pdf", asyncHandler(async (req, res) => {
  const closure = await queryOne("select * from reception_closures where id = $1", [req.params.closureId]);
  if (!closure) return res.status(404).json({ error: "Clôture introuvable." });

  const decision = await queryOne("select * from reception_decisions where id = $1", [closure.reception_decision_id]);
  const request = await queryOne("select * from reception_requests where id = $1", [decision.reception_request_id]);
  const caseRow = await queryOne("select * from cases where id = $1", [request.case_id]);
  const company = caseRow.company_id ? await queryOne("select * from companies where id = $1", [caseRow.company_id]) : null;
  const decidedBy = await queryOne("select full_name from users where id = $1", [decision.decided_by]);
  const reserves = decision.decision === "favorable_avec_reserves"
    ? await query("select * from reception_reserves where reception_decision_id = $1 order by delai", [decision.id])
    : [];

  renderAttestationBonneExecution(res, {
    caseRow, company, decision, closure,
    decidedByName: decidedBy?.full_name ?? "—", reserves,
  });
}));
