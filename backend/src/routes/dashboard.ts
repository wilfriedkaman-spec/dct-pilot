import { Router } from "express";
import { query, queryOne } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", asyncHandler(async (_req, res) => {
  const totals = await queryOne(`
    select
      count(*) filter (where phase in ('A','B','C','D','E') and status <> 'cloture')::int as dossiers_ouverts,
      count(*) filter (where phase = 'B')::int as en_preparation,
      count(*) filter (where phase = 'C')::int as en_execution,
      count(*) filter (where phase = 'E')::int as en_reception
    from cases
  `);
  const ncCritiques = (await queryOne(`select count(*)::int as n from non_conformities where criticite='critique' and statut <> 'cloturee'`))?.n ?? 0;
  const receptionsEnAttente = (await queryOne(`
    select count(*)::int as n from reception_requests r
    where not exists (select 1 from reception_decisions d where d.reception_request_id = r.id)
  `))?.n ?? 0;

  const recentCases = await query(`
    select c.id, c.case_number, c.title, c.phase, c.status, c.niveau_critique_global,
      ctrl.full_name as controller_name
    from cases c left join users ctrl on ctrl.id = c.assigned_controller_id
    order by c.created_at desc limit 10
  `);

  const alertes: any[] = [];
  const permitsManquants = await query(`select case_id, permit_type from permits_effective where manquant_ou_expire limit 5`);
  for (const p of permitsManquants) alertes.push({ type: "permis", detail: `Permis ${p.permit_type} manquant/expiré`, case_id: p.case_id });
  const ncCritiquesList = await query(`select id, case_id, nc_number from non_conformities where criticite='critique' and statut <> 'cloturee' limit 5`);
  for (const n of ncCritiquesList) alertes.push({ type: "nc_critique", detail: `${n.nc_number} — visite de levée requise`, case_id: n.case_id });

  res.json({ ...totals, nc_critiques: ncCritiques, receptions_en_attente: receptionsEnAttente, recent_cases: recentCases, alertes });
}));

// ---- Tableau de bord des indicateurs QHSE (Annexe L) ----
// 8 des 12 indicateurs formels sont calculables à partir des données
// réelles (vue qhse_kpi_dashboard, migration v6) ; les 4 autres n'ont
// aucune donnée source dans ce prototype (Annexe H et K non implémentées,
// aucune notion d'inspection "programmée") — retournés explicitement à
// null avec leur raison plutôt que simulés.
dashboardRouter.get("/qhse-kpi", asyncHandler(async (_req, res) => {
  const v = await queryOne("select * from qhse_kpi_dashboard");
  const pct = (ok: number, total: number) => (total > 0 ? Math.round((ok / total) * 1000) / 10 : null);
  res.json({
    indicateurs: [
      { code: 1, label: "Taux de chantiers ayant signé l'Engagement SST/HSE avant démarrage", valeur: pct(v.engagement_sst_signe_ok, v.engagement_sst_signe_total), unite: "%", objectif: 100 },
      { code: 2, label: "Taux de chantiers ayant réalisé une analyse des risques avant démarrage", valeur: pct(v.analyse_risques_ok, v.analyse_risques_total), unite: "%", objectif: 100 },
      { code: 3, label: "Taux de chantiers ayant fait l'objet d'une check-list de démarrage", valeur: pct(v.checklist_demarrage_ok, v.checklist_demarrage_total), unite: "%", objectif: 100 },
      { code: 4, label: "Nombre d'inspections QHSE réalisées", valeur: v.nb_inspections_realisees, unite: "", objectif: null },
      { code: 5, label: "Nombre d'observations SST / Environnement", valeur: v.nb_observations, unite: "", objectif: null },
      { code: 6, label: "Nombre de non-conformités enregistrées", valeur: v.nb_nc_enregistrees, unite: "", objectif: null },
      { code: 7, label: "Taux de traitement des non-conformités dans les délais", valeur: pct(v.nc_dans_delai, v.nc_total_evaluables), unite: "%", objectif: 95, note: v.nc_total_evaluables === 0 ? "aucune NC clôturée avec échéance à ce jour" : null },
      { code: 8, label: "Nombre d'incidents, accidents et presqu'accidents", valeur: null, unite: "", objectif: null, non_suivi: true, raison: "Fiche de déclaration (Annexe H) non implémentée dans ce prototype" },
      { code: 9, label: "Taux de port des EPI lors des inspections", valeur: pct(v.epi_conformes, v.epi_total), unite: "%", objectif: 98 },
      { code: 10, label: "Taux de conformité des chantiers inspectés", valeur: pct(v.chantiers_conformes, v.chantiers_inspectes), unite: "%", objectif: 90 },
      { code: 11, label: "Note moyenne d'évaluation QHSE des prestataires", valeur: null, unite: "%", objectif: 80, non_suivi: true, raison: "Fiche d'évaluation du prestataire (Annexe K) non implémentée dans ce prototype" },
      { code: 12, label: "Taux de réalisation des inspections programmées", valeur: null, unite: "%", objectif: 100, non_suivi: true, raison: "Aucune notion d'inspection \"programmée\" (planning d'inspections) dans ce prototype" },
    ],
  });
}));
