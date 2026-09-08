import { Router } from "express";
import { query, queryOne, withTransaction, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const startupChecklistRouter = Router();

// ---- Check-list de démarrage détaillée (Annexe E, 29 points) ----
// Remplace la tautologie précédente ("check-list réalisée" toujours vraie
// dans la checklist B6). Soumission en un seul envoi transactionnel :
// l'en-tête et les 29 réponses sont acceptés ou rejetés ensemble — un
// déclencheur différé (migration v6) refuse toute check-list incomplète.

startupChecklistRouter.get("/startup-checklist-library", asyncHandler(async (_req, res) => {
  res.json(await query("select * from startup_checklist_library order by ordre"));
}));

startupChecklistRouter.get("/cases/:id/detailed-startup-checklists", asyncHandler(async (req, res) => {
  const checklists = await query(
    `select c.*, u.full_name as controller_name from case_startup_checklists c
     left join users u on u.id = c.controller_id
     where c.case_id = $1 order by c.created_at desc`,
    [req.params.id]
  );
  for (const c of checklists) {
    c.responses = await query(
      `select r.*, l.section, l.label, l.ordre from case_startup_checklist_responses r
       join startup_checklist_library l on l.item_code = r.item_code
       where r.checklist_id = $1 order by l.ordre`,
      [c.id]
    );
  }
  res.json(checklists);
}));

startupChecklistRouter.post("/cases/:id/detailed-startup-checklists", asyncHandler(async (req, res) => {
  const b = req.body; // { controller_id, prestataire_representative, conclusion, reserves, responses: [{item_code, reponse, observation}] }
  const library = await query("select item_code from startup_checklist_library");
  const expectedCodes = new Set(library.map((l: any) => l.item_code));
  const providedCodes = new Set((b.responses ?? []).map((r: any) => r.item_code));
  const missing = [...expectedCodes].filter((c) => !providedCodes.has(c));
  if (missing.length > 0) {
    return res.status(400).json({ error: `Réponse manquante pour : ${missing.join(", ")}` });
  }

  const row = await withTransaction(async (client) => {
    const header = await client.query(
      `insert into case_startup_checklists (case_id, controller_id, prestataire_representative, conclusion, reserves)
       values ($1,$2,$3,$4,$5) returning *`,
      [req.params.id, b.controller_id ?? null, b.prestataire_representative ?? null, b.conclusion, b.reserves ?? null]
    );
    const checklistId = header.rows[0].id;
    for (const r of b.responses) {
      await client.query(
        `insert into case_startup_checklist_responses (checklist_id, item_code, reponse, observation)
         values ($1,$2,$3,$4)`,
        [checklistId, r.item_code, r.reponse, r.observation ?? null]
      );
    }
    return header.rows[0];
  });

  await logEvent(req.params.id, b.controller_id ?? null, "checklist_demarrage_detaillee", null, row);
  res.status(201).json(row);
}));
