import React from "react";
import { Outlet } from "react-router-dom";
import PublicHeader from "./PublicHeader.jsx";
import PublicFooter from "./PublicFooter.jsx";
import "../styles/public.css";

export default function PublicLayout() {
  return (
    <div className="pub-shell">
      <PublicHeader />
      <main className="pub-main">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
