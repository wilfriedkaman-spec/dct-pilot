import { Router } from "express";
import { query, queryOne, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { requirePermission } from "../auth.js";

export const preparationRouter = Router();

// ---- B1 : Espace Entreprise (personnel) ----
preparationRouter.get("/cases/:id/personnel", asyncHandler(async (req, res) => {
  res.json(await query("select * from case_company_personnel where case_id = $1 order by created_at", [req.params.id]));
}));

preparationRouter.post("/cases/:id/personnel", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into case_company_personnel (case_id, company_id, full_name, function, qualification, habilitation)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [req.params.id, b.company_id, b.full_name, b.function, b.qualification ?? null, b.habilitation ?? null]
  );
  res.status(201).json(row);
}));

preparationRouter.get("/cases/:id/b1-validations", asyncHandler(async (req, res) => {
  res.json(await query("select * from case_b1_validations where case_id = $1 order by version", [req.params.id]));
}));

preparationRouter.post("/cases/:id/b1-validation", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into case_b1_validations (case_id, version, statut, motif, validated_by)
     values ($1, coalesce((select max(version)+1 from case_b1_validations where case_id=$1),1), $2,$3,$4)
     returning *`,
    [req.params.id, b.statut, b.motif ?? null, b.validated_by]
  );
  await logEvent(req.params.id, b.validated_by, "b1_validation", null, row);
  res.status(201).json(row);
}));

// ---- B2 : Engagement QHSE/SST (point d'arrêt absolu) ----
preparationRouter.get("/cases/:id/qhse-engagement", asyncHandler(async (req, res) => {
  res.json(await query("select * from case_qhse_engagements where case_id = $1 order by version desc", [req.params.id]));
}));

preparationRouter.post("/cases/:id/qhse-engagement", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into case_qhse_engagements (case_id, version, document_file_id, signatory_name, signatory_matches_b1, statut, motif, validated_by, validated_at)
     values ($1, coalesce((select max(version)+1 from case_qhse_engagements where case_id=$1),1),
             $2,$3,$4,$5,$6,$7, case when $5::validation_status = 'valide' then now() else null end)
     returning *`,
    [req.params.id, b.document_file_id ?? null, b.signatory_name, b.signatory_matches_b1 ?? false, b.statut, b.motif ?? null, b.validated_by]
  );
  await logEvent(req.params.id, b.validated_by, "b2_engagement_qhse", null, row);
  res.status(201).json(row);
}));

// ---- B3 : Documents préalables (hors PAQ) ----
preparationRouter.get("/cases/:id/prerequisite-documents", asyncHandler(async (req, res) => {
  res.json(await query("select * from case_prerequisite_documents where case_id = $1 order by created_at", [req.params.id]));
}));

preparationRouter.post("/cases/:id/prerequisite-documents", asyncHandler(async (req, res) => {
  const b = req.body;
  // Le point d'arrêt B2 (engagement QHSE) est vérifié par le trigger SQL :
  // une exception ici remonte au client avec le message métier exact.
  const row = await queryOne(
    `insert into case_prerequisite_documents (case_id, document_type, document_file_id, statut, non_applicable, motif, validated_by, validated_at)
     values ($1,$2,$3,$4,$5,$6,$7, case when $4::validation_status is not null then now() else null end)
     returning *`,
    [req.params.id, b.document_type, b.document_file_id ?? null, b.statut ?? null, b.non_applicable ?? false, b.motif ?? null, b.validated_by ?? null]
  );
  await logEvent(req.params.id, b.validated_by ?? null, "b3_document_prealable", null, row);
  res.status(201).json(row);
}));

// ---- B4 : Construction du PAQ ----
preparationRouter.get("/cases/:id/paq-points", asyncHandler(async (req, res) => {
  res.json(await query(`
    select p.*, u.full_name as responsable_name
    from case_paq_control_points p left join users u on u.id = p.responsable_id
    where p.case_id = $1 order by p.corps_metier, p.activite
  `, [req.params.id]));
}));

