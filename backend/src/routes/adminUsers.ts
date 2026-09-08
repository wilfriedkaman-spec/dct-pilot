import { Router } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../asyncHandler.js";
import { query, queryOne, logEvent } from "../db.js";
import { requirePermission, generateTempPassword } from "../auth.js";

// Gestion technique des comptes (migration v8, priorité 1 — rôles et
// permissions, question Q7 ; migration v9 — vraie authentification).
// Réservée au rôle "administrateur" : voir role_permissions, ressource
// "utilisateur". La liste des rôles pour alimenter le formulaire de
// création est déjà exposée en lecture libre via GET /api/roles
// (routes/reference.ts) — pas de doublon ici.

export const adminUsersRouter = Router();

const LOGIN_PATTERN = /^[a-z0-9._-]{3,40}$/;

// [ARBITRAGE — migration v9, décision explicite du Chef de Département]
// Aucun mot de passe fictif : un mot de passe temporaire est généré ici
// (jamais choisi par l'administrateur, jamais stocké en clair), renvoyé
// UNE SEULE FOIS dans la réponse HTTP pour être communiqué à la personne
// concernée hors de l'application, avec changement obligatoire imposé dès
// la première connexion (must_change_password). Ce mécanisme suppose une
// communication hors bande (remise en main propre, téléphone...) — un
// lien d'initialisation par email serait préférable mais suppose un
// service de messagerie, absent de cet environnement (voir rapport
// d'audit).
adminUsersRouter.post(
  "/admin/users",
  requirePermission("utilisateur", "creer"),
  asyncHandler(async (req, res) => {
    const { full_name, role_code, login } = req.body;
    if (!full_name || !role_code || !login) {
      const e: any = new Error("Le nom complet, l'identifiant de connexion et le rôle sont obligatoires.");
      e.status = 400;
      throw e;
    }
    if (!LOGIN_PATTERN.test(login)) {
      const e: any = new Error("L'identifiant de connexion doit comporter 3 à 40 caractères (lettres minuscules, chiffres, points, tirets).");
      e.status = 400;
      throw e;
    }
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const row = await queryOne<any>(
      `insert into users (id, full_name, role_code, login, password_hash, must_change_password)
       values (gen_random_uuid(), $1, $2, $3, $4, true)
       returning id, full_name, role_code, login, is_active, must_change_password, created_at`,
      [full_name, role_code, login, passwordHash]
    );
    // Jamais le hash ni le mot de passe temporaire dans le journal d'audit.
    await logEvent(null, req.actingUser!.id, "utilisateur_cree", null, { id: row!.id, full_name, role_code, login });
    res.status(201).json({ ...row, temporary_password: tempPassword });
  })
);

adminUsersRouter.patch(
  "/admin/users/:id",
  requirePermission("utilisateur", "modifier"),
  asyncHandler(async (req, res) => {
    const before = await queryOne<any>(
      "select id, full_name, role_code, is_active from users where id = $1",
      [req.params.id]
    );
    if (!before) {
      const e: any = new Error("Utilisateur introuvable.");
      e.status = 404;
      throw e;
    }
    const full_name = req.body.full_name ?? before.full_name;
    const role_code = req.body.role_code ?? before.role_code;
    const is_active = typeof req.body.is_active === "boolean" ? req.body.is_active : before.is_active;
    const row = await queryOne(
      `update users set full_name = $1, role_code = $2, is_active = $3 where id = $4
       returning id, full_name, role_code, login, is_active, must_change_password, created_at`,
      [full_name, role_code, is_active, req.params.id]
    );
    // Désactiver un compte doit couper immédiatement tout accès déjà
    // ouvert — sinon une session existante resterait valide jusqu'à ses 8h
    // d'expiration malgré la désactivation.
    if (is_active === false) {
      await query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [req.params.id]);
    }
    await logEvent(null, req.actingUser!.id, "utilisateur_modifie", before, row);
    res.json(row);
  })
);

// Réinitialisation par l'administrateur — même mécanique que la création :
// un nouveau mot de passe temporaire est généré, renvoyé une seule fois,
// changement obligatoire à la prochaine connexion, et toutes les sessions
// existantes de ce compte sont révoquées (une réinitialisation doit couper
// l'accès obtenu avec l'ancien mot de passe, pas seulement en préparer un
// nouveau).
adminUsersRouter.post(
  "/admin/users/:id/reset-password",
  requirePermission("utilisateur", "modifier"),
  asyncHandler(async (req, res) => {
    const user = await queryOne<any>("select id from users where id = $1", [req.params.id]);
    if (!user) {
      const e: any = new Error("Utilisateur introuvable.");
      e.status = 404;
      throw e;
    }
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await query(
      "update users set password_hash = $1, must_change_password = true, failed_login_attempts = 0, locked_until = null where id = $2",
      [passwordHash, req.params.id]
    );
    await query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [req.params.id]);
    await logEvent(null, req.actingUser!.id, "utilisateur_mot_de_passe_reinitialise", null, { id: req.params.id });
    res.json({ temporary_password: tempPassword });
  })
);
