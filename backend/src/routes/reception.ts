import { Router } from "express";
import { query, queryOne, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { assertPermission, requirePermission } from "../auth.js";

export const receptionRouter = Router();

receptionRouter.get("/cases/:id/reception-requests", asyncHandler(async (req, res) => {
  res.json(await query(`
    select r.*,
      (select row_to_json(c) from reception_checklists c where c.reception_request_id = r.id) as checklist,
      (select row_to_json(d) from reception_decisions d where d.reception_request_id = r.id) as decision,
      (select row_to_json(cl) from reception_closures cl
        where cl.reception_decision_id = (select id from reception_decisions where reception_request_id = r.id)) as closure
    from reception_requests r where r.case_id = $1 order by r.requested_at desc
  `, [req.params.id]));
}));

// La réception ne se déclenche jamais automatiquement : c'est une demande du
// prestataire, relayée par le contrôleur puis remontée au chef de service.
receptionRouter.post("/cases/:id/reception-requests", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into reception_requests (case_id, requested_by_company_contact, controleur_informe_at)
     values ($1,$2, now()) returning *`,
    [req.params.id, b.requested_by_company_contact ?? null]
  );
  await query("update cases set phase='E', status='e_visite_planifiee' where id=$1", [req.params.id]);
  await logEvent(req.params.id, null, "demande_reception", null, row);
  res.status(201).json(row);
}));

receptionRouter.patch("/reception-requests/:reqId/escalade", asyncHandler(async (req, res) => {
  const b = req.body; // { chef_service_id, decision_kaman: 'delegue'|'se_deporte', visite_conducted_by }
  const row = await queryOne(
    `update reception_requests set
       remonte_chef_service_at = now(),
       chef_service_id = $2,
       decision_kaman = $3,
       decision_kaman_at = now(),
       visite_conducted_by = $4
     where id = $1 returning *`,
    [req.params.reqId, b.chef_service_id, b.decision_kaman, b.visite_conducted_by]
  );
  res.json(row);
}));

// E1 — checklist automatique, lue sur les statuts déjà tracés
receptionRouter.get("/cases/:id/reception-checklist", asyncHandler(async (req, res) => {
  const caseId = req.params.id;
  const paLeves = (await queryOne(
    `select count(*)::int as n from case_paq_control_points p
     where p.case_id=$1 and p.type='PA' and not p.removed
       and not exists (
         select 1 from non_conformities nc where nc.case_id=$1 and nc.statut <> 'cloturee'
           and nc.control_result_id in (select id from control_results where paq_control_point_id = p.id)
       )`, [caseId]
  ))?.n;
  const paTotal = (await queryOne(`select count(*)::int as n from case_paq_control_points where case_id=$1 and type='PA' and not removed`, [caseId]))?.n ?? 0;
  const ncCritiquesOuvertes = (await queryOne(`select count(*)::int as n from non_conformities where case_id=$1 and criticite='critique' and statut<>'cloturee'`, [caseId]))?.n ?? 0;
  const actionsOuvertes = (await queryOne(`select count(*)::int as n from actions_register where case_id=$1 and statut in ('a_faire','en_cours')`, [caseId]))?.n ?? 0;

  const checklist = {
    pa_leves: paTotal === 0 || paLeves === paTotal,
    nc_critiques_cloturees: ncCritiquesOuvertes === 0,
    qhse_fin_chantier: true, // saisi manuellement par le référent QHSE — simplifié dans ce prototype
    documents_fin_chantier: true, // idem — DOE/garanties/essais, simplifié
    registre_actions_solde: actionsOuvertes === 0,
  };
  res.json(checklist);
}));

receptionRouter.post("/reception-requests/:reqId/checklist", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into reception_checklists (reception_request_id, pa_leves, nc_critiques_cloturees, qhse_fin_chantier, documents_fin_chantier, registre_actions_solde)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (reception_request_id) do update set
       pa_leves=excluded.pa_leves, nc_critiques_cloturees=excluded.nc_critiques_cloturees,
       qhse_fin_chantier=excluded.qhse_fin_chantier, documents_fin_chantier=excluded.documents_fin_chantier,
       registre_actions_solde=excluded.registre_actions_solde, computed_at=now()
     returning *`,
    [req.params.reqId, b.pa_leves, b.nc_critiques_cloturees, b.qhse_fin_chantier, b.documents_fin_chantier, b.registre_actions_solde]
  );
  res.status(201).json(row);
}));

