// /src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";

import { ProtectedRoute } from "./auth/ProtectedRoute";

// Public Pages
import PublicLayout from "./public/components/PublicLayout.jsx";
import PublicIndex from "./public/pages/Index.jsx";
import PublicAbout from "./public/pages/About.jsx";
import PublicServices from "./public/pages/Services.jsx";
import PublicContact from "./public/pages/Contact.jsx";
import PublicSitemap from "./public/pages/Sitemap.jsx";

// Existing auth/access pages
import { Login } from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";

// Protected app pages
import DashboardPage from "./pages/DashboardPage"; // default export in your repo
import { UsersPage } from "./pages/UsersPage";
import { PasswordPage } from "./pages/PasswordPage";

import MasterData from "./pages/MasterData";
import MheSetup from "./pages/MheSetup";
import ColleaguesSetup from "./pages/ColleaguesSetup";
import MheTrainingSetup from "./pages/MheTrainingSetup";
import SchedulingTool from "./pages/SchedulingTool";

export default function App() {
  return (
    <Routes>
      {/* Public site */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<PublicIndex />} />
        <Route path="/about" element={<PublicAbout />} />
        <Route path="/services" element={<PublicServices />} />
        <Route path="/contact" element={<PublicContact />} />
        <Route path="/sitemap" element={<PublicSitemap />} />
      </Route>

      {/* Auth / access */}
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Convenience redirects */}
      <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />

      {/* Aliases (support sidebar/old links without /app) */}
      <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/setup/companies-sites" element={<Navigate to="/app/setup/companies-sites" replace />} />
      <Route path="/setup/mhe" element={<Navigate to="/app/setup/mhe" replace />} />
      <Route path="/setup/colleagues" element={<Navigate to="/app/setup/colleagues" replace />} />
      <Route path="/setup/mhe-training" element={<Navigate to="/app/setup/mhe-training" replace />} />
      <Route path="/tools/scheduling" element={<Navigate to="/app/tools/scheduling" replace />} />

      {/* Protected app routes */}
      <Route
        path="/app/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Settings */}
      <Route
        path="/app/users"
        element={
          <ProtectedRoute>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/password"
        element={
          <ProtectedRoute>
            <PasswordPage />
          </ProtectedRoute>
        }
      />

      {/* Setup */}
      <Route
        path="/app/setup/companies-sites"
        element={
          <ProtectedRoute>
            <MasterData />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/setup/mhe"
        element={
          <ProtectedRoute>
            <MheSetup />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/setup/colleagues"
        element={
          <ProtectedRoute>
            <ColleaguesSetup />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/setup/mhe-training"
        element={
          <ProtectedRoute>
            <MheTrainingSetup />
          </ProtectedRoute>
        }
      />

      {/* Tools */}
      <Route
        path="/app/tools/scheduling"
        element={
          <ProtectedRoute>
            <SchedulingTool />
          </ProtectedRoute>
        }
      />

      {/* Catch-all: send unknown URLs to public home (better for a public site) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
