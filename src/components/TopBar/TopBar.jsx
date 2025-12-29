import "./topbar.css";

export function TopBar({ email, onSignOut }) {
  return (
    <header className="wi-header">
      <div className="wi-header__inner">
        <div className="wi-brand">
          Warehouse <span>Intelligence</span>
        </div>

        <div className="wi-userinfo">
          <span className="wi-userinfo__email">{email || ""}</span>
          <button className="wi-signout" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
