import { Router } from "express";
import { query, queryOne, withTransaction, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { requirePermission } from "../auth.js";

export const incidentsRouter = Router();

// ---- Annexe H — Déclaration d'incident, d'accident ou de presqu'accident ----
// [ARBITRAGE, voir migration v7] Le référentiel ne donne qu'un descriptif
// pour cette fiche, sans liste de champs : le formulaire ci-dessous est une
// proposition documentée. Une déclaration peut, comme pour la fiche
// d'inspection QHSE, donner lieu à une action corrective liée (même
// registre, même transaction atomique) — jamais obligatoire ici (le
// référentiel ne l'exige pas pour un simple presqu'accident), mais
// disponible pour ne pas perdre le retour d'expérience en route.
// Un accident de conséquence "blessure_grave" ou "deces" force le niveau
// de criticité globale du dossier à 'critique' (trigger côté base).

incidentsRouter.get("/cases/:id/incident-declarations", asyncHandler(async (req, res) => {
  const rows = await query(
    `select i.*, u.full_name as declared_by_name from incident_declarations i
     left join users u on u.id = i.declared_by
     where i.case_id = $1 order by i.date_evenement desc, i.created_at desc`,
    [req.params.id]
  );
  for (const r of rows) {
    r.actions_liees = await query(
      "select id, description, statut from actions_register where origine = 'declaration_incident' and source_ref_id = $1",
      [r.id]
    );
  }
  res.json(rows);
}));

// Migration v8 (RBAC, question Q4) : ouvert à tous les rôles de terrain
// (contrôleur, référent SST chantier, chef de service, chef de
// département) — la déclaration d'un accident/incident doit rester
// facilement accessible, pas réservée à un seul rôle.
incidentsRouter.post("/cases/:id/incident-declarations", requirePermission("declaration_incident", "creer"), asyncHandler(async (req, res) => {
  const b = req.body;
  // action_corrective?: { description, responsable, date_limite } — facultatif

  const result = await withTransaction(async (client) => {
    const decl = await client.query(
      `insert into incident_declarations
         (case_id, type_evenement, date_evenement, heure_evenement, lieu, personnes_impliquees,
          description_faits, consequences, arret_travail, nombre_jours_arret, temoins,
          causes_identifiees, mesures_immediates, declared_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [req.params.id, b.type_evenement, b.date_evenement, b.heure_evenement ?? null, b.lieu ?? null,
       b.personnes_impliquees ?? null, b.description_faits, b.consequences ?? "aucune",
       b.arret_travail ?? false, b.nombre_jours_arret ?? null, b.temoins ?? null,
       b.causes_identifiees ?? null, b.mesures_immediates ?? null, b.declared_by ?? null]
    );
    const declaration = decl.rows[0];
    let createdAction = null;
    if (b.action_corrective) {
      const a = b.action_corrective;
      const action = await client.query(
        `insert into actions_register (case_id, origine, source_ref_id, description, responsable, date_limite, created_by)
         values ($1,'declaration_incident',$2,$3,$4,$5,$6) returning *`,
        [req.params.id, declaration.id, a.description || declaration.description_faits, a.responsable ?? null, a.date_limite ?? null, b.declared_by ?? null]
      );
      createdAction = action.rows[0];
    }
    return { declaration, createdAction };
  });

  await logEvent(req.params.id, b.declared_by ?? null, "declaration_" + b.type_evenement, null, result.declaration);
  res.status(201).json(result);
}));

// ---- Annexe I — Matrice EPI par activité (référence, lecture seule) ----
incidentsRouter.get("/epi-matrix", asyncHandler(async (_req, res) => {
  res.json(await query("select * from epi_matrix_library order by ordre"));
}));
