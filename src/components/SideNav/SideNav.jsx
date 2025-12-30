// /src/components/SideNav.jsx
import "./sidenav.css";
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

function Divider() {
  return <div className="wi-nav__divider" />;
}

function SectionTitle({ children, collapsed }) {
  return (
    <div className={`wi-nav__sectionTitle ${collapsed ? "is-collapsed" : ""}`}>
      {children}
    </div>
  );
}

function DropdownHeader({ title, open, onToggle, collapsed }) {
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") onToggle?.();
  };

  return (
    <div
      className={`wi-nav__dropdownHeader ${collapsed ? "is-collapsed" : ""}`}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      aria-expanded={open ? "true" : "false"}
      title={collapsed ? title : undefined}
    >
      {!collapsed && (
        <span className="wi-nav__sectionTitle" style={{ marginBottom: 0 }}>
          {title}
        </span>
      )}
      <span className="wi-nav__arrow">{collapsed ? "▸" : open ? "▾" : "▸"}</span>
    </div>
  );
}

export function SideNav({ active, onSelect, sectionsOpen, onToggleSection }) {
  const navigate = useNavigate();

  // Collapsing / hover-peek / pin
  const [collapsed, setCollapsed] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [hovering, setHovering] = useState(false);

  // Effective collapsed state:
  // - If collapsed and NOT pinned open, then hover temporarily expands.
  const isCollapsed = useMemo(() => {
    if (!collapsed) return false;
    if (pinnedOpen) return false;
    return !hovering;
  }, [collapsed, pinnedOpen, hovering]);

  // Default closed sections if parent does not control them
  const [localSectionsOpen, setLocalSectionsOpen] = useState({
    setup: false,
    tools: false,
    settings: false,
  });

  const effectiveSectionsOpen = sectionsOpen ?? localSectionsOpen;

  const toggleSection = (key) => {
    if (typeof onToggleSection === "function") return onToggleSection(key);
    setLocalSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper: select + navigate
  const go = (key, path) => {
    if (typeof onSelect === "function") onSelect(key);
    if (path) navigate(path);
  };

  const toggleCollapse = () => {
    // If collapsing, default to "not pinned" so hover-peek works immediately.
    // If expanding, pin open.
    setCollapsed((c) => {
      const next = !c;
      if (next) setPinnedOpen(false);
      if (!next) setPinnedOpen(true);
      return next;
    });
  };

  const togglePin = () => {
    // Pin open forces expanded state even if "collapsed mode" is on.
    setPinnedOpen((p) => !p);
  };

  return (
    <nav
      className={`wi-navRoot ${isCollapsed ? "wi-navRoot--collapsed" : ""}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="wi-nav__topBar">
        {!isCollapsed && <div className="wi-nav__brand">Warehouse Intelligence</div>}

        <div className="wi-nav__controls">
          <button
            type="button"
            className="wi-nav__ctrlBtn"
            onClick={toggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>

          {collapsed && (
            <button
              type="button"
              className={`wi-nav__ctrlBtn ${pinnedOpen ? "is-active" : ""}`}
              onClick={togglePin}
              aria-label={pinnedOpen ? "Unpin sidebar" : "Pin sidebar"}
              title={pinnedOpen ? "Unpin" : "Pin"}
            >
              {pinnedOpen ? "Unpin" : "Pin"}
            </button>
          )}
        </div>
      </div>

      <div className="wi-nav__scroll">
        <SectionTitle collapsed={isCollapsed}>Navigation</SectionTitle>

        {/* Overview */}
        <div
          className={`wi-nav__item ${active === "overview" ? "active" : ""} ${
            isCollapsed ? "is-collapsed" : ""
          }`}
          onClick={() => go("overview", "/app/dashboard")}
          role="button"
          tabIndex={0}
          title={isCollapsed ? "Overview" : undefined}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("overview", "/app/dashboard")}
        >
          <span className="wi-nav__label">Overview</span>
        </div>

        <Divider />

        {/* SETUP */}
        <DropdownHeader
          title="Setup"
          open={!!effectiveSectionsOpen?.setup}
          onToggle={() => toggleSection("setup")}
          collapsed={isCollapsed}
        />

        <div className={`${effectiveSectionsOpen?.setup ? "" : "hidden"}`}>
          <div
            className={`wi-nav__link ${active === "company-site-setup" ? "active" : ""} ${
              isCollapsed ? "is-collapsed" : ""
            }`}
            onClick={() => go("company-site-setup", "/app/setup/companies-sites")}
            role="button"
            tabIndex={0}
            title={isCollapsed ? "Company & site setup" : undefined}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("company-site-setup", "/app/setup/companies-sites")}
          >
            <span className="wi-nav__label">Company &amp; site setup</span>
          </div>

          <div
            className={`wi-nav__link ${active === "colleagues-setup" ? "active" : ""} ${
              isCollapsed ? "is-collapsed" : ""
            }`}
            onClick={() => go("colleagues-setup", "/app/setup/colleagues")}
            role="button"
            tabIndex={0}
            title={isCollapsed ? "Colleagues" : undefined}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("colleagues-setup", "/app/setup/colleagues")}
          >
            <span className="wi-nav__label">Colleagues</span>
          </div>

          <div
            className={`wi-nav__link ${active === "mhe-setup" ? "active" : ""} ${
              isCollapsed ? "is-collapsed" : ""
            }`}
            onClick={() => go("mhe-setup", "/app/setup/mhe")}
            role="button"
            tabIndex={0}
            title={isCollapsed ? "MHE setup" : undefined}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("mhe-setup", "/app/setup/mhe")}
          >
            <span className="wi-nav__label">MHE setup</span>
          </div>

          <div
            className={`wi-nav__link ${active === "connections" ? "active" : ""} ${
              isCollapsed ? "is-collapsed" : ""
            }`}
            onClick={() => go("connections", "/app/connections")}
            role="button"
            tabIndex={0}
            title={isCollapsed ? "Data Connections" : undefined}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("connections", "/app/connections")}
          >
            <span className="wi-nav__label">Data Connections</span>
          </div>
        </div>

        <Divider />

        {/* TOOLS */}
        <DropdownHeader
          title="Tools"
          open={!!effectiveSectionsOpen?.tools}
          onToggle={() => toggleSection("tools")}
          collapsed={isCollapsed}
        />

        <div className={`${effectiveSectionsOpen?.tools ? "" : "hidden"}`}>
          <div
            className={`wi-nav__link ${active === "scheduling-tool" ? "active" : ""} ${
              isCollapsed ? "is-collapsed" : ""
            }`}
            onClick={() => go("scheduling-tool", "/app/tools/scheduling")}
            role="button"
            tabIndex={0}
            title={isCollapsed ? "Scheduling tool" : undefined}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("scheduling-tool", "/app/tools/scheduling")}
          >
            <span className="wi-nav__label">Scheduling tool</span>
          </div>
        </div>

                  <div
            className={`wi-nav__link ${active === "mhe-training" ? "active" : ""} ${
              isCollapsed ? "is-collapsed" : ""
            }`}
            onClick={() => go("mhe-training", "/app/setup/mhe-training")}
            role="button"
            tabIndex={0}
            title={isCollapsed ? "MHE training" : undefined}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("mhe-training", "/app/setup/mhe-training")}
          >
            <span className="wi-nav__label">MHE training</span>
          </div>

        <Divider />

        {/* SETTINGS */}
        <DropdownHeader
          title="Settings"
          open={!!effectiveSectionsOpen?.settings}
          onToggle={() => toggleSection("settings")}
          collapsed={isCollapsed}
        />

        <div className={`${effectiveSectionsOpen?.settings ? "" : "hidden"}`}>
          <div
            className={`wi-nav__link ${active === "users" ? "active" : ""} ${
              isCollapsed ? "is-collapsed" : ""
            }`}
            onClick={() => go("users", "/app/users")}
            role="button"
            tabIndex={0}
            title={isCollapsed ? "Users" : undefined}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("users", "/app/users")}
          >
            <span className="wi-nav__label">Users</span>
          </div>

          <div
            className={`wi-nav__link ${active === "password" ? "active" : ""} ${
              isCollapsed ? "is-collapsed" : ""
            }`}
            onClick={() => go("password", "/app/password")}
            role="button"
            tabIndex={0}
            title={isCollapsed ? "Password reset" : undefined}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("password", "/app/password")}
          >
            <span className="wi-nav__label">Password reset</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
