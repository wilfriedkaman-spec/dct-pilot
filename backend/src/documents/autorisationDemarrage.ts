import PDFDocument from "pdfkit";
import type { Response } from "express";

// Génère le document "Autorisation de démarrage des travaux" (Annexe J du
// référentiel QHSE du prestataire). Rendu à partir de la DERNIÈRE décision
// enregistrée (case_startup_authorizations) — jamais recalculé à la volée :
// le document doit refléter la décision réellement prise et tracée, pas un
// état courant qui pourrait avoir changé depuis.
//
// [ARBITRAGE] L'Annexe J liste 10 exigences préalables. Cinq ont un
// équivalent réel dans l'application (engagement QHSE, analyse des
// risques, personnel désigné, permis, et la check-list elle-même) ; les
// cinq autres (EPI/EPC, secours, balisage, mesures environnementales,
// coactivité) ne sont pas suivies dans ce prototype et sont marquées
// "N/A — non suivi" plutôt que de fabriquer une réponse. Les critères
// réellement utilisés par l'application pour bloquer ou autoriser
// (documents préalables B3, PAQ construit, réunion de prise de contact)
// ne figurent pas sur la liste-type de l'Annexe J : ils sont ajoutés dans
// un bloc complémentaire, par souci de traçabilité complète de la
// décision plutôt que de les passer sous silence.

const CHECKLIST_LABELS: Record<string, string> = {
  engagement_qhse_valide: "Engagement SST/HSE signé",
  analyse_risques_realisee: "Fiche d'analyse des risques validée",
  personnel_valide: "Personnel d'encadrement désigné",
  permis_requis_obtenus: "Autorisations et permis requis obtenus (le cas échéant)",
  // Depuis la migration v6, "check-list de démarrage réalisée" n'est plus
  // une tautologie : elle reflète la vraie check-list détaillée (Annexe E,
  // 29 points), conclue conforme ou conforme sous réserve.
  checklist_demarrage_detaillee_realisee: "Check-list de démarrage réalisée (Annexe E)",
};

const NA_ITEMS = [
  "EPI et EPC disponibles",
  "Moyens de premiers secours disponibles",
  "Balisage et signalisation prévus",
  "Mesures environnementales définies",
  "Mesures de prévention de la coactivité définies (le cas échéant)",
];

const SUPPLEMENTARY_LABELS: Record<string, string> = {
  documents_prealables_valides: "Documents préalables (B3) validés",
  paq_construit: "Plan d'assurance qualité (PAQ) construit",
  reunion_tenue: "Réunion de prise de contact (B5) tenue",
  niveau_risque_marche_defini: "Niveau de risque du marché classifié (Annexe B)",
  documents_requis_niveau_valides: "Documents complémentaires requis pour ce niveau validés",
};

function row(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.font("Helvetica-Bold").fontSize(9).text(label, { continued: false });
  doc.font("Helvetica").fontSize(10).text(value || "—");
  doc.moveDown(0.3);
}

