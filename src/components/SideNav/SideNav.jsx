// /src/components/SideNav/SideNav.jsx
import "./sidenav.css";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/* ---------- localStorage keys ---------- */
const LS_NAV_COLLAPSED = "wi_nav_collapsed_v1";
const LS_NAV_PINNED = "wi_nav_pinned_v1";
const LS_NAV_SECTIONS = "wi_nav_sections_v1";

function lsGetBool(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}
function lsSetBool(key, value) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}
function lsGetJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
function lsSetJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/* ---------- small inline icons (no deps) ---------- */
function Svg({ children }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      {children}
    </svg>
  );
}

const Icons = {
  overview: (
    <Svg>
      <path d="M3 10h6V3H3v7Zm8 7h6V3h-6v14ZM3 17h6v-5H3v5Z" fill="currentColor" />
    </Svg>
  ),
  company: (
    <Svg>
      <path
        d="M3 17V4.5C3 3.7 3.7 3 4.5 3H12c.8 0 1.5.7 1.5 1.5V7h2c.8 0 1.5.7 1.5 1.5V17H3Zm2-2h2v-2H5v2Zm0-4h2V9H5v2Zm0-4h2V5H5v2Zm4 8h2v-2H9v2Zm0-4h2V9H9v2Zm0-4h2V5H9v2Zm4 8h2v-2h-2v2Zm0-4h2V9h-2v2Z"
        fill="currentColor"
      />
    </Svg>
  ),
  colleagues: (
    <Svg>
      <path
        d="M7 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm6 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM2.8 17c.4-2.7 2.6-4.5 5.2-4.5s4.8 1.8 5.2 4.5H2.8Zm11.5 0c-.2-1.8-1.3-3.2-2.8-3.9.5-.3 1.1-.6 1.8-.6 2 0 3.5 1.3 3.7 4.5h-2.7Z"
        fill="currentColor"
      />
    </Svg>
  ),
  mhe: (
    <Svg>
      <path d="M6 3h8v3h2v4h-2v7H6v-7H4V6h2V3Zm2 3h4V5H8v1Zm0 9h4v-3H8v3Z" fill="currentColor" />
    </Svg>
  ),
  connections: (
    <Svg>
      <path
        d="M6.5 7.5a3 3 0 0 1 3-3H12v2H9.5a1 1 0 0 0 0 2H12v2H9.5a3 3 0 0 1-3-3Zm4 5H8v-2h2.5a1 1 0 0 0 0-2H8v-2h2.5a3 3 0 1 1 0 6Z"
        fill="currentColor"
      />
    </Svg>
  ),
  scheduling: (
    <Svg>
      <path
        d="M6 2v2H4.5C3.7 4 3 4.7 3 5.5V16.5C3 17.3 3.7 18 4.5 18H15.5c.8 0 1.5-.7 1.5-1.5V5.5C17 4.7 16.3 4 15.5 4H14V2h-2v2H8V2H6Zm9 6H5V6h10v2Zm-6 8H5v-2h4v2Zm6 0h-4v-2h4v2Zm0-4H5v-2h10v2Z"
        fill="currentColor"
      />
    </Svg>
  ),
  training: (
    <Svg>
      <path d="M4 4h12v12H4V4Zm2 2v8h8V6H6Zm9 1h1v7h-1V7Z" fill="currentColor" />
    </Svg>
  ),
  users: (
    <Svg>
      <path
        d="M10 10a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 10 10Zm-7 7c.6-3.5 3.6-5.5 7-5.5s6.4 2 7 5.5H3Z"
        fill="currentColor"
      />
    </Svg>
  ),
  password: (
    <Svg>
      <path
        d="M6 9V7a4 4 0 1 1 8 0v2h1c.6 0 1 .4 1 1v7c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1v-7c0-.6.4-1 1-1h1Zm2 0h4V7a2 2 0 1 0-4 0v2Z"
        fill="currentColor"
      />
    </Svg>
  ),
};

function Divider() {
  return <div className="wi-nav__divider" />;
}

