// /src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";

import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { DashboardPage } from "./pages/DashboardPage";

import { UsersPage } from "./pages/UsersPage";
import { PasswordPage } from "./pages/PasswordPage";

import ColleaguesSetup from "./pages/ColleaguesSetup";

// Setup pages
import MasterData from "./pages/MasterData";
import MheSetup from "./pages/MheSetup";
import MheTrainingSetup from "./pages/MheTrainingSetup";

// Tools
import SchedulingTool from "./pages/SchedulingTool";

// Styles
import "./styles/tokens.css";
import "./styles/base.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />

          {/* Convenience redirects */}
          <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />

          {/* Aliases (support sidebar/old links without /app) */}
          <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
          <Route path="/setup/companies-sites" element={<Navigate to="/app/setup/companies-sites" replace />} />
          <Route path="/setup/mhe" element={<Navigate to="/app/setup/mhe" replace />} />
          <Route path="/setup/colleagues" element={<Navigate to="/app/setup/colleagues" replace />} />
          <Route path="/setup/mhe-training" element={<Navigate to="/app/setup/mhe-training" replace />} />

          {/* Tools alias */}
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

          {/* Setup routes */}
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

          {/* Tools route */}
          <Route
            path="/app/tools/scheduling"
            element={
              <ProtectedRoute>
                <SchedulingTool />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
