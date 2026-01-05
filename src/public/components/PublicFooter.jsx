import React from "react";
import { Link } from "react-router-dom";
import { publicRoutes } from "../publicRoutes";
import "../styles/public.css";

export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="pub-footer">
      <div className="pub-container pub-footer__inner">
        <div className="pub-footer__left">
          <div className="pub-footer__brand">Warehouse Intelligence</div>
          <div className="pub-footer__small">
            Operational tools, compliance, and analytics for warehouse teams.
          </div>
        </div>

        <div className="pub-footer__right">
          <div className="pub-footer__links">
            {publicRoutes
              .filter((r) => r.path !== "/")
              .map((r) => (
                <Link key={r.path} to={r.path} className="pub-footer__link">
                  {r.label}
                </Link>
              ))}
            <Link to="/login" className="pub-footer__link">
              Log in
            </Link>
          </div>
          <div className="pub-footer__small">© {year} WI</div>
        </div>
      </div>
    </footer>
  );
}
