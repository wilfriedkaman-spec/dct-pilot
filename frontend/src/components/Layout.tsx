import { Link, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Tableau de bord", icon: "🏠" },
  { to: "/dossiers", label: "Dossiers (A–E)", icon: "📁" },
  { to: "/indicateurs-qhse", label: "Indicateurs QHSE", icon: "📊" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { currentUser, logout, can } = useApp();
  const location = useLocation();
  // Migration v8 (RBAC, Q7) : le lien d'administration des comptes n'est
  // affiché que pour le rôle habilité à créer des comptes (administrateur).
  const nav = can("utilisateur", "creer")
    ? [...NAV, { to: "/administration", label: "Administration", icon: "🛠️" }]
    : NAV;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex">
        <aside className="fixed inset-y-0 left-0 w-64 bg-slate-900 text-slate-200">
          <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">DCT</div>
            <div>
              <div className="font-semibold text-white leading-tight">Gouvernance</div>
              <div className="text-xs text-slate-400 leading-tight">Chantiers — PAA / DCT</div>
            </div>
          </div>
          <nav className="px-3 py-4 space-y-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  location.pathname === n.to ? "bg-blue-600 text-white" : "hover:bg-slate-800 text-slate-300"
                }`}
              >
                <span>{n.icon}</span> {n.label}
              </Link>
            ))}
          </nav>
          {/* Migration v9 — le sélecteur libre "Connecté en tant que" a
             disparu : l'identité provient d'une session réelle (voir
             LoginPage). Seule reste ici la déconnexion. */}
          <div className="mt-auto absolute bottom-0 w-64 border-t border-slate-800 px-4 py-4">
            <div className="text-sm text-white">{currentUser?.full_name}</div>
            <div className="text-xs text-slate-400 mb-2">{currentUser?.role_label}</div>
            <button onClick={logout} className="w-full rounded bg-slate-800 text-sm text-white px-2 py-1.5 border border-slate-700 hover:bg-slate-700">
              Se déconnecter
            </button>
          </div>
        </aside>
        <main className="ml-64 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
