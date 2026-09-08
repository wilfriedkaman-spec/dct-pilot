import { Router } from "express";
import { query } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const referenceRouter = Router();

referenceRouter.get("/roles", asyncHandler(async (_req, res) => {
  res.json(await query("select * from roles order by code"));
}));

// [ARBITRAGE, migration v8] Par défaut, ne renvoie que les comptes actifs —
// utilisé par les écrans métier (ex. affecter un contrôleur) qui n'ont pas
// à proposer un compte désactivé. La page d'administration, elle, a besoin
// de voir aussi les comptes désactivés pour pouvoir les réactiver — d'où
// le paramètre ?all=true réservé à cet usage. Depuis la migration v9,
// cette route exige une session valide comme toutes les autres (plus de
// sélecteur libre "connecté en tant que").
referenceRouter.get("/users", asyncHandler(async (req, res) => {
  const includeInactive = req.query.all === "true";
  res.json(await query(`
    select u.id, u.full_name, u.role_code, u.is_active, u.login, u.must_change_password, r.label as role_label
    from users u join roles r on r.code = u.role_code
    ${includeInactive ? "" : "where u.is_active"}
    order by u.full_name
  `));
}));

referenceRouter.get("/services", asyncHandler(async (_req, res) => {
  res.json(await query(`
    select s.*,
      (select json_agg(json_build_object('user_id', sa.user_id, 'full_name', u.full_name,
                                          'role_code', sa.role_code, 'chef_status', sa.chef_status))
       from service_assignments sa join users u on u.id = sa.user_id
       where sa.service_id = s.id) as assignments
    from services s order by s.label
  `));
}));

referenceRouter.get("/companies", asyncHandler(async (_req, res) => {
  res.json(await query("select * from companies order by name"));
}));

referenceRouter.get("/control-point-library", asyncHandler(async (_req, res) => {
  res.json(await query("select * from control_point_library where is_active order by corps_metier, activite"));
}));

referenceRouter.get("/risk-library", asyncHandler(async (_req, res) => {
  res.json(await query("select * from risk_library order by category, label"));
}));

// Migration v8 (RBAC) — la matrice de droits du rôle actuellement
// sélectionné, utilisée par le frontend pour afficher/masquer les actions
// plutôt que de laisser un bouton mener à un refus serveur systématique.
// Ne remplace pas l'application réelle des droits côté serveur (auth.ts) :
// un masquage côté écran seul serait cosmétique, pas opposable.
referenceRouter.get("/me/permissions", asyncHandler(async (req, res) => {
  const actor = req.actingUser;
  if (!actor) { res.json({ role_code: null, role_label: null, permissions: [] }); return; }
  const rows = await query(
    "select resource, action from role_permissions where role_code = $1 and allowed = true",
    [actor.role_code]
  );
  res.json({ role_code: actor.role_code, role_label: actor.role_label, permissions: rows });
}));
