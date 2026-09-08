import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getStoredSessionToken, setSessionToken, setUnauthorizedHandler, type Permission, type User } from "../api";

export type CurrentUser = { id: string; full_name: string; role_code: string; role_label: string; must_change_password: boolean };

type AppContextValue = {
  currentUser: CurrentUser | null;
  // Le temps de vérifier, au chargement, si un jeton de session déjà
  // stocké est encore valide — évite un aller-retour visible vers l'écran
  // de connexion à chaque rechargement de page pour un utilisateur déjà
  // connecté.
  authLoading: boolean;
  users: User[];
  permissions: Permission[];
  // Migration v8 (RBAC) — vérifie côté frontend si le rôle courant a le
  // droit (resource, action). Ne remplace jamais le contrôle réel côté
  // serveur (voir backend/src/auth.ts).
  can: (resource: string, action: string) => boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
  // À rappeler après un changement de mot de passe réussi, pour rafraîchir
  // must_change_password sans forcer une nouvelle connexion.
  refreshMe: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [authLoading, setAuthLoading] = useState(true);

  function loadPermissions() {
    api.get("/me/permissions").then((res) => setPermissions(res.data.permissions ?? [])).catch(() => setPermissions([]));
  }
  function loadUsers() {
    api.get("/users").then((res) => setUsers(res.data)).catch(() => setUsers([]));
  }
  function loadMe() {
    return api.get("/auth/me").then((res) => {
      setCurrentUser(res.data);
      loadPermissions();
      loadUsers();
    });
  }

  useEffect(() => {
    // Migration v9 — un 401 en cours de session (jeton expiré ou révoqué,
    // compte désactivé) renvoie ici vers l'écran de connexion plutôt que
    // de laisser chaque appel échouer silencieusement.
    setUnauthorizedHandler(() => {
      setCurrentUser(null);
      setPermissions([]);
      setUsers([]);
    });
    const stored = getStoredSessionToken();
    if (stored) {
      setSessionToken(stored);
      loadMe().catch(() => setSessionToken(null)).finally(() => setAuthLoading(false));
    } else {
      setAuthLoading(false);
    }
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(loginId: string, password: string) {
    const res = await api.post("/auth/login", { login: loginId, password });
    setSessionToken(res.data.token);
    setCurrentUser(res.data.user);
    loadPermissions();
    loadUsers();
  }

  function logout() {
    // [Bug corrigé, migration v9] L'ordre importe : effacer le jeton avant
    // d'envoyer la requête de déconnexion la ferait partir sans en-tête
    // Authorization (l'intercepteur axios ne s'exécute qu'au tour de
    // microtâches suivant, après que le jeton en mémoire est déjà à null),
    // et le serveur répondait alors 401 sur sa propre route de logout —
    // constaté lors des tests Playwright de la migration v9. On capture
    // donc le jeton avant de vider l'état local, puis on l'attache
    // explicitement à la requête plutôt que de compter sur l'intercepteur.
    const token = getStoredSessionToken();
    setSessionToken(null);
    setCurrentUser(null);
    setPermissions([]);
    setUsers([]);
    if (token) {
      api.post("/auth/logout", null, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  }

  function can(resource: string, action: string) {
    return permissions.some((p) => p.resource === resource && p.action === action);
  }

  return (
    <AppContext.Provider value={{ currentUser, authLoading, users, permissions, can, login, logout, refreshMe: () => { loadMe(); } }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp doit être utilisé sous AppProvider");
  return ctx;
}
