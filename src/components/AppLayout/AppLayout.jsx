// /src/components/AppLayout/AppLayout.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import "./AppLayout.css";

import { SideNav } from "../SideNav/SideNav";
import { TopBar } from "../TopBar/TopBar";

// IMPORTANT: use the SAME singleton client used by DashboardPage.jsx
import supabase from "../../lib/supabaseClient";

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

  // Header context
  const [resolvedEmail, setResolvedEmail] = useState(headerEmail || "");
  const [accountId, setAccountId] = useState("");

  // Keep resolvedEmail in sync if pages pass it
  useEffect(() => {
    if (headerEmail) setResolvedEmail(headerEmail);
  }, [headerEmail]);

  const loadHeaderContext = useCallback(async () => {
    // Use session so it works reliably on refresh (same as DashboardPage.jsx)
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const u = sess?.session?.user || null;

    if (!u) {
      setAccountId("");
      if (!headerEmail) setResolvedEmail("");
      return;
    }

    if (!headerEmail) setResolvedEmail(u.email || "");

    const { data: urow, error: uerr } = await supabase
      .from("users")
      .select("account_id")
      .eq("id", u.id)
      .single();

    if (uerr) throw uerr;

    setAccountId(urow?.account_id || "");
  }, [headerEmail]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await loadHeaderContext();
      } catch {
        if (!alive) return;
        setAccountId("");
      }
    })();

    // Keep header synced if auth changes
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!alive) return;

      const u = session?.user || null;

      if (!u) {
        setAccountId("");
        if (!headerEmail) setResolvedEmail("");
        return;
      }

      if (!headerEmail) setResolvedEmail(u.email || "");

      try {
        const { data: urow, error: uerr } = await supabase
          .from("users")
          .select("account_id")
          .eq("id", u.id)
          .single();

        if (!uerr) setAccountId(urow?.account_id || "");
      } catch {
        // ignore
      }
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [loadHeaderContext, headerEmail]);

  const onSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="wi-shell">
      <TopBar email={resolvedEmail} accountId={accountId} onSignOut={onSignOut} />

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