preparationRouter.post("/cases/:id/paq-points", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into case_paq_control_points
      (case_id, library_ref_id, corps_metier, activite, type, angle, designation, critere_acceptation, methode, frequence,
       responsable_id, is_bloquant, added_manually, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning *`,
    [req.params.id, b.library_ref_id ?? null, b.corps_metier, b.activite, b.type, b.angle, b.designation,
     b.critere_acceptation ?? null, b.methode ?? null, b.frequence ?? null, b.responsable_id ?? null,
     b.is_bloquant ?? (b.type === "PA"), b.library_ref_id ? false : true, b.created_by]
  );
  res.status(201).json(row);
}));

// Import en masse depuis la bibliothèque pour un corps de métier donné
preparationRouter.post("/cases/:id/paq-points/import", asyncHandler(async (req, res) => {
  const { corps_metier, created_by } = req.body;
  const libraryPoints = await query("select * from control_point_library where corps_metier = $1 and is_active", [corps_metier]);
  const inserted = [];
  for (const lp of libraryPoints) {
    const row = await queryOne(
      `insert into case_paq_control_points
        (case_id, library_ref_id, corps_metier, activite, type, angle, designation, critere_acceptation, methode, frequence, is_bloquant, created_by)
       values ($1,$2,$3,$4,$5,'technique',$6,$7,$8,$9,$10,$11)
       returning *`,
      [req.params.id, lp.id, lp.corps_metier, lp.activite, lp.type, lp.designation, lp.critere_acceptation, lp.methode, lp.frequence, lp.type === "PA", created_by]
    );
    inserted.push(row);
  }
  res.status(201).json(inserted);
}));

// Retrait d'un point PAQ (motif obligatoire, vérifié par trigger SQL)
preparationRouter.patch("/paq-points/:pointId/remove", asyncHandler(async (req, res) => {
  const row = await queryOne(
    `update case_paq_control_points set removed = true, removal_motif = $2 where id = $1 returning *`,
    [req.params.pointId, req.body.removal_motif]
  );
  res.json(row);
}));

// ---- B5 : Réunion de prise de contact ----
preparationRouter.post("/cases/:id/kickoff-meeting", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into case_kickoff_meetings (case_id, meeting_date, participants, compte_rendu, created_by)
     values ($1,$2,$3,$4,$5) returning *`,
    [req.params.id, b.meeting_date, b.participants, b.compte_rendu, b.created_by]
  );
  await logEvent(req.params.id, b.created_by, "reunion_prise_de_contact", null, row);
  res.status(201).json(row);
}));

