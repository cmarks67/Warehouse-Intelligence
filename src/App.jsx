// /src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";

import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { PasswordPage } from "./pages/PasswordPage";
import MasterData from "./pages/MasterData";
import MheSetup from "./pages/MheSetup";

// NEW
import SchedulingTool from "./pages/SchedulingTool";

export default function App() {
  return (
    <Routes>
      {/* Redirect root */}
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />

      {/* Dashboard */}
      <Route path="/app/dashboard" element={<DashboardPage />} />

      {/* Setup */}
      <Route path="/app/setup/companies-sites" element={<MasterData />} />
      <Route path="/app/setup/mhe" element={<MheSetup />} />

      {/* Tools */}
      <Route path="/app/tools/scheduling" element={<SchedulingTool />} />

      {/* Settings */}
      <Route path="/app/users" element={<UsersPage />} />
      <Route path="/app/password" element={<PasswordPage />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}