export function renderAutorisationDemarrage(res: Response, data: {
  caseRow: any;
  company: any;
  authorization: any; // case_startup_authorizations row
  decidedByName: string;
  demarrageReel: string | null;
}) {
  const { caseRow, company, authorization, decidedByName, demarrageReel } = data;
  const checklist: Record<string, boolean> = authorization.checklist_snapshot;

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="autorisation-demarrage-${caseRow.case_number}.pdf"`);
  doc.pipe(res);

  doc.font("Helvetica-Bold").fontSize(9).text("PORT AUTONOME D'ABIDJAN", { align: "right" });
  doc.font("Helvetica").fontSize(9).text("Département Contrôle des Travaux", { align: "right" });
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(15).text("AUTORISATION DE DÉMARRAGE DES TRAVAUX", { align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor("#555")
    .text(`Référence : ADT-${caseRow.case_number}`, { align: "center" });
  doc.fillColor("black").moveDown(1.2);

  doc.font("Helvetica-Bold").fontSize(11).text("1. Identification du chantier");
  doc.moveDown(0.4);
  row(doc, "Projet / Opération", caseRow.title);
  row(doc, "Objet des travaux", caseRow.nature_travaux);
  row(doc, "Référence du marché / Bon de commande", caseRow.purchase_order_number || caseRow.trigger_document_number);
  row(doc, "Prestataire", company?.name ?? "—");
  row(doc, "Service demandeur", caseRow.requesting_service);
  row(doc, "Date prévisionnelle de démarrage", demarrageReel ? new Date(demarrageReel).toLocaleDateString("fr-FR") : "à arrêter en réunion de lancement");
  row(doc, "Durée prévisionnelle des travaux", caseRow.date_fin_prevue ? `jusqu'au ${new Date(caseRow.date_fin_prevue).toLocaleDateString("fr-FR")}` : "non renseignée");
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(11).text("2. Vérification des exigences préalables");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(9).fillColor("#555")
    .text("Exigences de la liste-type du référentiel QHSE du prestataire, vérifiées à partir des données du dossier :");
  doc.fillColor("black").moveDown(0.3);
  for (const [key, label] of Object.entries(CHECKLIST_LABELS)) {
    doc.font("Helvetica").fontSize(10).text(`[${checklist[key] ? "X" : " "}] ${label} — ${checklist[key] ? "Oui" : "Non"}`);
  }
  for (const label of NA_ITEMS) {
    doc.font("Helvetica").fontSize(10).fillColor("#888").text(`[ ] ${label} — N/A (non suivi dans ce prototype)`);
  }
  doc.fillColor("black").moveDown(0.5);

  doc.font("Helvetica-Bold").fontSize(9).text("Éléments complémentaires vérifiés par l'application (hors liste-type de l'Annexe J) :");
  for (const [key, label] of Object.entries(SUPPLEMENTARY_LABELS)) {
    if (key in checklist) {
      doc.font("Helvetica").fontSize(9).text(`[${checklist[key] ? "X" : " "}] ${label} — ${checklist[key] ? "Oui" : "Non"}`);
    }
  }
  doc.moveDown(0.8);

  doc.font("Helvetica-Bold").fontSize(11).text("3. Décision");
  doc.moveDown(0.3);
  if (authorization.statut === "autorise") {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#065f46")
      .text(`Les travaux sont autorisés à démarrer à compter du ${demarrageReel ? new Date(demarrageReel).toLocaleDateString("fr-FR") : "(date à confirmer)"}.`);
  } else {
    const motifs = Object.entries(checklist).filter(([, ok]) => !ok).map(([key]) => CHECKLIST_LABELS[key] ?? key);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#991b1b").text("Les travaux ne sont pas autorisés.");
    doc.font("Helvetica").fontSize(9).fillColor("black").text(`Motifs du refus : ${motifs.join(" ; ")}`);
  }
  doc.fillColor("black").moveDown(0.8);

  doc.font("Helvetica-Bold").fontSize(11).text("4. Conditions particulières");
  doc.font("Helvetica").fontSize(9).moveDown(0.2).list([
    "Respecter les exigences du Référentiel QHSE du Prestataire et les clauses du marché.",
    "Maintenir les conditions ayant permis la délivrance de la présente autorisation pendant toute la durée des travaux.",
    "Informer immédiatement le Département Suivi et Contrôle des Travaux de toute modification susceptible d'avoir une incidence sur la sécurité, la santé, l'environnement, la qualité ou les conditions d'exécution des travaux.",
    "Se conformer aux observations et prescriptions formulées lors des inspections de chantier.",
  ]);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).fillColor("#555")
    .text("La présente autorisation peut être suspendue ou retirée à tout moment en cas de non-respect des exigences applicables, de survenance d'un danger grave et imminent ou de modification significative des conditions d'exécution.");
  doc.fillColor("black").moveDown(1);

  doc.font("Helvetica-Bold").fontSize(11).text("5. Validation");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).text(`Le Département Contrôle Travaux — ${decidedByName}`);
  doc.text(`Date de la décision : ${new Date(authorization.decided_at).toLocaleDateString("fr-FR")}`);

  doc.end();
}
