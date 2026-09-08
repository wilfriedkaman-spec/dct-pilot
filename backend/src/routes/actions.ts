import { Router } from "express";
import { query, queryOne, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const actionsRouter = Router();

actionsRouter.get("/cases/:id/actions-register", asyncHandler(async (req, res) => {
  res.json(await query("select * from actions_register where case_id = $1 order by created_at desc", [req.params.id]));
}));

actionsRouter.post("/cases/:id/actions-register", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into actions_register (case_id, origine, source_ref_id, description, responsable, date_limite, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [req.params.id, b.origine ?? "autre", b.source_ref_id ?? null, b.description, b.responsable ?? null, b.date_limite ?? null, b.created_by]
  );
  res.status(201).json(row);
}));

actionsRouter.patch("/actions-register/:actionId", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `update actions_register set
       statut = coalesce($2, statut),
       motif_annulation = coalesce($3, motif_annulation),
       date_cloture_reelle = case when $2 = 'termine' then current_date else date_cloture_reelle end
     where id = $1 returning *`,
    [req.params.actionId, b.statut ?? null, b.motif_annulation ?? null]
  );
  res.json(row);
}));

// Module Permis et autorisations. Les permis détectés automatiquement
// (import d'un corps de métier en B4, cf. trigger trg_paq_import_detect_permits)
// apparaissent ici au même titre que les permis ajoutés à la main — l'écran
// ne fait aucune distinction fonctionnelle, seul `auto_detected` trace l'origine.
actionsRouter.get("/cases/:id/permits", asyncHandler(async (req, res) => {
  res.json(await query("select * from permits where case_id = $1 order by created_at desc", [req.params.id]));
}));

// Table de correspondance corps de métier → permis (indicative, lecture
// seule depuis l'écran — modifiable en base à mesure que la bibliothèque de
// contrôles s'étoffe).
actionsRouter.get("/permit-detection-rules", asyncHandler(async (req, res) => {
  res.json(await query("select * from permit_detection_rules order by corps_metier, permit_type"));
}));

// Ajout manuel (hors détection automatique). Si le dossier est déjà en
// exécution (C) ou au-delà, le trigger DB exige linked_event_id — jamais un
// permis ajouté sans origine tracée.
actionsRouter.post("/cases/:id/permits", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into permits (case_id, permit_type, required_reason, issuer_domain, issuer_name, permit_number, issue_date, expiry_date, statut, linked_event_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [req.params.id, b.permit_type, b.required_reason ?? null, b.issuer_domain ?? null, b.issuer_name ?? null,
     b.permit_number ?? null, b.issue_date ?? null, b.expiry_date ?? null, b.statut ?? "requis", b.linked_event_id ?? null]
  );
  await logEvent(req.params.id, b.created_by ?? null, "permis_ajoute_manuellement", null, row);
  res.status(201).json(row);
}));

actionsRouter.patch("/permits/:permitId", asyncHandler(async (req, res) => {
  const b = req.body;
  const before = await queryOne("select * from permits where id = $1", [req.params.permitId]);
  const row = await queryOne(
    `update permits set statut = coalesce($2, statut), permit_number = coalesce($3, permit_number),
       issue_date = coalesce($4, issue_date), expiry_date = coalesce($5, expiry_date),
       issuer_name = coalesce($6, issuer_name), correction_motif = coalesce($7, correction_motif)
     where id = $1 returning *`,
    [req.params.permitId, b.statut ?? null, b.permit_number ?? null, b.issue_date ?? null, b.expiry_date ?? null,
     b.issuer_name ?? null, b.correction_motif ?? null]
  );
  await logEvent(before?.case_id ?? null, b.updated_by ?? null, "permis_maj", before, row);
  res.json(row);
}));