// E3 — décision (4 issues)
// Migration v8 (RBAC, question Q2) : l'action réelle ("valider" ou
// "rejeter") dépend du contenu de la décision envoyée par le client — donc
// vérifiée dynamiquement à l'intérieur du handler plutôt que par un
// middleware de route statique. Chef de service et chef de département
// disposent tous deux du droit ; la hiérarchie à deux niveaux évoquée par
// l'utilisateur (Q2) n'est pas encore mécaniquement distincte entre les
// deux rôles pour cette route (voir "reste à faire").
receptionRouter.post("/reception-requests/:reqId/decision", asyncHandler(async (req, res) => {
  const b = req.body;
  const isFavorable = b.decision === "favorable" || b.decision === "favorable_avec_reserves";
  await assertPermission(req, "reception_decision", isFavorable ? "valider" : "rejeter");
  const row = await queryOne(
    `insert into reception_decisions (reception_request_id, decision, decided_by, pv_document_id, notification_document_id)
     values ($1,$2,$3,$4,$5) returning *`,
    [req.params.reqId, b.decision, b.decided_by, b.pv_document_id ?? null, b.notification_document_id ?? null]
  );

  if (b.decision === "impossibilite_receptionner" || b.decision === "defavorable") {
    // Retour au début du circuit E dans les deux cas : ni l'un ni l'autre
    // n'accorde la réception. Décision arbitrée avec le Chef de département :
    // une décision défavorable ne bloque pas le dossier — l'entreprise corrige
    // les non-conformités relevées pendant la visite, puis une nouvelle
    // demande de réception est enregistrée en vue d'un avis favorable. La
    // précédente demande et sa décision restent tracées telles quelles.
    await query("update cases set status='e_visite_planifiee' where id = (select case_id from reception_requests where id=$1)", [req.params.reqId]);
  } else {
    await query("update cases set status='e_decision_en_cours' where id = (select case_id from reception_requests where id=$1)", [req.params.reqId]);
  }

  await logEvent(null, b.decided_by, "decision_reception_" + b.decision, null, row);
  res.status(201).json(row);
}));

// E4 — réserves (cycle allégé, distinct d'une NC)
receptionRouter.post("/reception-decisions/:decId/reserves", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into reception_reserves (reception_decision_id, description, responsable, delai)
     values ($1,$2,$3,$4) returning *`,
    [req.params.decId, b.description, b.responsable ?? null, b.delai ?? null]
  );
  res.status(201).json(row);
}));

receptionRouter.patch("/reserves/:reserveId/lever", asyncHandler(async (req, res) => {
  const row = await queryOne(
    `update reception_reserves set statut='levee', constat_levee=$2, closed_at=now() where id=$1 returning *`,
    [req.params.reserveId, req.body.constat_levee]
  );
  res.json(row);
}));

receptionRouter.get("/reception-decisions/:decId/reserves", asyncHandler(async (req, res) => {
  res.json(await query("select * from reception_reserves where reception_decision_id = $1 order by delai", [req.params.decId]));
}));

// E5-E6 — PV + attestation + clôture du dossier
// Migration v8 (RBAC, question Q1) : la clôture définitive d'un dossier
// est réservée au chef de département.
receptionRouter.post("/reception-decisions/:decId/close", requirePermission("dossier", "cloturer"), asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into reception_closures (reception_decision_id, attestation_document_id, transmitted_accounting_at)
     values ($1,$2,now()) returning *`,
    [req.params.decId, b.attestation_document_id ?? null]
  );
  await query(`
    update cases set status='cloture'
    where id = (select r.case_id from reception_requests r
                join reception_decisions d on d.reception_request_id = r.id
                where d.id = $1)
  `, [req.params.decId]);
  await logEvent(null, b.closed_by ?? null, "dossier_cloture", null, row);
  res.status(201).json(row);
}));
