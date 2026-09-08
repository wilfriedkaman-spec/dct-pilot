import PDFDocument from "pdfkit";
import type { Response } from "express";

// Attestation de bonne exécution (E6). Générée uniquement à partir d'une
// clôture réellement enregistrée (reception_closures), elle-même
// impossible sans une décision favorable ou favorable-avec-réserves — la
// route de clôture (reception.ts) ne l'accepte pas autrement. Comme les
// autres documents du dossier, jamais un blob figé : rendue à la volée.

function row(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.font("Helvetica-Bold").fontSize(9).text(label);
  doc.font("Helvetica").fontSize(10).text(value || "—");
  doc.moveDown(0.3);
}

export function renderAttestationBonneExecution(res: Response, data: {
  caseRow: any; company: any; decision: any; closure: any;
  decidedByName: string; reserves: any[];
}) {
  const { caseRow, company, decision, closure, decidedByName, reserves } = data;

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="attestation-bonne-execution-${caseRow.case_number}.pdf"`);
  doc.pipe(res);

  doc.font("Helvetica-Bold").fontSize(9).text("PORT AUTONOME D'ABIDJAN", { align: "right" });
  doc.font("Helvetica").fontSize(9).text("Département Contrôle des Travaux", { align: "right" });
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(15).text("ATTESTATION DE BONNE EXÉCUTION DES TRAVAUX", { align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor("#555")
    .text(`Référence : ATT-${caseRow.case_number}`, { align: "center" });
  doc.fillColor("black").moveDown(1.4);

  doc.font("Helvetica").fontSize(10).text(
    `Le Département Contrôle des Travaux du Port Autonome d'Abidjan atteste que les travaux ci-après ont fait l'objet d'une réception ${decision.decision === "favorable_avec_reserves" ? "favorable, sous réserves" : "favorable"}, conformément au procès-verbal de réception établi le ${new Date(decision.decided_at).toLocaleDateString("fr-FR")}.`,
    { align: "justify" }
  );
  doc.moveDown(1);

  doc.font("Helvetica-Bold").fontSize(11).text("1. Identification du chantier");
  doc.moveDown(0.4);
  row(doc, "Projet / Opération", caseRow.title);
  row(doc, "Objet des travaux", caseRow.nature_travaux);
  row(doc, "Référence du marché / Bon de commande", caseRow.purchase_order_number || caseRow.trigger_document_number);
  row(doc, "Prestataire", company?.name ?? "—");
  doc.moveDown(0.6);

  if (decision.decision === "favorable_avec_reserves") {
    doc.font("Helvetica-Bold").fontSize(11).text("2. État des réserves à la clôture");
    doc.moveDown(0.3);
    const nonLevees = reserves.filter((r) => r.statut !== "levee");
    if (reserves.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor("#888").text("Aucune réserve enregistrée.").fillColor("black");
    } else {
      for (const r of reserves) {
        doc.font("Helvetica").fontSize(10).text(`• ${r.description} — [${r.statut === "levee" ? "levée" : "NON LEVÉE"}]`);
      }
      if (nonLevees.length > 0) {
        doc.moveDown(0.3).font("Helvetica-Bold").fontSize(9).fillColor("#991b1b")
          .text(`Attention : ${nonLevees.length} réserve(s) restaient non levée(s) au moment de la clôture (règle non bloquante actuelle du prototype — à confirmer avec le Département).`)
          .fillColor("black");
      }
    }
    doc.moveDown(0.8);
  }

  doc.font("Helvetica-Bold").fontSize(11).text(decision.decision === "favorable_avec_reserves" ? "3. Clôture du dossier" : "2. Clôture du dossier");
  doc.moveDown(0.3);
  row(doc, "Date de clôture", new Date(closure.closed_at).toLocaleDateString("fr-FR"));
  row(doc, "Transmis à la comptabilité le", closure.transmitted_accounting_at ? new Date(closure.transmitted_accounting_at).toLocaleDateString("fr-FR") : "—");
  doc.moveDown(1);

  doc.font("Helvetica-Bold").fontSize(11).text("Validation");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).text(`Le Département Contrôle Travaux — ${decidedByName}`);
  doc.text(`Date : ${new Date(closure.closed_at).toLocaleDateString("fr-FR")}`);

  doc.end();
}
