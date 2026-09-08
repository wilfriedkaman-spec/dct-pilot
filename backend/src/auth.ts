import type { Request, Response, NextFunction, RequestHandler } from "express";
import crypto from "node:crypto";
import { query, queryOne } from "./db.js";

export type ActingUser = { id: string; full_name: string; role_code: string; role_label: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actingUser?: ActingUser;
      sessionId?: string;
    }
  }
}

// Migration v9 — authentification réelle. Remplace l'identification
// déclarative de la migration v8 (en-tête X-User-Id, sans preuve) par une
// vraie session : un jeton opaque, émis à la connexion (routes/auth.ts),
// dont seul le hash SHA-256 est stocké en base (même discipline que
// password_hash — une fuite de la table "sessions" ne permet pas de
// rejouer une session). Chaque jeton porté par le client est revalidé à
// CHAQUE requête (jamais mis en cache côté serveur), avec durée de vie
// fixe (SESSION_TTL_HOURS) et révocation immédiate possible (déconnexion,
// ou désactivation du compte par un administrateur — voir routes/adminUsers.ts).
//
// Ce qui NE change PAS depuis la migration v8, et c'est le point important
// signalé dans l'audit préalable : req.actingUser garde exactement la même
// forme, et hasPermission/assertPermission/requirePermission ci-dessous
// sont inchangées. Toute la matrice de droits construite en v8 continue de
// fonctionner à l'identique.
export const SESSION_TTL_HOURS = 8;

// Chemins accessibles sans session valide — strictement le point d'entrée
// (se connecter) et la sonde de santé technique.
const EXEMPT_PATHS = new Set(["/health", "/auth/login"]);

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Mot de passe temporaire lisible (sans caractères ambigus 0/O/1/l/I) —
// utilisé à la création d'un compte ou à sa réinitialisation par un
// administrateur (routes/adminUsers.ts). Jamais stocké en clair : seul son
// hash bcrypt l'est, et il n'est renvoyé qu'UNE FOIS, dans la réponse HTTP
// de création/réinitialisation.
const TEMP_PASSWORD_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
export function generateTempPassword(length = 10): string {
  let out = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += TEMP_PASSWORD_CHARS[bytes[i] % TEMP_PASSWORD_CHARS.length];
  return out;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  await query(
    `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt]
  );
  return { token, expiresAt };
}

// Identifie l'acteur à partir d'un jeton de session réel (en-tête
// Authorization: Bearer <jeton>). Toute route non exemptée — lecture ou
// écriture — exige désormais une session valide : depuis qu'une vraie
// connexion existe, il n'y a plus de raison de laisser les lectures
// ouvertes comme le faisait, par pragmatisme temporaire, la migration v8.
export async function identifyActor(req: Request, res: Response, next: NextFunction) {
  if (EXEMPT_PATHS.has(req.path)) { next(); return; }

  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "Session absente ou expirée : veuillez vous connecter." });
    return;
  }
  try {
    const session = await queryOne<any>(
      `select s.id as session_id, s.expires_at, s.revoked_at,
              u.id, u.full_name, u.role_code, u.is_active, r.label as role_label
       from sessions s
       join users u on u.id = s.user_id
       join roles r on r.code = u.role_code
       where s.token_hash = $1`,
      [hashToken(token)]
    );
    if (!session || session.revoked_at || new Date(session.expires_at) < new Date() || !session.is_active) {
      res.status(401).json({ error: "Session absente ou expirée : veuillez vous connecter." });
      return;
    }
    req.actingUser = { id: session.id, full_name: session.full_name, role_code: session.role_code, role_label: session.role_label };
    req.sessionId = session.session_id;
    query("update sessions set last_seen_at = now() where id = $1", [session.session_id]).catch(() => {});
    next();
  } catch (err) {
    next(err);
  }
}

// Interroge la matrice role_permissions — deny-by-default : une
// combinaison (rôle, ressource, action) absente de la table est refusée.
// INCHANGÉ depuis la migration v8.
export async function hasPermission(roleCode: string, resource: string, action: string): Promise<boolean> {
  const row = await queryOne<any>(
    `select allowed from role_permissions where role_code = $1 and resource = $2 and action = $3`,
    [roleCode, resource, action]
  );
  return !!row?.allowed;
}

export async function assertPermission(req: Request, resource: string, action: string): Promise<void> {
  const actor = req.actingUser;
  if (!actor) {
    const e: any = new Error("Session absente ou expirée : veuillez vous connecter.");
    e.status = 401;
    throw e;
  }
  const allowed = await hasPermission(actor.role_code, resource, action);
  if (!allowed) {
    const e: any = new Error(`Action non autorisée pour le rôle « ${actor.role_label} » (${action} sur ${resource}).`);
    e.status = 403;
    throw e;
  }
}

export function requirePermission(resource: string, action: string): RequestHandler {
  return (req, res, next) => {
    assertPermission(req, resource, action).then(() => next()).catch(next);
  };
}
