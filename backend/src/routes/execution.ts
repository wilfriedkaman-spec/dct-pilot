import { Router } from "express";
import { query, queryOne, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const executionRouter = Router();

// ---- C : visites planifiées / inopinées / hiérarchiques ----
executionRouter.get("/cases/:id/visits", asyncHandler(async (req, res) => {
  res.json(await query(`
    select v.*, u.full_name as conducted_by_name,
      (select json_agg(r.* order by r.created_at) from control_results r where r.visit_id = v.id) as results
    from control_visits v left join users u on u.id = v.conducted_by
    where v.case_id = $1 order by v.visit_date desc
  `, [req.params.id]));
}));

// [Consolidation technique, migration v7] Gap identifié en relisant ce
// fichier : rien n'empêchait jusqu'ici d'enregistrer une visite ou un
// résultat de contrôle sur un dossier qui n'est pas réellement en phase C
// (par exemple un dossier encore en B, ou déjà clôturé en E). Vérifié ici,
// avant écriture — message préfixé "Impossible" pour remonter en 409
// (asyncHandler) comme les autres règles métier de l'application.
async function ensurePhaseC(caseId: string) {
  const caseRow = await queryOne("select case_number, phase from cases where id = $1", [caseId]);
  if (!caseRow) throw new Error("Dossier introuvable");
  if (caseRow.phase !== "C") {
    throw new Error(`Impossible d'enregistrer une visite ou un résultat de contrôle : le dossier ${caseRow.case_number} n'est pas en phase C (phase actuelle : ${caseRow.phase}).`);
  }
}

executionRouter.post("/cases/:id/visits", asyncHandler(async (req, res) => {
  await ensurePhaseC(req.params.id);
  const b = req.body;
  const row = await queryOne(
    `insert into control_visits (case_id, visit_type, conducted_by, zone,
       supervision_controller_present, supervision_absence_motif, supervision_doc_suivi_a_jour, supervision_observer_id, supervision_comment)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [req.params.id, b.visit_type, b.conducted_by, b.zone ?? null,
     b.supervision_controller_present ?? null, b.supervision_absence_motif ?? null,
     b.supervision_doc_suivi_a_jour ?? null, b.supervision_observer_id ?? null, b.supervision_comment ?? null]
  );
  await logEvent(req.params.id, b.conducted_by, "visite_" + b.visit_type, null, row);
  res.status(201).json(row);
}));

// Résultat de contrôle sur un point du PAQ — la bascule NC / Registre des
// actions est automatique côté base (trigger auto_bascule_control_result).
executionRouter.post("/visits/:visitId/results", asyncHandler(async (req, res) => {
  const b = req.body;

  // Retrouver le dossier concerné (pour le garde-fou phase C, le journal, et
  // pour signaler au client si une NC ou une action a été créée).
  const ctx = await queryOne(`
    select cpp.case_id from control_visits v
    join case_paq_control_points cpp on cpp.id = $1
    where v.id = $2
  `, [b.paq_control_point_id, req.params.visitId]);
  if (ctx) await ensurePhaseC(ctx.case_id);

  const row = await queryOne(
    `insert into control_results (visit_id, paq_control_point_id, resultat, observation, preuve_document_ids, decided_by, decision, decision_motif)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [req.params.visitId, b.paq_control_point_id, b.resultat, b.observation ?? null,
     b.preuve_document_ids ?? null, b.decided_by ?? null, b.decision ?? null, b.decision_motif ?? null]
  );

  let createdNc = null, createdAction = null;
  if (row!.resultat === "non_conforme") {
    createdNc = await queryOne("select * from non_conformities where control_result_id = $1", [row!.id]);
  } else if (row!.resultat === "conforme_avec_observation") {
    createdAction = await queryOne("select * from actions_register where source_ref_id = $1", [row!.id]);
  }

  if (ctx) await logEvent(ctx.case_id, b.decided_by ?? null, "resultat_controle_" + row!.resultat, null, row);
  res.status(201).json({ result: row, created_nc: createdNc, created_action: createdAction });
}));
