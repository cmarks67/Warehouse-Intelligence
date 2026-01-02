// /src/components/AppLayout/AppLayout.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import "./AppLayout.css";

import { SideNav } from "../SideNav/SideNav";
import { TopBar } from "../TopBar/TopBar";

// IMPORTANT: use the SAME singleton client used by DashboardPage.jsx
import supabase from "../../lib/supabaseClient";

const MOBILE_BREAKPOINT_PX = 900;

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

  // Sidebar collapsed (desktop reclaim space)
  const [navCollapsed, setNavCollapsed] = useState(false);
  const handleNavCollapsedChange = useCallback((isCollapsed) => {
    setNavCollapsed(!!isCollapsed);
  }, []);

  // Mobile drawer open/close
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const onChange = (e) => setIsMobile(!!e.matches);

    // init + subscribe
    setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // Close mobile drawer when leaving mobile breakpoint
  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  // Lock body scroll when drawer open (prevents double-scroll/jank)
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mobileNavOpen) document.body.classList.add("wi-body--navOpen");
    else document.body.classList.remove("wi-body--navOpen");

    return () => document.body.classList.remove("wi-body--navOpen");
  }, [mobileNavOpen]);

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  // Header context
  const [resolvedEmail, setResolvedEmail] = useState(headerEmail || "");
  const [accountId, setAccountId] = useState("");

  // Keep resolvedEmail in sync if pages pass it
  useEffect(() => {
    if (headerEmail) setResolvedEmail(headerEmail);
  }, [headerEmail]);

  const loadHeaderContext = useCallback(async () => {
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

  // When a nav item is selected on mobile, close drawer to keep it feeling “app-like”
  const handleSelectNav = useCallback(
    (...args) => {
      if (typeof onSelectNav === "function") onSelectNav(...args);
      if (isMobile) closeMobileNav();
    },
    [onSelectNav, isMobile, closeMobileNav]
  );

  return (
    <div className="wi-shell">
      <TopBar
        email={resolvedEmail}
        accountId={accountId}
        onSignOut={onSignOut}
        onMenuClick={isMobile ? (mobileNavOpen ? closeMobileNav : openMobileNav) : undefined}
        menuOpen={isMobile ? mobileNavOpen : false}
      />

      {/* Mobile overlay */}
      {isMobile && mobileNavOpen && <div className="wi-navOverlay" onClick={closeMobileNav} aria-hidden="true" />}

      <main className="wi-main">
        <div
          className={[
            "wi-layout",
            navCollapsed ? "wi-layout--nav-collapsed" : "",
            isMobile ? "wi-layout--mobile" : "",
            isMobile && mobileNavOpen ? "wi-layout--mobileNavOpen" : "",
          ].join(" ")}
        >
          <aside className={`wi-sidebar ${navCollapsed ? "wi-sidebar--collapsed" : ""}`}>
            <SideNav
              active={activeNav}
              onSelect={handleSelectNav}
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
