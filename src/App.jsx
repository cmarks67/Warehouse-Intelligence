// /src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";

import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { PasswordPage } from "./pages/PasswordPage";
import MasterData from "./pages/MasterData";
import MheSetup from "./pages/MheSetup";
import SchedulingTool from "./pages/SchedulingTool";

import ColleaguesSetup from "./pages/ColleaguesSetup";

import MheTrainingSetup from "./pages/MheTrainingSetup";


export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />

      <Route path="/app/dashboard" element={<DashboardPage />} />

      {/* Setup */}
      <Route path="/app/setup/companies-sites" element={<MasterData />} />
      <Route path="/app/setup/mhe" element={<MheSetup />} />
      <Route path="/app/setup/colleagues" element={<ColleaguesSetup />} />
<Route path="/app/setup/mhe-training" element={<MheTrainingSetup />} />
      {/* Tools */}
      <Route path="/app/tools/scheduling" element={<SchedulingTool />} />

      {/* Settings */}
      <Route path="/app/users" element={<UsersPage />} />
      <Route path="/app/password" element={<PasswordPage />} />

      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
      
    </Routes>
  );
}

