import { Router } from "express";
import { query, queryOne, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const ncRouter = Router();

ncRouter.get("/cases/:id/non-conformities", asyncHandler(async (req, res) => {
  res.json(await query(`
    select n.*, u.full_name as opened_by_name,
      (select json_agg(a.* order by a.declared_at) from nc_corrective_actions a where a.nc_id = n.id) as corrective_actions,
      (select json_agg(l.* order by l.created_at) from nc_levy_reports l where l.nc_id = n.id) as levy_reports
    from non_conformities n left join users u on u.id = n.opened_by
    where n.case_id = $1 order by n.opened_at desc
  `, [req.params.id]));
}));

ncRouter.get("/non-conformities/:ncId", asyncHandler(async (req, res) => {
  const nc = await queryOne("select * from non_conformities where id = $1", [req.params.ncId]);
  if (!nc) return res.status(404).json({ error: "NC introuvable" });
  const actions = await query("select * from nc_corrective_actions where nc_id = $1 order by declared_at", [req.params.ncId]);
  const levies = await query("select * from nc_levy_reports where nc_id = $1 order by created_at", [req.params.ncId]);
  res.json({ ...nc, corrective_actions: actions, levy_reports: levies });
}));

// Action corrective déclarée par l'entreprise
ncRouter.post("/non-conformities/:ncId/corrective-action", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into nc_corrective_actions (nc_id, description, declared_by_company_contact)
     values ($1,$2,$3) returning *`,
    [req.params.ncId, b.description, b.declared_by_company_contact ?? null]
  );
  await query("update non_conformities set statut = 'action_en_cours' where id = $1 and statut = 'ouverte'", [req.params.ncId]);
  res.status(201).json(row);
}));

// Demande de recontrôle -> passage à "à recontrôler"
ncRouter.post("/non-conformities/:ncId/request-recheck", asyncHandler(async (req, res) => {
  const row = await queryOne(
    "update non_conformities set statut = 'a_recontroler' where id = $1 returning *",
    [req.params.ncId]
  );
  res.json(row);
}));

// Rapport de levée (NC critique : chef de service/département, visite
// strictement circonscrite à la NC) — obligatoire avant toute clôture
// d'une NC critique (vérifié par trigger SQL).
ncRouter.post("/non-conformities/:ncId/levy-report", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into nc_levy_reports (nc_id, conducted_by, constat_levee, preuve_document_ids, decision)
     values ($1,$2,$3,$4,$5) returning *`,
    [req.params.ncId, b.conducted_by, b.constat_levee, b.preuve_document_ids ?? null, b.decision]
  );
  if (b.decision === "maintien") {
    await query("update non_conformities set statut = 'reouverte' where id = $1", [req.params.ncId]);
  }
  await logEvent(null, b.conducted_by, "rapport_levee_nc", null, row);
  res.status(201).json(row);
}));

// Correction manuelle de la sévérité (Mineure/Majeure/Critique — Annexe
// F du référentiel QHSE). La classification automatique à l'ouverture
// (PA → critique, sinon mineure) ne peut jamais déterminer seule le
// niveau "majeure" ("susceptible d'entraîner ... une non-conformité
// contractuelle" est un jugement humain) — cette route est donc le seul
// moyen d'atteindre ce niveau. Motif obligatoire, vérifié par trigger SQL.
ncRouter.patch("/non-conformities/:ncId/criticite", asyncHandler(async (req, res) => {
  const b = req.body;
  const before = await queryOne("select * from non_conformities where id = $1", [req.params.ncId]);
  if (!before) return res.status(404).json({ error: "NC introuvable" });
  const row = await queryOne(
    "update non_conformities set criticite=$2, criticite_correction_motif=$3 where id=$1 returning *",
    [req.params.ncId, b.criticite, b.motif ?? null]
  );
  await logEvent(before.case_id, b.corrected_by ?? null, "correction_criticite_nc", before, row);
  res.json(row);
}));

// Clôture — le trigger SQL vérifie qu'une NC critique a un rapport de
// levée confirmée, sinon l'erreur métier remonte telle quelle au client.
ncRouter.patch("/non-conformities/:ncId/close", asyncHandler(async (req, res) => {
  const row = await queryOne(
    "update non_conformities set statut = 'cloturee' where id = $1 returning *",
    [req.params.ncId]
  );
  res.json(row);
}));
