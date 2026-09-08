import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Role, type User } from "../api";
import { useApp } from "../context/AppContext";
import { Badge } from "../components/Badge";

// Migration v8 (RBAC, question Q7) — administration technique des comptes.
// Migration v9 — création et réinitialisation génèrent un mot de passe
// temporaire réel (jamais choisi par l'administrateur), affiché UNE SEULE
// FOIS ici pour être communiqué à la personne concernée : voir
// backend/src/routes/adminUsers.ts pour le mécanisme complet et son
// arbitrage. Réservée au rôle "administrateur" ; l'accès est déjà bloqué
// côté serveur, cette page se contente de ne pas présenter un formulaire
// qui échouerait systématiquement pour les autres rôles.
export function AdminUsersPage() {
  const { can } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [fullName, setFullName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Mot de passe temporaire à afficher une seule fois après une création
  // ou une réinitialisation — jamais récupérable ensuite (voir backend :
  // seul le hash est conservé).
  const [revealedPassword, setRevealedPassword] = useState<{ forLogin: string; value: string } | null>(null);

  function reload() {
    api.get("/users?all=true").then((r) => setUsers(r.data));
    api.get("/roles").then((r) => setRoles(r.data));
  }
  useEffect(reload, []);

  if (!can("utilisateur", "creer")) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Accès réservé au rôle Administrateur.
      </div>
    );
  }

  async function createUser() {
    if (!fullName || !roleCode || !loginId) return;
    setSaving(true); setError(null); setRevealedPassword(null);
    try {
      const res = await api.post("/admin/users", { full_name: fullName, role_code: roleCode, login: loginId });
      setRevealedPassword({ forLogin: res.data.login, value: res.data.temporary_password });
      setFullName(""); setRoleCode(""); setLoginId("");
      reload();
    } catch (err) { setError(apiErrorMessage(err)); } finally { setSaving(false); }
  }

  async function resetPassword(u: User) {
    setError(null); setRevealedPassword(null);
    try {
      const res = await api.post(`/admin/users/${u.id}/reset-password`);
      setRevealedPassword({ forLogin: u.login ?? u.full_name, value: res.data.temporary_password });
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function toggleActive(u: User) {
    try {
      await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active });
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function changeRole(u: User, newRoleCode: string) {
    try {
      await api.patch(`/admin/users/${u.id}`, { role_code: newRoleCode });
      reload();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Administration — Comptes utilisateurs</h1>
      <p className="text-sm text-slate-500">
        Gestion technique des comptes et de leur rôle (matrice de droits : voir migration v8). L'administrateur ne
        prend part à aucune décision métier — il ne peut ni créer, ni valider, ni clôturer un dossier.
      </p>

      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      {revealedPassword && (
        <div className="rounded-md bg-amber-50 border border-amber-300 px-4 py-3 text-sm text-amber-900">
          <div className="font-medium">Mot de passe temporaire pour « {revealedPassword.forLogin} »</div>
          <div className="mt-1 font-mono text-base">{revealedPassword.value}</div>
          <div className="mt-1 text-xs text-amber-700">
            Communiquez-le à la personne concernée maintenant — il ne sera plus jamais affiché. Changement obligatoire à la première connexion.
          </div>
          <button onClick={() => setRevealedPassword(null)} className="mt-2 text-xs underline">J'ai noté le mot de passe</button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Nom</th><th>Identifiant</th><th>Rôle</th><th>Statut</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">{u.full_name}</td>
                <td className="font-mono text-xs">{u.login}</td>
                <td>
                  <select
                    value={u.role_code}
                    onChange={(e) => changeRole(u, e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    {roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select>
                </td>
                <td>
                  <Badge label={u.is_active === false ? "désactivé" : "actif"} tone={u.is_active === false ? "critique" : "normal"} />
                  {u.must_change_password && <span className="ml-1 text-xs text-amber-600">mdp temporaire</span>}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <button onClick={() => resetPassword(u)} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                    Réinitialiser le mot de passe
                  </button>
                  <button onClick={() => toggleActive(u)} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                    {u.is_active === false ? "Réactiver" : "Désactiver"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-medium text-slate-900">+ Nouveau compte</h3>
        <p className="text-xs text-slate-500 mt-1">
          Un mot de passe temporaire est généré automatiquement et affiché une seule fois ci-dessus — vous ne le choisissez pas.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input placeholder="Nom complet" value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm flex-1 min-w-[160px]" />
          <input placeholder="Identifiant de connexion" value={loginId} onChange={(e) => setLoginId(e.target.value.toLowerCase())}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm flex-1 min-w-[160px]" />
          <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">— rôle —</option>
            {roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
          <button onClick={createUser} disabled={saving || !fullName || !roleCode || !loginId}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Créer le compte
          </button>
        </div>
      </div>
    </div>
  );
}
