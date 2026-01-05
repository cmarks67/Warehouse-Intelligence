import React from "react";
import { Link } from "react-router-dom";
import { publicRoutes, publicAccountLinks } from "../publicRoutes";
import "../styles/public.css";

export default function PublicSitemap() {
  return (
    <div className="pub-page">
      <section className="pub-hero">
        <h1 className="pub-h1">Sitemap</h1>
        <p className="pub-lead">All public pages currently available on the site.</p>

        <div className="pub-sitemap">
          {/* Public pages */}
          {publicRoutes.map((r) => (
            <Link key={r.path} to={r.path} className="pub-sitemap__link">
              {r.label}
              <span className="pub-sitemap__path">{r.path}</span>
            </Link>
          ))}

          <div className="pub-sitemap__divider" />

          {/* Account access */}
          <div className="pub-sitemap__sectionTitle">Account access</div>

          {publicAccountLinks.map((l) => (
            <Link key={l.path} to={l.path} className="pub-sitemap__link">
              {l.label}
              <span className="pub-sitemap__path">{l.path}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