function SectionTitle({ children, collapsed }) {
  return <div className={`wi-nav__sectionTitle ${collapsed ? "is-collapsed" : ""}`}>{children}</div>;
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

const NAV = {
  navigation: [
    { key: "overview", label: "Overview", icon: Icons.overview, to: "/app/dashboard", paths: ["/app", "/app/dashboard", "/app/overview"] },
  ],
  setup: [
    {
      key: "company-site-setup",
      label: "Company & site setup",
      icon: Icons.company,
      to: "/app/setup/companies-sites",
      paths: ["/app/setup/companies-sites", "/app/companies-sites"],
    },
    {
      key: "colleagues-setup",
      label: "Colleagues",
      icon: Icons.colleagues,
      to: "/app/setup/colleagues",
      paths: ["/app/setup/colleagues", "/app/colleagues"],
    },
    {
      key: "mhe-setup",
      label: "MHE setup",
      icon: Icons.mhe,
      to: "/app/setup/mhe",
      // include likely variants + nested routes
      paths: ["/app/setup/mhe", "/app/mhe", "/app/setup/mhe-setup", "/app/setup/mhe-setup/"],
    },
    {
      key: "connections",
      label: "Data Connections",
      icon: Icons.connections,
      to: "/app/connections",
      paths: ["/app/connections", "/app/data-connections", "/app/setup/connections"],
    },
  ],
  tools: [
    {
      key: "scheduling-tool",
      label: "Scheduling tool",
      icon: Icons.scheduling,
      to: "/app/tools/scheduling",
      // include likely variants + nested routes
      paths: ["/app/tools/scheduling", "/app/scheduling", "/app/tools/scheduling-tool", "/app/tools/scheduling/"],
    },
    {
      key: "mhe-training",
      label: "MHE training records",
      icon: Icons.training,
      to: "/app/setup/mhe-training",
      paths: ["/app/setup/mhe-training", "/app/mhe-training", "/app/tools/mhe-training", "/app/setup/mhe-training/"],
    },
  ],
  settings: [
    { key: "users", label: "Users", icon: Icons.users, to: "/app/users", paths: ["/app/users"] },
    { key: "password", label: "Password reset", icon: Icons.password, to: "/app/password", paths: ["/app/password"] },
  ],
};

function deriveActiveKey(pathname) {
  const path = (pathname || "").replace(/\/+$/, "") || "/";
  const all = [...NAV.navigation, ...NAV.setup, ...NAV.tools, ...NAV.settings];

  let best = { key: "", len: -1 };

  for (const item of all) {
    for (const p of item.paths) {
      const norm = (p || "").replace(/\/+$/, "");
      if (!norm) continue;

      if (path === norm || path.startsWith(norm + "/") || path.startsWith(norm)) {
        if (norm.length > best.len) best = { key: item.key, len: norm.length };
      }
    }
  }

  return best.key;
}

function sectionForActiveKey(activeKey) {
  if (!activeKey) return "";
  if (NAV.setup.some((i) => i.key === activeKey)) return "setup";
  if (NAV.tools.some((i) => i.key === activeKey)) return "tools";
  if (NAV.settings.some((i) => i.key === activeKey)) return "settings";
  return "navigation";
}

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M12.5 4.5 7.5 10l5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 4.5 12.5 10l-5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconPin({ filled }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M12.2 2.8c1 1 .8 2.2 0 3l-.7.7 3 3-.7.7-2.2 2.2v2.6l-1.2 1.2-1.2-1.2V12l-2.2-2.2-.7-.7 3-3-.7-.7c-.8-.8-1-2 .0-3 1.0-1 2.2-.8 3 0Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavRow({ item, activeKey, collapsed, onClick }) {
  const isActive = item.key === activeKey;

  return (
    <div
      className={`wi-nav__link ${isActive ? "active" : ""} ${collapsed ? "is-collapsed wi-nav__link--icon" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={collapsed ? item.label : undefined}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
    >
      {collapsed ? <span className="wi-nav__icon">{item.icon}</span> : <span className="wi-nav__label">{item.label}</span>}
    </div>
  );
}

export function SideNav({ sectionsOpen, onToggleSection, onCollapsedChange }) {
  const navigate = useNavigate();
  const location = useLocation();

  // init from storage so it survives page/app layout remounts
  const [collapsed, setCollapsed] = useState(() => lsGetBool(LS_NAV_COLLAPSED, false));
  const [pinnedOpen, setPinnedOpen] = useState(() => lsGetBool(LS_NAV_PINNED, false));

  // local section open state (only used if parent doesn't supply sectionsOpen)
  const [localSectionsOpen, setLocalSectionsOpen] = useState(() =>
    lsGetJson(LS_NAV_SECTIONS, { setup: true, tools: true, settings: true })
  );

  const effectiveSectionsOpen = sectionsOpen ?? localSectionsOpen;

  // persist state
  useEffect(() => lsSetBool(LS_NAV_COLLAPSED, collapsed), [collapsed]);
  useEffect(() => lsSetBool(LS_NAV_PINNED, pinnedOpen), [pinnedOpen]);
  useEffect(() => {
    if (!sectionsOpen) lsSetJson(LS_NAV_SECTIONS, localSectionsOpen);
  }, [localSectionsOpen, sectionsOpen]);

  const isCollapsed = collapsed && !pinnedOpen;

  // inform AppLayout so the content shifts left into reclaimed space
  useEffect(() => {
    if (typeof onCollapsedChange === "function") onCollapsedChange(isCollapsed);
  }, [isCollapsed, onCollapsedChange]);

  const toggleSection = (key) => {
    if (typeof onToggleSection === "function") return onToggleSection(key);
    setLocalSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // route-driven active
  const activeKey = useMemo(() => deriveActiveKey(location.pathname), [location.pathname]);

  // auto-open the section containing the active item (if uncontrolled)
  useEffect(() => {
    if (sectionsOpen) return;
    const sec = sectionForActiveKey(activeKey);
    if (!sec || sec === "navigation") return;
    setLocalSectionsOpen((prev) => (prev[sec] ? prev : { ...prev, [sec]: true }));
  }, [activeKey, sectionsOpen]);

  const go = (path) => {
    if (path) navigate(path);
  };

  const toggleCollapse = () => {
    if (pinnedOpen) return;
    setCollapsed((c) => !c);
  };

  const togglePin = () => {
    setPinnedOpen((p) => {
      const next = !p;
      if (next) setCollapsed(false); // pinned means always expanded
      return next;
    });
  };

  return (
    <nav className={`wi-navRoot ${isCollapsed ? "wi-navRoot--collapsed" : ""}`}>
      <div className="wi-nav__topBar">
        {!isCollapsed && (
          <div className="wi-nav__brand">
            Warehouse <span className="wi-nav__brandAccent">Intelligence</span>
          </div>
        )}

        <div className="wi-nav__controls">
          <button
            type="button"
            className={`wi-nav__iconBtn ${pinnedOpen ? "is-active" : ""}`}
            onClick={togglePin}
            aria-label={pinnedOpen ? "Unpin sidebar" : "Pin sidebar"}
            title={pinnedOpen ? "Unpin" : "Pin"}
          >
            <IconPin filled={pinnedOpen} />
          </button>

          <button
            type="button"
            className="wi-nav__iconBtn"
            onClick={toggleCollapse}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand" : pinnedOpen ? "Pinned" : "Collapse"}
            disabled={pinnedOpen}
          >
            {isCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
          </button>
        </div>
      </div>

      <div className="wi-nav__scroll">
        <SectionTitle collapsed={isCollapsed}>Navigation</SectionTitle>

        {NAV.navigation.map((item) => (
          <NavRow key={item.key} item={item} activeKey={activeKey} collapsed={isCollapsed} onClick={() => go(item.to)} />
        ))}

        <Divider />

        <DropdownHeader title="Setup" open={!!effectiveSectionsOpen?.setup} onToggle={() => toggleSection("setup")} collapsed={isCollapsed} />
        <div className={`${effectiveSectionsOpen?.setup ? "" : "hidden"}`}>
          {NAV.setup.map((item) => (
            <NavRow key={item.key} item={item} activeKey={activeKey} collapsed={isCollapsed} onClick={() => go(item.to)} />
          ))}
        </div>

        <Divider />

        <DropdownHeader title="Tools" open={!!effectiveSectionsOpen?.tools} onToggle={() => toggleSection("tools")} collapsed={isCollapsed} />
        <div className={`${effectiveSectionsOpen?.tools ? "" : "hidden"}`}>
          {NAV.tools.map((item) => (
            <NavRow key={item.key} item={item} activeKey={activeKey} collapsed={isCollapsed} onClick={() => go(item.to)} />
          ))}
        </div>

        <Divider />

        <DropdownHeader title="Settings" open={!!effectiveSectionsOpen?.settings} onToggle={() => toggleSection("settings")} collapsed={isCollapsed} />
        <div className={`${effectiveSectionsOpen?.settings ? "" : "hidden"}`}>
          {NAV.settings.map((item) => (
            <NavRow key={item.key} item={item} activeKey={activeKey} collapsed={isCollapsed} onClick={() => go(item.to)} />
          ))}
        </div>
      </div>
    </nav>
  );
}
