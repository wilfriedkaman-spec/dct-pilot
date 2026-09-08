import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

// Migration v9 — authentification réelle. Remplace l'en-tête déclaratif
// X-User-Id (migration v8) par un vrai jeton de session, obtenu à la
// connexion (POST /api/auth/login) et transmis sur CHAQUE appel via
// Authorization: Bearer <jeton>. Le jeton est gardé en mémoire pour
// l'intercepteur et dupliqué dans localStorage pour survivre à un
// rechargement de page — voir "reste à faire" du rapport : un cookie
// httpOnly serait préférable contre le vol par script (XSS), mais
// suppose un serveur configuré pour en émettre, ce qui n'est pas encore
// le cas ici.
const SESSION_TOKEN_KEY = "dct_pilot_session_token";
let sessionToken: string | null = null;
export function setSessionToken(token: string | null) {
  sessionToken = token;
  if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);
  else localStorage.removeItem(SESSION_TOKEN_KEY);
}
export function getStoredSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}
api.interceptors.request.use((config) => {
  if (sessionToken) {
    config.headers = config.headers ?? {};
    (config.headers as any)["Authorization"] = `Bearer ${sessionToken}`;
  }
  return config;
});

// Un 401 en dehors de la tentative de connexion elle-même signifie que la
// session a expiré ou a été révoquée (déconnexion, désactivation du
// compte) — on efface le jeton et on prévient l'application (AppContext)
// pour renvoyer vers l'écran de connexion, plutôt que de laisser chaque
// composant gérer cette erreur individuellement.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && !err?.config?.url?.includes("/auth/login")) {
      setSessionToken(null);
      onUnauthorized?.();
    }
    return Promise.reject(err);
  }
);

// Téléchargement authentifié d'un document officiel (PV, attestation,
// autorisation de démarrage). Un <a href> classique ne porterait pas
// l'en-tête Authorization (ce n'est pas un appel XHR) — depuis que toutes
// les routes exigent une session (migration v9), un lien direct
// échouerait en 401. On passe donc par axios (qui porte le jeton) avec une
// réponse en blob, ouverte ensuite dans un nouvel onglet.
export async function openAuthenticatedPdf(url: string) {
  const res = await api.get(url, { responseType: "blob" });
  const blobUrl = URL.createObjectURL(res.data);
  window.open(blobUrl, "_blank");
}

export type User = { id: string; full_name: string; role_code: string; role_label: string; is_active?: boolean; login?: string; must_change_password?: boolean };
export type Role = { code: string; label: string; description: string | null };
export type Permission = { resource: string; action: string };
export type Company = { id: string; name: string };
export type ControlLibraryPoint = {
  id: string; corps_metier: string; activite: string; type: "PA" | "PC" | "PS";
  designation: string; critere_acceptation: string; methode: string; frequence: string;
};

export type CaseRow = {
  id: string; case_number: string; title: string; nature_travaux: string;
  requesting_service: string; case_type: string;
  trigger_document_type: string; trigger_document_number: string; trigger_document_date: string;
  purchase_order_number?: string; amount?: string;
  company_id?: string; company_name?: string;
  registered_by: string; responsible_dct_id?: string; responsible_dct_name?: string;
  assigned_controller_id?: string; controller_name?: string;
  assigned_qhse_referent_id?: string; qhse_referent_name?: string;
  origine_besoin?: string; situation_administrative?: string;
  etat_prise_en_charge?: string; etat_prise_en_charge_auto?: string;
  etat_prise_en_charge_source?: string; etat_prise_en_charge_justification?: string;
  criticite_provisoire?: string; criticite_confirmee?: string;
  phase: "A" | "B" | "C" | "D" | "E"; status: string;
  niveau_critique_global?: string;
  niveau_risque_marche?: "niveau_1" | "niveau_2" | "niveau_3" | null;
  niveau_risque_marche_justification?: string | null;
  date_fin_prevue?: string | null; avancement_pourcentage?: number | string | null;
  created_at: string;
  key_dates?: { date_type: string; date_value: string | null; is_verbal: boolean }[];
  initial_assessments?: {
    id: string; assessed_by: string; assessment_date: string; avancement_estime: string | null;
    travaux_realises: string | null; travaux_en_cours: string | null; travaux_restants: string | null;
    documents_disponibles: string[] | null; anomalies_visibles: string | null; controles_impossibles: string;
    conclusion_partie_executee: string | null; partie_restante_existe: boolean; created_at: string;
  }[];
  pre_closure_checks?: {
    id: string; doe_disponible: boolean; documents_garantie: boolean; essais_disponibles: boolean;
    conformite_apparente: boolean; anomalies_a3_levees: boolean; validation_qhse_finale: boolean;
    statut: "en_cours" | "solde"; updated_at: string;
  } | null;
};

export type Permit = {
  id: string; case_id: string; permit_type: string; required_reason: string | null;
  issuer_domain: string | null; issuer_name: string | null; permit_number: string | null;
  issue_date: string | null; expiry_date: string | null;
  statut: "requis" | "en_cours" | "delivre" | "expire" | "non_requis";
  linked_event_id: string | null; auto_detected: boolean; correction_motif: string | null; created_at: string;
};

export type PermitDetectionRule = { id: string; corps_metier: string; permit_type: string; issuer_domain: string | null; label: string };

export type RiskLibraryEntry = { id: string; category: "generique" | "portuaire"; label: string; description: string | null };

export type CaseRisk = {
  id: string; case_id: string; risk_library_id: string | null;
  risk_library_label?: string | null; risk_library_category?: string | null;
  activite: string | null; situation: string | null; danger: string | null; risque: string | null;
  personnes_exposees: string | null; probabilite: number | null; gravite: number | null;
  niveau_initial: "faible" | "modere" | "eleve" | "critique" | null;
  mesures_existantes: string | null; mesures_complementaires: string | null;
  responsable: string | null; echeance: string | null;
  niveau_residuel: "faible" | "modere" | "eleve" | "critique" | null;
  statut: "ouvert" | "clos"; created_at: string;
};

export type DocumentRequirement = { document_type: string; label: string; statut: string | null };

export type ChecklistLibraryItem = { item_code: string; section: string; label: string; ordre: number };

export type EpiMatrixEntry = {
  activite: string; casque: string; gilet_hv: string; chaussures_securite: string; gants: string;
  lunettes: string; protection_auditive: string; masque_respirateur: string; harnais: string;
  vetement_hv_adapte: string; autres_epi_specifiques: string | null;
};

export type EvaluationCriterion = { item_code: string; section: string; label: string; ordre: number };

export type KpiIndicator = {
  code: number; label: string; valeur: number | null; unite: string; objectif: number | null;
  note?: string | null; non_suivi?: boolean; raison?: string;
};

// Extraction d'un message d'erreur métier lisible depuis une réponse Axios,
// pour que l'interface affiche exactement ce que le trigger SQL a dit.
export function apiErrorMessage(err: any): string {
  return err?.response?.data?.error || err?.message || "Erreur inattendue";
}
