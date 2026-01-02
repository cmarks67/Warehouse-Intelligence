import "./topbar.css";

function MenuIcon({ open }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      {open ? (
        <path
          d="M5 5l10 10M15 5L5 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M3 5h14M3 10h14M3 15h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function TopBar({ email, accountId, onSignOut, onMenuClick, menuOpen }) {
  const full = accountId ? String(accountId) : "";
  const short = full ? full.slice(-8) : "—";

  return (
    <header className="wi-header">
      <div className="wi-header__inner">
        <div className="wi-brandRow">
          {typeof onMenuClick === "function" && (
            <button
              type="button"
              className="wi-menuBtn"
              onClick={onMenuClick}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              title={menuOpen ? "Close menu" : "Menu"}
            >
              <MenuIcon open={!!menuOpen} />
            </button>
          )}

          <div className="wi-brand">
            Warehouse <span>Intelligence</span>
          </div>
        </div>

        <div className="wi-userinfo">
          <div className="wi-userinfo__details">
            <span className="wi-userinfo__email">{email || ""}</span>

            <span
              className={`wi-userinfo__account ${full ? "" : "wi-userinfo__account--empty"}`}
              data-full-id={full || ""}
              title={full || ""}
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
