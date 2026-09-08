import { useState } from "react";
import { apiErrorMessage } from "../api";
import { useApp } from "../context/AppContext";

// Migration v9 — écran de connexion réel, remplaçant le sélecteur "Connecté
// en tant que" de la barre latérale (migrations précédentes). L'identité
// de l'utilisateur provient désormais d'une session prouvée par mot de
// passe, pas d'un choix libre dans une liste.
export function LoginPage() {
  const { login } = useApp();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(loginId.trim(), password);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">DCT</div>
          <div>
            <div className="font-semibold text-slate-900 leading-tight">Gouvernance</div>
            <div className="text-xs text-slate-500 leading-tight">Chantiers — PAA / DCT</div>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-slate-900">Connexion</h1>

        {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Identifiant</label>
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoFocus
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Mot de passe</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={submitting || !loginId || !password}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {submitting ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
