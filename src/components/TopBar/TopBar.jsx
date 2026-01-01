import "./topbar.css";

export function TopBar({ email, accountId, onSignOut }) {
  const full = accountId ? String(accountId) : "";
  const short = full ? full.slice(-8) : "—";

  return (
    <header className="wi-header">
      <div className="wi-header__inner">
        <div className="wi-brand">
          Warehouse <span>Intelligence</span>
        </div>

        <div className="wi-userinfo">
          <div className="wi-userinfo__details">
            <span className="wi-userinfo__email">{email || ""}</span>

            <span
              className={`wi-userinfo__account ${full ? "" : "wi-userinfo__account--empty"}`}
              data-full-id={full || ""}
              title={full || ""}  /* extra fallback tooltip */
            >
              Account: {short}
            </span>
          </div>

          <button className="wi-signout" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
