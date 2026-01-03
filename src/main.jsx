// /src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import App from "./App";

// Styles
import "./styles/tokens.css";
import "./styles/base.css";
import "./index.css";

/**
 * Supabase password recovery + HashRouter:
 * Supabase returns recovery tokens in the URL hash:
 *   https://site/#access_token=...&refresh_token=...&type=recovery
 *
 * HashRouter also uses the hash, so without normalization React Router treats
 * "access_token=..." as a route, misses, and your catch-all redirects to /login.
 *
 * We rewrite to:
 *   https://site/#/reset-password?access_token=...&refresh_token=...&type=recovery
 * so the router lands on the ResetPassword page.
 */
(function normalizeSupabaseRecoveryHash() {
  try {
    const h = window.location.hash || "";

    // Already a HashRouter route (e.g. "#/login", "#/reset-password?...") → do nothing
    if (h.startsWith("#/")) return;

    // Supabase recovery payloads commonly begin with "#access_token=" or "#error="
    const looksLikeSupabase =
      h.startsWith("#access_token=") ||
      h.startsWith("#error=") ||
      h.includes("type=recovery") ||
      h.includes("refresh_token=");

    if (!looksLikeSupabase) return;

    const payload = h.slice(1); // drop the leading '#'
    const nextHash = `#/reset-password?${payload}`;

    // Keep origin/path/query; replace only the hash
    const nextUrl = `${window.location.pathname}${window.location.search}#${nextHash.slice(1)}`;
    window.history.replaceState(null, "", nextUrl);

    // TEMP PROOF LINE (remove after confirming prod is deploying the correct build)
    console.log("WI main.jsx loaded with Supabase hash normaliser");
  } catch (e) {
    // Never break boot if something unexpected happens
    console.warn("Supabase hash normaliser failed", e);
  }
})();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </AuthProvider>
  </React.StrictMode>
);
