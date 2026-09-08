import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { referenceRouter } from "./routes/reference.js";
import { casesRouter } from "./routes/cases.js";
import { preparationRouter } from "./routes/preparation.js";
import { executionRouter } from "./routes/execution.js";
import { ncRouter } from "./routes/nc.js";
import { actionsRouter } from "./routes/actions.js";
import { receptionRouter } from "./routes/reception.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { risksRouter } from "./routes/risks.js";
import { documentsRouter } from "./routes/documents.js";
import { marketRiskRouter } from "./routes/marketRisk.js";
import { startupChecklistRouter } from "./routes/startupChecklist.js";
import { qhseInspectionsRouter } from "./routes/qhseInspections.js";
import { incidentsRouter } from "./routes/incidents.js";
import { contractorEvaluationRouter } from "./routes/contractorEvaluation.js";
import { adminUsersRouter } from "./routes/adminUsers.js";
import { authRouter } from "./routes/auth.js";
import { identifyActor } from "./auth.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Migration v9 — authentification réelle par session (voir auth.ts). Toute
// route sous /api, lecture ou écriture, exige désormais une session
// valide, à l'exception explicite de /auth/login (le point d'entrée) et de
// /health.
app.use("/api", identifyActor);

app.use("/api", authRouter);
app.use("/api", referenceRouter);
app.use("/api/cases", casesRouter);
app.use("/api", preparationRouter);
app.use("/api", executionRouter);
app.use("/api", ncRouter);
app.use("/api", actionsRouter);
app.use("/api", receptionRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api", risksRouter);
app.use("/api", documentsRouter);
app.use("/api", marketRiskRouter);
app.use("/api", startupChecklistRouter);
app.use("/api", qhseInspectionsRouter);
app.use("/api", incidentsRouter);
app.use("/api", contractorEvaluationRouter);
app.use("/api", adminUsersRouter);

// Filet de sécurité pour les erreurs levées par un middleware qui n'est
// pas lui-même enveloppé par asyncHandler (ex. requirePermission utilisé
// directement comme middleware de route) : sans ce gestionnaire global,
// Express retomberait sur sa page d'erreur HTML par défaut au lieu du
// { error: "..." } JSON attendu par le frontend.
app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.status || 500;
  res.status(status).json({ error: err?.message || "Erreur inattendue" });
});

// [ARBITRAGE — déploiement] En développement, le frontend tourne sous son
// propre serveur Vite (proxy /api vers ce serveur, voir vite.config.ts).
// En production, il n'existe qu'un seul service web (contrainte de
// l'hébergement gratuit visé) : ce même serveur Express sert donc aussi
// les fichiers statiques compilés du frontend (frontend/dist), avec un
// repli sur index.html pour toute route qui n'est ni /api ni un fichier
// existant — indispensable pour une SPA avec routage côté client
// (react-router), sous peine de 404 au rechargement d'une page interne.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.join(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`DCT PILOT API — écoute sur http://localhost:${port}`);
});
