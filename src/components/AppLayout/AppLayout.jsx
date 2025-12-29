// /src/components/AppLayout/AppLayout.jsx
import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

import "./AppLayout.css";
import { SideNav } from "../SideNav/SideNav";

export function AppLayout({ activeNav, onSelectNav, headerEmail, children }) {
  const navigate = useNavigate();

  const [sectionsOpen, setSectionsOpen] = useState({
    setup: true,
    tools: true,
    settings: true,
  });

  const onToggleSection = (key) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Create a supabase client (preferred: centralise this in /src/lib/supabaseClient.js later)
  const supabase = useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  const onSignOut = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } finally {
      // Always push user back to login after sign out
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="wi-shell">
      {/* Header */}
      <header className="wi-header">
        <div className="wi-header-inner">
          <div className="wi-brand">
            Warehouse <span>Intelligence</span>
          </div>

          <div className="wi-user">
            <span className="wi-user-email">{headerEmail}</span>
            <button className="wi-btn wi-btn-outline" onClick={onSignOut} type="button">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="wi-main">
        <div className="wi-layout">
          {/* Sidebar */}
          <aside className="wi-sidebar">
            <SideNav
              active={activeNav}
              onSelect={onSelectNav}
              sectionsOpen={sectionsOpen}
              onToggleSection={onToggleSection}
            />
          </aside>

          {/* Content */}
          <section className="wi-content">{children}</section>
        </div>
      </main>
    </div>
  );
}
