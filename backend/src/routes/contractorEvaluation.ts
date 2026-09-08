import { Router } from "express";
import { query, queryOne, withTransaction, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { requirePermission } from "../auth.js";

export const contractorEvaluationRouter = Router();

// ---- Annexe K — Fiche d'évaluation QHSE du prestataire ----
// Grille verbatim (21 critères, 5 sections, notation 0-4, migration v7).
// Le pourcentage et l'appréciation globale sont TOUJOURS recalculés ici,
// jamais acceptés du client — même principe que le reste de l'application
// (niveau_initial des risques, checklist B6, indicateurs KPI).

const MAX_NOTE = 4;

function appreciation(pourcentage: number): string {
  if (pourcentage >= 90) return "Excellent";
  if (pourcentage >= 80) return "Très satisfaisant";
  if (pourcentage >= 70) return "Satisfaisant";
  if (pourcentage >= 60) return "Acceptable sous réserve";
  return "Insuffisant";
}

async function withComputedResult(evaluation: any) {
  const scores = await query(
    `select s.*, c.section, c.label, c.ordre from case_contractor_evaluation_scores s
     join contractor_evaluation_criteria c on c.item_code = s.item_code
     where s.evaluation_id = $1 order by c.ordre`,
    [evaluation.id]
  );
  const total = scores.reduce((sum: number, s: any) => sum + s.note, 0);
  const max = scores.length * MAX_NOTE;
  const pourcentage = max > 0 ? Math.round((total / max) * 1000) / 10 : 0;
  return { ...evaluation, scores, total, max, pourcentage, appreciation: appreciation(pourcentage) };
}

contractorEvaluationRouter.get("/contractor-evaluation-criteria", asyncHandler(async (_req, res) => {
  res.json(await query("select * from contractor_evaluation_criteria order by ordre"));
}));

contractorEvaluationRouter.get("/cases/:id/contractor-evaluations", asyncHandler(async (req, res) => {
  const evaluations = await query(
    `select e.*, u.full_name as controller_name from case_contractor_evaluations e
     left join users u on u.id = e.controller_id
     where e.case_id = $1 order by e.created_at desc`,
    [req.params.id]
  );
  res.json(await Promise.all(evaluations.map(withComputedResult)));
}));

// Migration v8 (RBAC) : réservé au contrôleur, au chef de service et au
// chef de département — le secrétariat, les référents SST et
// l'administrateur ne remplissent pas cette fiche.
contractorEvaluationRouter.post("/cases/:id/contractor-evaluations", requirePermission("evaluation_prestataire", "creer"), asyncHandler(async (req, res) => {
  const b = req.body; // { controller_id, points_forts, points_ameliorer, recommandations, observations_complementaires, scores: [{item_code, note, observation}] }
  const library = await query("select item_code from contractor_evaluation_criteria");
  const expectedCodes = new Set(library.map((l: any) => l.item_code));
  const providedCodes = new Set((b.scores ?? []).map((s: any) => s.item_code));
  const missing = [...expectedCodes].filter((c) => !providedCodes.has(c));
  if (missing.length > 0) {
    return res.status(400).json({ error: `Note manquante pour : ${missing.join(", ")}` });
  }

  const row = await withTransaction(async (client) => {
    const header = await client.query(
      `insert into case_contractor_evaluations (case_id, controller_id, points_forts, points_ameliorer, recommandations, observations_complementaires)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [req.params.id, b.controller_id ?? null, b.points_forts ?? null, b.points_ameliorer ?? null, b.recommandations ?? null, b.observations_complementaires ?? null]
    );
    const evaluationId = header.rows[0].id;
    for (const s of b.scores) {
      await client.query(
        `insert into case_contractor_evaluation_scores (evaluation_id, item_code, note, observation)
         values ($1,$2,$3,$4)`,
        [evaluationId, s.item_code, s.note, s.observation ?? null]
      );
    }
    return header.rows[0];
  });

  await logEvent(req.params.id, b.controller_id ?? null, "evaluation_qhse_prestataire", null, row);
  res.status(201).json(await withComputedResult(row));
}));
