import "./toolbar.css";

export function TopBar({ title, subtitle, right }) {
  return (
    <header className="wi-topbar">
      <div className="wi-topbar__inner">
        <div className="wi-topbar__brand">
          Warehouse <span>Intelligence</span>
        </div>

        <div className="wi-topbar__titles">
          <div className="wi-topbar__title">{title}</div>
          {subtitle && <div className="wi-topbar__subtitle">{subtitle}</div>}
        </div>

        <div className="wi-topbar__right">{right}</div>
      </div>
    </header>
  );
}