// ---- B6 : Autorisation de démarrage (checklist calculée, aucune ressaisie) ----
// Point d'arrêt absolu, "aucun contournement possible" (référentiel) : la
// checklist est donc recalculée ici, côté serveur, à la fois pour l'affichage
// (GET) et pour la décision réelle (POST) — jamais confiée telle quelle au
// client, qui pourrait renvoyer un "autorise: true" obsolète ou trafiqué.
async function computeStartupChecklist(caseId: string) {
  const qhse = await queryOne("select statut from case_qhse_engagements where case_id=$1 order by version desc limit 1", [caseId]);
  const b1 = await queryOne("select statut from case_b1_validations where case_id=$1 order by version desc limit 1", [caseId]);
  const docs = await query("select statut, non_applicable from case_prerequisite_documents where case_id=$1", [caseId]);
  const docsOk = docs.every((d: any) => d.non_applicable || d.statut === "valide");
  const paqCount = (await queryOne("select count(*)::int as n from case_paq_control_points where case_id=$1 and not removed", [caseId]))?.n ?? 0;
  const meetingHeld = ((await queryOne("select count(*)::int as n from case_kickoff_meetings where case_id=$1", [caseId]))?.n ?? 0) > 0;
  const permitsMissing = (await queryOne("select count(*)::int as n from permits_effective where case_id=$1 and manquant_ou_expire", [caseId]))?.n ?? 0;
  // Annexe J ("Autorisation de démarrage") liste "Fiche d'analyse des
  // risques validée" parmi les exigences préalables — un dossier est
  // considéré comme ayant réalisé son analyse dès qu'au moins un risque
  // a un niveau résiduel évalué (jugement humain, pas seulement saisi).
  const risquesEvalues = (await queryOne(
    "select count(*)::int as n from case_risks where case_id=$1 and niveau_residuel is not null", [caseId]
  ))?.n ?? 0;

  // Annexe B : classification du marché par niveau de risque, décision
  // humaine (voir migration v6) — devient elle-même un critère du point
  // d'arrêt B6, et conditionne les documents complémentaires exigés.
  const caseRow = await queryOne("select niveau_risque_marche from cases where id=$1", [caseId]);
  const niveauDefini = !!caseRow?.niveau_risque_marche;
  let documentsRequisOk = true;
  if (niveauDefini) {
    const required = await query(
      `select l.document_type,
         (select statut from case_prerequisite_documents d
          where d.case_id=$1 and d.document_type=l.document_type order by d.created_at desc limit 1) as statut
       from document_requirements_library l
       where l.document_type in (select required_document_types($2::niveau_risque_marche))`,
      [caseId, caseRow.niveau_risque_marche]
    );
    documentsRequisOk = required.every((r: any) => r.statut === "valide");
  }

  // Annexe E : check-list de démarrage détaillée (29 points) — remplace la
  // tautologie précédente ("réalisée" toujours vraie car le document
  // final l'affirmait).
  const latestDetailedChecklist = await queryOne(
    "select conclusion from case_startup_checklists where case_id=$1 order by created_at desc limit 1", [caseId]
  );

  const checklist = {
    engagement_qhse_valide: qhse?.statut === "valide",
    personnel_valide: b1?.statut === "valide",
    documents_prealables_valides: docs.length > 0 ? docsOk : false,
    paq_construit: paqCount > 0,
    reunion_tenue: meetingHeld,
    permis_requis_obtenus: permitsMissing === 0,
    analyse_risques_realisee: risquesEvalues > 0,
    niveau_risque_marche_defini: niveauDefini,
    documents_requis_niveau_valides: documentsRequisOk,
    checklist_demarrage_detaillee_realisee: latestDetailedChecklist?.conclusion === "conforme" || latestDetailedChecklist?.conclusion === "conforme_sous_reserve",
  };
  const autorise = Object.values(checklist).every(Boolean);
  return { checklist, autorise };
}

preparationRouter.get("/cases/:id/startup-checklist", asyncHandler(async (req, res) => {
  res.json(await computeStartupChecklist(req.params.id));
}));

preparationRouter.get("/cases/:id/startup-authorizations", asyncHandler(async (req, res) => {
  res.json(await query(
    `select a.*, u.full_name as decided_by_name from case_startup_authorizations a
     left join users u on u.id = a.decided_by
     where a.case_id = $1 order by a.decided_at desc`,
    [req.params.id]
  ));
}));

// Migration v8 (RBAC, questions Q2/Q4/Q5) : déclencher la vérification
// d'autorisation de démarrage est réservé au chef de service et au chef de
// département — un contrôleur ne peut plus l'autoriser lui-même (avant
// cette migration, le script de test le faisait par simplification ; voir
// e2e_walkthrough.mjs, corrigé en même temps que cette route). Le résultat
// (autorisé / bloqué) reste calculé par le serveur, jamais par le client.
preparationRouter.post("/cases/:id/startup-authorization", requirePermission("validation_b6", "valider"), asyncHandler(async (req, res) => {
  const { decided_by } = req.body;
  const { checklist, autorise } = await computeStartupChecklist(req.params.id);
  const row = await queryOne(
    `insert into case_startup_authorizations (case_id, checklist_snapshot, statut, decided_by)
     values ($1,$2,$3,$4) returning *`,
    [req.params.id, checklist, autorise ? "autorise" : "bloque", decided_by]
  );
  if (autorise) {
    await query("update cases set phase='C', status='c_en_execution' where id=$1", [req.params.id]);
  }
  await logEvent(req.params.id, decided_by, "autorisation_demarrage", null, row);
  res.status(201).json(row);
}));
