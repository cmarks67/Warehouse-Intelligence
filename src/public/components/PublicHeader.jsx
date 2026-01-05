import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { publicRoutes, publicAccountLinks } from "../publicRoutes";
import "../styles/public.css";

export default function PublicHeader() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [loc.pathname, loc.search]);

  const navItems = useMemo(
    () => publicRoutes.filter((r) => r.path !== "/sitemap"),
    []
  );

  const isActive = (path) => loc.pathname === path;

  const loginPath = publicAccountLinks.find((x) => x.label.toLowerCase().includes("log"))?.path || "/login";
  const signupPath = publicAccountLinks.find((x) => x.label.toLowerCase().includes("sign"))?.path || "/login?tab=signup";

  return (
    <header className="pub-header">
      <div className="pub-header__inner">
        {/* Burger LEFT (matches internal mobile layout) */}
        <button
          type="button"
          className="pub-burger"
          aria-label="Open menu"
          aria-expanded={open ? "true" : "false"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="pub-burger__lines" />
        </button>

        <Link className="pub-brand" to="/" aria-label="Warehouse Intelligence home">
  {/* Desktop/full */}
  <span className="pub-brand__full">
    <span className="pub-brand__word">Warehouse</span>{" "}
    <span className="pub-brand__word pub-brand__accent">Intelligence</span>
  </span>

  {/* Mobile/compact: W black, I blue */}
  <span className="pub-brand__compact" aria-hidden="true">
    <span className="pub-brand__compactW">W</span>
    <span className="pub-brand__compactI">I</span>
  </span>
</Link>


        {/* Right-side actions stay visible (even when desktop nav collapses) */}
        <div className="pub-actionsRight">
          <Link to={signupPath} className="pub-toplink">
            Sign up
          </Link>
          <Link to={loginPath} className="pub-nav__cta">
            Log in
          </Link>
        </div>

        {/* Full desktop nav (appears on wider screens) */}
        <nav className="pub-nav pub-nav--desktop" aria-label="Public navigation">
          {navItems.map((r) => (
            <Link
              key={r.path}
              to={r.path}
              className={`pub-nav__link ${isActive(r.path) ? "is-active" : ""}`}
            >
              {r.label}
            </Link>
          ))}
          <Link to="/sitemap" className={`pub-nav__link ${isActive("/sitemap") ? "is-active" : ""}`}>
            Sitemap
          </Link>
        </nav>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="pub-drawer" role="dialog" aria-label="Mobile menu">
          <div className="pub-drawer__inner">
            {navItems.map((r) => (
              <Link
                key={r.path}
                to={r.path}
                className={`pub-drawer__link ${isActive(r.path) ? "is-active" : ""}`}
              >
                {r.label}
              </Link>
            ))}

            <Link to="/sitemap" className="pub-drawer__link">
              Sitemap
            </Link>

            <Link to={signupPath} className="pub-drawer__link">
              Sign up
            </Link>

            <Link to={loginPath} className="pub-nav__cta pub-nav__cta--mobile">
              Log in
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
