import { Router } from "express";
import { query, queryOne, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const marketRiskRouter = Router();

// ---- Classification du marché par niveau de risque (Annexe B) ----
// Toujours une décision humaine, jamais déduite automatiquement — voir
// commentaire de la migration v6. La justification n'est pas obligatoire
// au sens d'un point d'arrêt, mais fortement recommandée côté UI.

marketRiskRouter.get("/document-requirements-library", asyncHandler(async (_req, res) => {
  res.json(await query("select * from document_requirements_library order by niveau_min, label"));
}));

marketRiskRouter.put("/cases/:id/niveau-risque-marche", asyncHandler(async (req, res) => {
  const b = req.body;
  const before = await queryOne("select * from cases where id = $1", [req.params.id]);
  if (!before) return res.status(404).json({ error: "Dossier introuvable" });
  const row = await queryOne(
    `update cases set
       niveau_risque_marche = $2,
       niveau_risque_marche_justification = $3,
       niveau_risque_marche_decided_by = $4,
       niveau_risque_marche_decided_at = now()
     where id = $1 returning *`,
    [req.params.id, b.niveau_risque_marche, b.justification ?? null, b.decided_by ?? null]
  );
  await logEvent(req.params.id, b.decided_by ?? null, "classification_niveau_risque_marche", before, row);
  res.json(row);
}));

// Documents requis pour le niveau du dossier, avec leur statut réel dans
// case_prerequisite_documents (B3) — pour affichage ET pour le calcul du
// gate B6 (voir computeStartupChecklist, preparation.ts).
marketRiskRouter.get("/cases/:id/required-documents", asyncHandler(async (req, res) => {
  const caseRow = await queryOne("select niveau_risque_marche from cases where id = $1", [req.params.id]);
  if (!caseRow) return res.status(404).json({ error: "Dossier introuvable" });
  if (!caseRow.niveau_risque_marche) return res.json({ niveau: null, required: [] });

  const required = await query(
    `select l.document_type, l.label,
       (select statut from case_prerequisite_documents d
        where d.case_id = $1 and d.document_type = l.document_type
        order by d.created_at desc limit 1) as statut
     from document_requirements_library l
     where l.document_type in (select required_document_types($2::niveau_risque_marche))
     order by l.niveau_min, l.label`,
    [req.params.id, caseRow.niveau_risque_marche]
  );
  res.json({ niveau: caseRow.niveau_risque_marche, required });
}));
