import { Router } from "express";
import { pool, query, queryOne, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { requirePermission } from "../auth.js";

export const casesRouter = Router();

const CASE_LIST_SELECT = `
  select c.*,
    comp.name as company_name,
    ctrl.full_name as controller_name,
    qhse.full_name as qhse_referent_name,
    resp.full_name as responsible_dct_name
  from cases c
  left join companies comp on comp.id = c.company_id
  left join users ctrl on ctrl.id = c.assigned_controller_id
  left join users qhse on qhse.id = c.assigned_qhse_referent_id
  left join users resp on resp.id = c.responsible_dct_id
`;

// GET /api/cases — liste (tableau de bord / liste des dossiers)
casesRouter.get("/", asyncHandler(async (req, res) => {
  const { phase, status } = req.query;
  const clauses: string[] = [];
  const params: any[] = [];
  if (phase) { params.push(phase); clauses.push(`c.phase = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`c.status = $${params.length}`); }
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  res.json(await query(`${CASE_LIST_SELECT} ${where} order by c.created_at desc`, params));
}));

// GET /api/cases/:id — fiche dossier complète
casesRouter.get("/:id", asyncHandler(async (req, res) => {
  const c = await queryOne(`${CASE_LIST_SELECT} where c.id = $1`, [req.params.id]);
  if (!c) return res.status(404).json({ error: "Dossier introuvable" });

  const keyDates = await query("select * from case_key_dates where case_id = $1", [req.params.id]);
  const criticality = await query("select * from case_criticality_scores where case_id = $1 order by stage, famille", [req.params.id]);
  const initialAssessments = await query("select * from case_initial_assessments where case_id = $1 order by created_at desc", [req.params.id]);
  const preCloseChecks = await queryOne("select * from case_pre_closure_checks where case_id = $1 order by updated_at desc limit 1", [req.params.id]);

  res.json({ ...c, key_dates: keyDates, criticality_scores: criticality, initial_assessments: initialAssessments, pre_closure_checks: preCloseChecks });
}));

// POST /api/cases — A1 : saisie factuelle par le secrétariat
// Migration v8 (RBAC, question Q6) : la création d'un dossier n'est plus
// ouverte à quiconque envoie une requête — réservée aux rôles secrétariat,
// chef de service et chef de département (voir role_permissions).
casesRouter.post("/", requirePermission("dossier", "creer"), asyncHandler(async (req, res) => {
  const {
    title, nature_travaux, requesting_service, case_type,
    trigger_document_type, trigger_document_number, trigger_document_date,
    purchase_order_number, amount, company_id, registered_by,
  } = req.body;

  const row = await queryOne(
    `insert into cases (title, nature_travaux, requesting_service, case_type,
       trigger_document_type, trigger_document_number, trigger_document_date,
       purchase_order_number, amount, company_id, registered_by, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'a1_en_enregistrement')
     returning *`,
    [title, nature_travaux, requesting_service, case_type,
     trigger_document_type, trigger_document_number, trigger_document_date,
     purchase_order_number ?? null, amount ?? null, company_id ?? null, registered_by]
  );
  await logEvent(row!.id, registered_by, "dossier_recu", null, { title, case_type });
  res.status(201).json(row);
}));

// PATCH /api/cases/:id/qualification — A2 : qualification par le Responsable DCT
casesRouter.patch("/:id/qualification", asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const {
      responsible_dct_id, assigned_controller_id, assigned_qhse_referent_id,
      origine_besoin, situation_administrative,
      etat_prise_en_charge, etat_prise_en_charge_source, etat_prise_en_charge_justification,
      status, criticite_provisoire, criticality_scores, // criticality_scores: [{famille, score, justification}]
    } = req.body;

    const before = (await client.query("select * from cases where id = $1", [req.params.id])).rows[0];

    // A2 ouvre le dossier et s'arrête là (statut "a2_ouvert", phase A
    // inchangée) : le routage vers B ou vers A3 se décide ensuite, une fois
    // l'état à la prise en charge connu (déduit des dates clés) — voir
    // POST /:id/a2-confirm-routing.
    const updated = (await client.query(
      `update cases set
         responsible_dct_id = coalesce($2, responsible_dct_id),
         assigned_controller_id = coalesce($3, assigned_controller_id),
         assigned_qhse_referent_id = coalesce($4, assigned_qhse_referent_id),
         origine_besoin = coalesce($5, origine_besoin),
         situation_administrative = coalesce($6, situation_administrative),
         etat_prise_en_charge = coalesce($7, etat_prise_en_charge),
         etat_prise_en_charge_source = coalesce($8, etat_prise_en_charge_source),
         etat_prise_en_charge_justification = coalesce($9, etat_prise_en_charge_justification),
         status = coalesce($10, status),
         criticite_provisoire = coalesce($11, criticite_provisoire),
         updated_at = now()
       where id = $1
       returning *`,
      [req.params.id, responsible_dct_id, assigned_controller_id, assigned_qhse_referent_id,
       origine_besoin, situation_administrative, etat_prise_en_charge,
       etat_prise_en_charge_source, etat_prise_en_charge_justification, status, criticite_provisoire]
    )).rows[0];

    if (Array.isArray(criticality_scores)) {
      for (const s of criticality_scores) {
        await client.query(
          `insert into case_criticality_scores (case_id, stage, famille, score, justification)
           values ($1, 'provisoire', $2, $3, $4)`,
          [req.params.id, s.famille, s.score, s.justification ?? null]
        );
      }
    }

    await client.query("commit");
    await logEvent(req.params.id, responsible_dct_id ?? null, "qualification_a2", before, updated);
    res.json(updated);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}));

// PUT /api/cases/:id/key-dates — les 7 dates clés (upsert), dont
// "fin_travaux_constatee" (décision d'arbitrage : signal du "terminé" A2)
casesRouter.put("/:id/key-dates", asyncHandler(async (req, res) => {
  const { dates, updated_by } = req.body as { dates: { date_type: string; date_value: string | null; is_verbal?: boolean }[]; updated_by: string };
  for (const d of dates) {
    await query(
      `insert into case_key_dates (case_id, date_type, date_value, is_verbal, updated_by)
       values ($1,$2,$3,$4,$5)
       on conflict (case_id, date_type)
       do update set date_value = excluded.date_value, is_verbal = excluded.is_verbal,
                      updated_by = excluded.updated_by, updated_at = now()`,
      [req.params.id, d.date_type, d.date_value, d.is_verbal ?? false, updated_by]
    );
  }
  await logEvent(req.params.id, updated_by, "dates_cles_mises_a_jour", null, { dates });
  const refreshed = await queryOne("select * from cases where id = $1", [req.params.id]);
  res.json(refreshed);
}));

// PATCH /api/cases/:id/planning — suivi retard/avancement (décision
// d'arbitrage : facteurs du niveau critique global). Valeur courante
// seulement, mise à jour au fil de l'exécution (pas d'historique dédié,
// le journal des événements trace déjà chaque changement).
casesRouter.patch("/:id/planning", asyncHandler(async (req, res) => {
  const { date_fin_prevue, avancement_pourcentage, updated_by } = req.body;
  const before = await queryOne("select date_fin_prevue, avancement_pourcentage from cases where id = $1", [req.params.id]);
  const updated = await queryOne(
    `update cases set date_fin_prevue = $2, avancement_pourcentage = $3, updated_at = now()
     where id = $1 returning *`,
    [req.params.id, date_fin_prevue ?? null, avancement_pourcentage ?? null]
  );
  await logEvent(req.params.id, updated_by ?? null, "suivi_planning_maj", before, { date_fin_prevue, avancement_pourcentage });
  res.json(updated);
}));

// POST /api/cases/:id/a2-confirm-routing — bascule le dossier "a2_ouvert"
// vers B (préparation) ou vers A3 (constat initial), selon l'état à la
// prise en charge (déduit des dates clés) et la situation administrative
// — exactement la règle du référentiel : "Si état ≠ Non démarré, ou
// situation = Régularisation → A3 devient obligatoire."
casesRouter.post("/:id/a2-confirm-routing", asyncHandler(async (req, res) => {
  const before = await queryOne("select * from cases where id = $1", [req.params.id]);
  if (!before) return res.status(404).json({ error: "Dossier introuvable" });

  const a3Required = before.etat_prise_en_charge === "en_cours"
    || before.etat_prise_en_charge === "termine"
    || before.situation_administrative === "regularisation_a_posteriori";

  const nextStatus = a3Required ? "a3_constat_en_cours" : "b_en_preparation";
  const nextPhase = a3Required ? "A" : "B";

  const updated = await queryOne(
    "update cases set status=$2, phase=$3, updated_at=now() where id=$1 returning *",
    [req.params.id, nextStatus, nextPhase]
  );
  await logEvent(req.params.id, req.body.updated_by ?? null, "routage_apres_a2", before, updated);
  res.json({ ...updated, a3_required: a3Required });
}));

// POST /api/cases/:id/initial-assessment — A3 : le contrôleur fige le
// constat initial. La partie exécutée reçoit une conclusion (4 issues,
// tracée telle quelle) ; la partie restante détermine la suite : si elle
// existe, le dossier avance en B (préparation) pour cette partie restante ;
// sinon, il passe en A4 (vérifications avant clôture) — jamais de clôture
// directe depuis A3.
casesRouter.post("/:id/initial-assessment", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into case_initial_assessments
      (case_id, assessed_by, avancement_estime, travaux_realises, travaux_en_cours, travaux_restants,
       documents_disponibles, anomalies_visibles, controles_impossibles, conclusion_partie_executee, partie_restante_existe)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
    [req.params.id, b.assessed_by, b.avancement_estime ?? null, b.travaux_realises ?? null, b.travaux_en_cours ?? null,
     b.travaux_restants ?? null, b.documents_disponibles ?? [], b.anomalies_visibles ?? null,
     b.controles_impossibles ?? "", b.conclusion_partie_executee ?? null, b.partie_restante_existe]
  );

  const nextStatus = b.partie_restante_existe ? "b_en_preparation" : "a4_verifications_en_cours";
  const nextPhase = b.partie_restante_existe ? "B" : "A";
  await query("update cases set status=$2, phase=$3, updated_at=now() where id=$1", [req.params.id, nextStatus, nextPhase]);

  await logEvent(req.params.id, b.assessed_by, "constat_initial_a3", null, row);
  res.status(201).json(row);
}));

// PUT /api/cases/:id/pre-closure-checks — A4 : vérifications avant clôture
// (DOE, garanties, essais, conformité apparente, anomalies A3 levées,
// validation QHSE finale). Le statut ("en_cours" / "solde") est recalculé
// automatiquement en base — jamais déclaré à la main. Une fois soldé, le
// dossier est prêt pour la réception (E), qui reste toujours déclenchée
// par une demande du prestataire, jamais automatiquement.
casesRouter.put("/:id/pre-closure-checks", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into case_pre_closure_checks
       (case_id, doe_disponible, documents_garantie, essais_disponibles, conformite_apparente, anomalies_a3_levees, validation_qhse_finale)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (case_id) do update set
       doe_disponible = excluded.doe_disponible,
       documents_garantie = excluded.documents_garantie,
       essais_disponibles = excluded.essais_disponibles,
       conformite_apparente = excluded.conformite_apparente,
       anomalies_a3_levees = excluded.anomalies_a3_levees,
       validation_qhse_finale = excluded.validation_qhse_finale
     returning *`,
    [req.params.id, !!b.doe_disponible, !!b.documents_garantie, !!b.essais_disponibles,
     !!b.conformite_apparente, !!b.anomalies_a3_levees, !!b.validation_qhse_finale]
  );

  if (row!.statut === "solde") {
    await query("update cases set status='a4_verifications_soldees', updated_at=now() where id=$1", [req.params.id]);
  }

  await logEvent(req.params.id, b.updated_by ?? null, "verifications_avant_cloture_a4", null, row);
  res.json(row);
}));

// GET /api/cases/:id/event-log — journal (lecture seule, append-only côté DB)
casesRouter.get("/:id/event-log", asyncHandler(async (req, res) => {
  res.json(await query(`
    select e.*, u.full_name as actor_name
    from event_log e left join users u on u.id = e.actor_id
    where e.case_id = $1 order by e.created_at desc
  `, [req.params.id]));
}));
