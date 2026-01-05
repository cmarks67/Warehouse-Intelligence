// /src/components/SiteMapFooter/SiteMapFooter.jsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./SiteMapFooter.css";
import { APP_NAV } from "../../lib/appNav";

function normalizePath(p) {
  return (p || "").replace(/\/+$/, "") || "/";
}

function isActivePath(currentPath, paths) {
  const cur = normalizePath(currentPath);
  for (const p of paths || []) {
    const norm = normalizePath(p);
    if (!norm) continue;
    if (cur === norm || cur.startsWith(norm + "/") || cur.startsWith(norm)) return true;
  }
  return false;
}

function Section({ title, items, onGo, currentPath }) {
  return (
    <div className="wi-sitemap__col">
      <div className="wi-sitemap__title">{title}</div>

      <ul className="wi-sitemap__list">
        {(items || []).map((it) => {
          const active = isActivePath(currentPath, it.paths);
          return (
            <li key={it.key} className="wi-sitemap__item">
              <button
                type="button"
                className={`wi-sitemap__link ${active ? "is-active" : ""}`}
                onClick={() => onGo(it.to)}
                title={it.label}
              >
                {it.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SiteMapFooter() {
  const navigate = useNavigate();
  const location = useLocation();

  const year = useMemo(() => new Date().getFullYear(), []);

  const onGo = (to) => {
    if (!to) return;
    navigate(to);
    // optional: ensure user lands at top on navigation from footer
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="wi-sitemap" aria-label="Sitemap">
      <div className="wi-sitemap__inner">
        <div className="wi-sitemap__header">
          <div className="wi-sitemap__heading">Sitemap</div>
          <div className="wi-sitemap__meta">Warehouse Intelligence • © {year}</div>
        </div>

        <div className="wi-sitemap__grid">
          <Section title="Navigation" items={APP_NAV.navigation} onGo={onGo} currentPath={location.pathname} />
          <Section title="Setup" items={APP_NAV.setup} onGo={onGo} currentPath={location.pathname} />
          <Section title="Tools" items={APP_NAV.tools} onGo={onGo} currentPath={location.pathname} />
          <Section title="Settings" items={APP_NAV.settings} onGo={onGo} currentPath={location.pathname} />
        </div>
      </div>
    </footer>
  );
}
