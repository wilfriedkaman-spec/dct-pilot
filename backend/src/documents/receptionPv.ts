import PDFDocument from "pdfkit";
import type { Response } from "express";

// Procès-verbal de réception (E3/E5). Comme pour l'autorisation de
// démarrage (Annexe J), rendu à la volée à partir de la DERNIÈRE décision
// réellement enregistrée — jamais recalculé, jamais un blob stocké tel
// quel. Un PV est produit quelle que soit l'issue (favorable, avec
// réserves, défavorable ou impossibilité) : il documente ce qui s'est
// passé lors de la visite, pas seulement un accord.

const DECISION_LABELS: Record<string, string> = {
  favorable: "Favorable",
  favorable_avec_reserves: "Favorable avec réserves",
  defavorable: "Défavorable",
  impossibilite_receptionner: "Impossibilité de réceptionner",
};

const CHECKLIST_LABELS: Record<string, string> = {
  pa_leves: "Points d'arrêt levés",
  nc_critiques_cloturees: "Non-conformités critiques clôturées",
  qhse_fin_chantier: "Situation QHSE de fin de chantier vérifiée",
  documents_fin_chantier: "Documents de fin de chantier disponibles (DOE, garanties, essais)",
  registre_actions_solde: "Registre des actions soldé",
};

function row(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.font("Helvetica-Bold").fontSize(9).text(label);
  doc.font("Helvetica").fontSize(10).text(value || "—");
  doc.moveDown(0.3);
}

export function renderReceptionPv(res: Response, data: {
  caseRow: any; company: any; request: any; checklist: any; decision: any;
  decidedByName: string; reserves: any[];
}) {
  const { caseRow, company, request, checklist, decision, decidedByName, reserves } = data;

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="pv-reception-${caseRow.case_number}.pdf"`);
  doc.pipe(res);

  doc.font("Helvetica-Bold").fontSize(9).text("PORT AUTONOME D'ABIDJAN", { align: "right" });
  doc.font("Helvetica").fontSize(9).text("Département Contrôle des Travaux", { align: "right" });
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(15).text("PROCÈS-VERBAL DE RÉCEPTION DES TRAVAUX", { align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor("#555")
    .text(`Référence : PV-${caseRow.case_number}`, { align: "center" });
  doc.fillColor("black").moveDown(1.2);

  doc.font("Helvetica-Bold").fontSize(11).text("1. Identification du chantier");
  doc.moveDown(0.4);
  row(doc, "Projet / Opération", caseRow.title);
  row(doc, "Objet des travaux", caseRow.nature_travaux);
  row(doc, "Référence du marché / Bon de commande", caseRow.purchase_order_number || caseRow.trigger_document_number);
  row(doc, "Prestataire", company?.name ?? "—");
  row(doc, "Demande de réception du", new Date(request.requested_at).toLocaleDateString("fr-FR"));
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(11).text("2. Vérifications préalables (E1)");
  doc.moveDown(0.3);
  if (checklist) {
    for (const [key, label] of Object.entries(CHECKLIST_LABELS)) {
      doc.font("Helvetica").fontSize(10).text(`[${checklist[key] ? "X" : " "}] ${label} — ${checklist[key] ? "Oui" : "Non"}`);
    }
  } else {
    doc.font("Helvetica").fontSize(10).fillColor("#888").text("Checklist non figée au moment de la décision.");
    doc.fillColor("black");
  }
  doc.moveDown(0.8);

  doc.font("Helvetica-Bold").fontSize(11).text("3. Décision de réception");
  doc.moveDown(0.3);
  const favorable = decision.decision === "favorable" || decision.decision === "favorable_avec_reserves";
  doc.font("Helvetica-Bold").fontSize(10).fillColor(favorable ? "#065f46" : "#991b1b")
    .text(`Décision : ${DECISION_LABELS[decision.decision] ?? decision.decision}`);
  doc.fillColor("black").font("Helvetica").fontSize(9)
    .text(`Décidée par ${decidedByName} le ${new Date(decision.decided_at).toLocaleDateString("fr-FR")}.`);
  doc.moveDown(0.8);

  if (decision.decision === "favorable_avec_reserves") {
    doc.font("Helvetica-Bold").fontSize(11).text("4. Réserves formulées");
    doc.moveDown(0.3);
    if (reserves.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor("#888").text("Aucune réserve enregistrée.");
      doc.fillColor("black");
    } else {
      for (const r of reserves) {
        doc.font("Helvetica").fontSize(10).text(
          `• ${r.description}${r.responsable ? ` — responsable : ${r.responsable}` : ""}${r.delai ? ` — délai : ${new Date(r.delai).toLocaleDateString("fr-FR")}` : ""} [${r.statut === "levee" ? "levée" : "ouverte"}]`
        );
      }
    }
    doc.moveDown(0.8);
  }

  if (!favorable) {
    doc.font("Helvetica-Bold").fontSize(11).text("4. Suite donnée");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9)
      .text("La réception n'est pas accordée sur la base de la présente visite. L'entreprise doit corriger les non-conformités relevées ; une nouvelle demande de réception pourra être formulée en vue d'un avis favorable.");
    doc.moveDown(0.8);
  }

  doc.font("Helvetica-Bold").fontSize(11).text("5. Validation");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).text(`Le Département Contrôle Travaux — ${decidedByName}`);
  doc.text(`Date : ${new Date(decision.decided_at).toLocaleDateString("fr-FR")}`);

  doc.end();
}
