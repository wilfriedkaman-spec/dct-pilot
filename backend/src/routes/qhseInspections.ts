import { Router } from "express";
import { query, queryOne, withTransaction, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const qhseInspectionsRouter = Router();

// ---- Fiche d'inspection QHSE de chantier (Annexe F, 31 points) ----
// Inspection "libre" de phase C, indépendante du PAQ. Soumission en un
// seul envoi transactionnel, comme la check-list de démarrage. RÈGLE
// [APPLICATIVE, documentée en migration v6] : tout point répondu "non"
// doit être accompagné d'une déclaration — NC (avec sa sévérité, Annexe F
// §"Critères de classification") ou action corrective simple (Registre
// des actions) — jamais un simple constat muet.

qhseInspectionsRouter.get("/qhse-inspection-library", asyncHandler(async (_req, res) => {
  res.json(await query("select * from qhse_inspection_library order by ordre"));
}));

qhseInspectionsRouter.get("/cases/:id/qhse-inspections", asyncHandler(async (req, res) => {
  const inspections = await query(
    `select i.*, u.full_name as inspector_name from case_qhse_inspections i
     left join users u on u.id = i.inspector_id
     where i.case_id = $1 order by i.created_at desc`,
    [req.params.id]
  );
  for (const insp of inspections) {
    insp.responses = await query(
      `select r.*, l.section, l.label, l.ordre from case_qhse_inspection_responses r
       join qhse_inspection_library l on l.item_code = r.item_code
       where r.inspection_id = $1 order by l.ordre`,
      [insp.id]
    );
    insp.non_conformities = await query(
      "select id, nc_number, criticite from non_conformities where qhse_inspection_id = $1",
      [insp.id]
    );
  }
  res.json(inspections);
}));

qhseInspectionsRouter.post("/cases/:id/qhse-inspections", asyncHandler(async (req, res) => {
  const b = req.body;
  // responses: [{ item_code, reponse, observation, declaration?: {
  //   type: 'nc', criticite, exigence_non_respectee, constat, delai_jours, echeance, responsable_entreprise
  // } | { type: 'action', description, responsable, date_limite } }]
  const library = await query("select item_code from qhse_inspection_library");
  const expectedCodes = new Set(library.map((l: any) => l.item_code));
  const provided: Record<string, any> = {};
  for (const r of b.responses ?? []) provided[r.item_code] = r;
  const missing = [...expectedCodes].filter((c) => !(c in provided));
  if (missing.length > 0) {
    return res.status(400).json({ error: `Réponse manquante pour : ${missing.join(", ")}` });
  }
  const unresolvedNon = (b.responses ?? [])
    .filter((r: any) => r.reponse === "non" && !r.declaration)
    .map((r: any) => r.item_code);
  if (unresolvedNon.length > 0) {
    return res.status(400).json({
      error: `Un point "Non" doit être déclaré comme non-conformité ou action corrective (point(s) concerné(s) : ${unresolvedNon.join(", ")}).`,
    });
  }

  const result = await withTransaction(async (client) => {
    const header = await client.query(
      `insert into case_qhse_inspections (case_id, inspector_id, prestataire_representative, meteo, conclusion)
       values ($1,$2,$3,$4,$5) returning *`,
      [req.params.id, b.inspector_id ?? null, b.prestataire_representative ?? null, b.meteo ?? null, b.conclusion]
    );
    const inspectionId = header.rows[0].id;
    const createdNcs: any[] = [];
    const createdActions: any[] = [];

    for (const r of b.responses) {
      await client.query(
        `insert into case_qhse_inspection_responses (inspection_id, item_code, reponse, observation)
         values ($1,$2,$3,$4)`,
        [inspectionId, r.item_code, r.reponse, r.observation ?? null]
      );
      if (r.reponse === "non" && r.declaration) {
        const d = r.declaration;
        if (d.type === "nc") {
          const nc = await client.query(
            `insert into non_conformities
               (case_id, angle, criticite, exigence_non_respectee, constat, responsable_entreprise, delai_jours, echeance, opened_by, qhse_inspection_id)
             values ($1,'qhse',$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
            [req.params.id, d.criticite, d.exigence_non_respectee ?? r.observation ?? r.item_code, d.constat ?? r.observation ?? "(à compléter)",
             d.responsable_entreprise ?? null, d.delai_jours ?? null, d.echeance ?? null, b.inspector_id ?? null, inspectionId]
          );
          createdNcs.push(nc.rows[0]);
        } else if (d.type === "action") {
          const action = await client.query(
            `insert into actions_register (case_id, origine, source_ref_id, description, responsable, date_limite, created_by)
             values ($1,'inspection_qhse',$2,$3,$4,$5,$6) returning *`,
            [req.params.id, inspectionId, d.description ?? r.observation ?? r.item_code, d.responsable ?? null, d.date_limite ?? null, b.inspector_id ?? null]
          );
          createdActions.push(action.rows[0]);
        }
      }
    }
    return { header: header.rows[0], createdNcs, createdActions };
  });

  await logEvent(req.params.id, b.inspector_id ?? null, "inspection_qhse", null, result.header);
  res.status(201).json(result);
}));
