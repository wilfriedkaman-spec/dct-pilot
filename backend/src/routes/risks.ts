import { Router } from "express";
import { query, queryOne, logEvent } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const risksRouter = Router();

const NIVEAU_VALUES = ["faible", "modere", "eleve", "critique"];

// ---- B3bis : Analyse des risques du chantier (matrice SST) ----
// Fiche d'analyse des risques (Annexe D du référentiel QHSE) + méthode
// Probabilité×Gravité (§7.2/7.3). niveau_initial n'est jamais accepté du
// client : il est recalculé côté base par un trigger (compute_niveau_
// initial_risque, migration v5), jamais confié à l'entrée utilisateur.

risksRouter.get("/cases/:id/risks", asyncHandler(async (req, res) => {
  res.json(await query(
    `select r.*, l.label as risk_library_label, l.category as risk_library_category
     from case_risks r left join risk_library l on l.id = r.risk_library_id
     where r.case_id = $1 order by r.created_at`,
    [req.params.id]
  ));
}));

risksRouter.post("/cases/:id/risks", asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await queryOne(
    `insert into case_risks
       (case_id, risk_library_id, activite, situation, danger, risque, personnes_exposees,
        probabilite, gravite, mesures_existantes, mesures_complementaires, responsable, echeance)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning *`,
    [req.params.id, b.risk_library_id ?? null, b.activite ?? null, b.situation ?? null, b.danger ?? null,
     b.risque ?? null, b.personnes_exposees ?? null, b.probabilite ?? null, b.gravite ?? null,
     b.mesures_existantes ?? null, b.mesures_complementaires ?? null, b.responsable ?? null, b.echeance ?? null]
  );
  await logEvent(req.params.id, b.created_by ?? null, "risque_ajoute", null, row);
  res.status(201).json(row);
}));

// Mise à jour, y compris l'évaluation du niveau résiduel (jugement humain
// après mise en œuvre des mesures complémentaires — voir commentaire de
// la migration v5 : le référentiel ne fournit pas de seconde paire
// probabilité/gravité "après mesures").
risksRouter.patch("/cases/:id/risks/:riskId", asyncHandler(async (req, res) => {
  const b = req.body;
  if (b.niveau_residuel !== undefined && b.niveau_residuel !== null && !NIVEAU_VALUES.includes(b.niveau_residuel)) {
    return res.status(400).json({ error: `niveau_residuel doit être l'une des valeurs : ${NIVEAU_VALUES.join(", ")}` });
  }
  const before = await queryOne("select * from case_risks where id = $1 and case_id = $2", [req.params.riskId, req.params.id]);
  if (!before) return res.status(404).json({ error: "Risque introuvable" });

  const merged = { ...before, ...b };
  const row = await queryOne(
    `update case_risks set
       activite=$3, situation=$4, danger=$5, risque=$6, personnes_exposees=$7,
       probabilite=$8, gravite=$9, mesures_existantes=$10, mesures_complementaires=$11,
       responsable=$12, echeance=$13, niveau_residuel=$14, statut=$15
     where id=$1 and case_id=$2
     returning *`,
    [req.params.riskId, req.params.id, merged.activite, merged.situation, merged.danger, merged.risque,
     merged.personnes_exposees, merged.probabilite, merged.gravite, merged.mesures_existantes,
     merged.mesures_complementaires, merged.responsable, merged.echeance, merged.niveau_residuel, merged.statut]
  );
  await logEvent(req.params.id, b.updated_by ?? null, "risque_maj", before, row);
  res.json(row);
}));
