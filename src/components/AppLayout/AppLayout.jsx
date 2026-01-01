// /src/components/AppLayout/AppLayout.jsx
import React, { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

import "./AppLayout.css";

// IMPORTANT: AppLayout is in /components/AppLayout,
// SideNav is in /components/SideNav
import { SideNav } from "../SideNav/SideNav";
import { TopBar } from "../TopBar/TopBar";

export function AppLayout({ activeNav, onSelectNav, headerEmail, children }) {
  const navigate = useNavigate();

  const [sectionsOpen, setSectionsOpen] = useState({
    setup: true,
    tools: true,
    settings: true,
  });

  const onToggleSection = useCallback((key) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // This is what allows the content to shift left when collapsed
  const [navCollapsed, setNavCollapsed] = useState(false);
  const handleNavCollapsedChange = useCallback((isCollapsed) => {
    setNavCollapsed(!!isCollapsed);
  }, []);

  const supabase = useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  const onSignOut = async () => {
    try {
      if (supabase) await supabase.auth.signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="wi-shell">
      <TopBar email={headerEmail} onSignOut={onSignOut} />

      <main className="wi-main">
        <div className={`wi-layout ${navCollapsed ? "wi-layout--nav-collapsed" : ""}`}>
          <aside className={`wi-sidebar ${navCollapsed ? "wi-sidebar--collapsed" : ""}`}>
            <SideNav
              active={activeNav}
              onSelect={onSelectNav}
              sectionsOpen={sectionsOpen}
              onToggleSection={onToggleSection}
              onCollapsedChange={handleNavCollapsedChange}
            />
          </aside>

          <section className="wi-content">{children}</section>
        </div>
      </main>
    </div>
  );
}
