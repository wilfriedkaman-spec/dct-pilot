import { Router } from "express";
import bcrypt from "bcryptjs";
import { query, queryOne } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { createSession, hashToken } from "../auth.js";

export const authRouter = Router();

const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;

function publicUser(u: any) {
  return { id: u.id, full_name: u.full_name, role_code: u.role_code, role_label: u.role_label, must_change_password: u.must_change_password };
}

// Migration v9 — connexion réelle. Message d'erreur volontairement
// identique que ce soit le login ou le mot de passe qui soit faux, pour ne
// pas révéler l'existence d'un compte à qui tente de le deviner.
authRouter.post("/auth/login", asyncHandler(async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    const e: any = new Error("Identifiant et mot de passe requis.");
    e.status = 400;
    throw e;
  }
  const user = await queryOne<any>(
    `select u.*, r.label as role_label from users u join roles r on r.code = u.role_code where lower(u.login) = lower($1)`,
    [login]
  );
  const genericError = { error: "Identifiant ou mot de passe incorrect." };
  if (!user || !user.is_active) { res.status(401).json(genericError); return; }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    res.status(423).json({ error: `Compte temporairement verrouillé après plusieurs échecs. Réessayez après ${new Date(user.locked_until).toLocaleTimeString("fr-FR")}.` });
    return;
  }

  const ok = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
  if (!ok) {
    const attempts = user.failed_login_attempts + 1;
    if (attempts >= LOCK_THRESHOLD) {
      await query("update users set failed_login_attempts = 0, locked_until = now() + make_interval(mins => $2) where id = $1", [user.id, LOCK_MINUTES]);
    } else {
      await query("update users set failed_login_attempts = $2 where id = $1", [user.id, attempts]);
    }
    res.status(401).json(genericError);
    return;
  }

  await query("update users set failed_login_attempts = 0, locked_until = null, last_login_at = now() where id = $1", [user.id]);
  const { token, expiresAt } = await createSession(user.id);
  res.json({ token, expires_at: expiresAt, user: publicUser(user) });
}));

authRouter.post("/auth/logout", asyncHandler(async (req, res) => {
  if (req.sessionId) {
    await query("update sessions set revoked_at = now() where id = $1", [req.sessionId]);
  }
  res.status(204).end();
}));

authRouter.get("/auth/me", asyncHandler(async (req, res) => {
  const actor = req.actingUser;
  if (!actor) { res.status(401).json({ error: "Session absente ou expirée : veuillez vous connecter." }); return; }
  const user = await queryOne<any>("select must_change_password from users where id = $1", [actor.id]);
  res.json({ ...actor, must_change_password: user?.must_change_password ?? false });
}));

authRouter.post("/auth/change-password", asyncHandler(async (req, res) => {
  const actor = req.actingUser;
  if (!actor) { res.status(401).json({ error: "Session absente ou expirée : veuillez vous connecter." }); return; }
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    const e: any = new Error("Mot de passe actuel et nouveau mot de passe requis.");
    e.status = 400;
    throw e;
  }
  if (new_password.length < MIN_PASSWORD_LENGTH) {
    const e: any = new Error(`Le nouveau mot de passe doit compter au moins ${MIN_PASSWORD_LENGTH} caractères.`);
    e.status = 400;
    throw e;
  }
  const user = await queryOne<any>("select password_hash from users where id = $1", [actor.id]);
  const ok = user?.password_hash ? await bcrypt.compare(current_password, user.password_hash) : false;
  if (!ok) {
    const e: any = new Error("Mot de passe actuel incorrect.");
    e.status = 401;
    throw e;
  }
  const newHash = await bcrypt.hash(new_password, 10);
  await query("update users set password_hash = $1, must_change_password = false where id = $2", [newHash, actor.id]);
  // Par précaution, on révoque les autres sessions ouvertes sur ce compte :
  // un changement de mot de passe doit invalider tout accès obtenu avec
  // l'ancien, y compris depuis un autre appareil déjà connecté.
  await query("update sessions set revoked_at = now() where user_id = $1 and id != $2 and revoked_at is null", [actor.id, req.sessionId]);
  res.status(204).end();
}));
