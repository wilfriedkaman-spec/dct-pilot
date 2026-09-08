import type { Request, Response, NextFunction, RequestHandler } from "express";

// Toute règle métier violée (trigger PL/pgSQL) remonte comme une exception
// Postgres avec un message français déjà clair ("Impossible de passer le
// dossier ... sans contrôleur affecté"). On la renvoie telle quelle en 409
// plutôt que de la masquer derrière un message générique — c'est ce message
// que l'interface affichera à l'utilisateur.
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err: any) => {
      // Depuis la migration v8 (RBAC) : assertPermission()/identifyActor
      // lèvent des erreurs avec un code HTTP déjà déterminé (401 non
      // identifié, 403 non autorisé) — on le respecte tel quel plutôt que
      // de le faire retomber dans la classification métier ci-dessous.
      if (err?.status) {
        res.status(err.status).json({ error: err.message || "Erreur inattendue" });
        return;
      }
      const message = err?.message || "Erreur inattendue";
      const isBusinessRule = /^(Impossible|Accès à B3 refusé|Le retrait|Une correction manuelle|NC critique|A3 |A4 |Constat initial A3|Un motif est obligatoire|Un permis ajouté|Check-list de démarrage incomplète|Fiche d'inspection QHSE incomplète|Fiche d'évaluation QHSE incomplète)/.test(message);
    // Le message "Impossible de passer en phase C..." est déjà couvert par
    // le préfixe "Impossible" ci-dessus.
      res.status(isBusinessRule ? 409 : 500).json({ error: message });
    });
  };
}
