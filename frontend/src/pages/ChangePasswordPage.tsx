import { useState } from "react";
import { api, apiErrorMessage } from "../api";
import { useApp } from "../context/AppContext";

// Migration v9 — écran de changement de mot de passe obligatoire, affiché
// tant que must_change_password est vrai (compte créé ou réinitialisé par
// un administrateur : voir AdminUsersPage). Rien d'autre dans
// l'application n'est accessible avant ce passage — voir App.tsx.
export function ChangePasswordPage() {
  const { currentUser, refreshMe, logout } = useApp();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) { setError("La confirmation ne correspond pas au nouveau mot de passe."); return; }
    setSubmitting(true);
    try {
      await api.post("/auth/change-password", { current_password: currentPassword, new_password: newPassword });
      refreshMe();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h1 className="text-lg font-semibold text-slate-900">Changement de mot de passe obligatoire</h1>
        <p className="text-sm text-slate-500">
          {currentUser?.full_name}, votre mot de passe est temporaire. Définissez votre propre mot de passe avant de continuer.
        </p>

        {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Mot de passe temporaire actuel</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Nouveau mot de passe (8 caractères minimum)</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Confirmation</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={submitting || !currentPassword || !newPassword || !confirm}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {submitting ? "Enregistrement..." : "Définir mon mot de passe"}
        </button>
        <button type="button" onClick={logout} className="w-full text-xs text-slate-400 hover:text-slate-600">
          Annuler et se déconnecter
        </button>
      </form>
    </div>
  );
}
