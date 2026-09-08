import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { CasesList } from "./pages/CasesList";
import { CaseDetail } from "./pages/CaseDetail";
import { QhseKpiDashboard } from "./pages/QhseKpiDashboard";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";

// Migration v9 — porte d'entrée authentifiée. Tant qu'aucune session
// valide n'est établie, seul l'écran de connexion est atteignable ; un
// compte dont le mot de passe est encore temporaire ne voit que l'écran de
// changement obligatoire, avant tout accès au reste de l'application.
function Gate() {
  const { currentUser, authLoading } = useApp();

  if (authLoading) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400 text-sm">Vérification de la session...</div>;
  }
  if (!currentUser) {
    return <LoginPage />;
  }
  if (currentUser.must_change_password) {
    return <ChangePasswordPage />;
  }
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dossiers" element={<CasesList />} />
          <Route path="/dossiers/:id" element={<CaseDetail />} />
          <Route path="/indicateurs-qhse" element={<QhseKpiDashboard />} />
          <Route path="/administration" element={<AdminUsersPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}
