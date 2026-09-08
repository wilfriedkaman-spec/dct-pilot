import pg from "pg";

// Couche d'accès unique à la base. C'est le SEUL fichier qui change entre
// le développement local (variables PG* vers Postgres local, sans TLS) et
// la production (DATABASE_URL vers le projet Supabase, avec TLS requis
// mais un certificat auto-signé côté pooler — d'où rejectUnauthorized:
// false, comme documenté par Supabase pour une connexion via pg/node) :
// aucun code métier des routes ne dépend de ce détail.
export const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new pg.Pool({
      host: process.env.PGHOST || "127.0.0.1",
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "postgres",
      database: process.env.PGDATABASE || "dct_pilot_dev",
    });

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// Exécute plusieurs requêtes dans une seule transaction, avec un client
// dédié (indispensable pour les soumissions "en un seul envoi" — check-list
// de démarrage détaillée, fiche d'inspection QHSE — où l'en-tête et toutes
// les réponses doivent être acceptés ou rejetés ensemble, jamais à moitié).
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Insère une ligne dans le journal des événements (append-only). Utilisé par
// toutes les routes qui font évoluer un dossier, comme prévu au référentiel :
// "alimenté par toutes les phases sans exception".
export async function logEvent(
  caseId: string | null,
  actorId: string | null,
  eventType: string,
  detailBefore: object | null = null,
  detailAfter: object | null = null
) {
  await query(
    `insert into event_log (case_id, actor_id, event_type, detail_before, detail_after)
     values ($1, $2, $3, $4, $5)`,
    [caseId, actorId, eventType, detailBefore, detailAfter]
  );
}
