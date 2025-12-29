// /src/components/SideNav.jsx
import "./sidenav.css";
import React from "react";
import { useNavigate } from "react-router-dom";

function Divider() {
  return <div className="wi-nav__divider" />;
}

function SectionTitle({ children }) {
  return <div className="wi-nav__sectionTitle">{children}</div>;
}

function DropdownHeader({ title, open, onToggle }) {
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") onToggle?.();
  };

  return (
    <div
      className="wi-nav__dropdownHeader"
      onClick={onToggle}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      aria-expanded={open ? "true" : "false"}
    >
      <span className="wi-nav__sectionTitle" style={{ marginBottom: 0 }}>
        {title}
      </span>
      <span className="wi-nav__arrow">{open ? "▾" : "▸"}</span>
    </div>
  );
}

export function SideNav({ active, onSelect, sectionsOpen, onToggleSection }) {
  const navigate = useNavigate();

  // Single helper: keeps existing behaviour but ALSO navigates
  const go = (key, path) => {
    if (typeof onSelect === "function") onSelect(key);
    if (path) navigate(path);
  };

  return (
    <nav>
      <SectionTitle>Navigation</SectionTitle>

      {/* Overview */}
      <div
        className={`wi-nav__item ${active === "overview" ? "active" : ""}`}
        onClick={() => go("overview", "/app/dashboard")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) =>
          (e.key === "Enter" || e.key === " ") &&
          go("overview", "/app/dashboard")
        }
      >
        Overview
      </div>

      <Divider />

      {/* SETUP */}
      <DropdownHeader
        title="Setup"
        open={!!sectionsOpen?.setup}
        onToggle={() => onToggleSection?.("setup")}
      />

      <div className={`${sectionsOpen?.setup ? "" : "hidden"}`}>
        <div
          className={`wi-nav__link ${
            active === "company-site-setup" ? "active" : ""
          }`}
          onClick={() =>
            go("company-site-setup", "/app/setup/companies-sites")
          }
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") &&
            go("company-site-setup", "/app/setup/companies-sites")
          }
        >
          Company &amp; site setup
        </div>

        <div
          className={`wi-nav__link ${
            active === "mhe-setup" ? "active" : ""
          }`}
          onClick={() => go("mhe-setup", "/app/setup/mhe")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") &&
            go("mhe-setup", "/app/setup/mhe")
          }
        >
          MHE setup
        </div>

        <div
          className={`wi-nav__link ${
            active === "connections" ? "active" : ""
          }`}
          onClick={() => go("connections", "/app/connections")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") &&
            go("connections", "/app/connections")
          }
        >
          Data Connections
        </div>
      </div>

      <Divider />

      {/* TOOLS */}
      <DropdownHeader
        title="Tools"
        open={!!sectionsOpen?.tools}
        onToggle={() => onToggleSection?.("tools")}
      />

      <div className={`${sectionsOpen?.tools ? "" : "hidden"}`}>
        <div
          className={`wi-nav__link ${
            active === "scheduling-tool" ? "active" : ""
          }`}
          onClick={() =>
            go("scheduling-tool", "/app/tools/scheduling")
          }
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") &&
            go("scheduling-tool", "/app/tools/scheduling")
          }
        >
          Scheduling tool
        </div>
      </div>

      <Divider />

      {/* SETTINGS */}
      <DropdownHeader
        title="Settings"
        open={!!sectionsOpen?.settings}
        onToggle={() => onToggleSection?.("settings")}
      />

      <div className={`${sectionsOpen?.settings ? "" : "hidden"}`}>
        <div
          className={`wi-nav__link ${active === "users" ? "active" : ""}`}
          onClick={() => go("users", "/app/users")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") &&
            go("users", "/app/users")
          }
        >
          Users
        </div>

        <div
          className={`wi-nav__link ${
            active === "password" ? "active" : ""
          }`}
          onClick={() => go("password", "/app/password")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") &&
            go("password", "/app/password")
          }
        >
          Password reset
        </div>
      </div>
    </nav>
  );
}
