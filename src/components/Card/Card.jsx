import "./card.css";

export function Card({ title, subtitle, actions, children }) {
  return (
    <section className="wi-card">
      {(title || subtitle || actions) && (
        <header className="wi-card__header">
          <div className="wi-card__headings">
            {title && <h2 className="wi-card__title">{title}</h2>}
            {subtitle && <p className="wi-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="wi-card__actions">{actions}</div>}
        </header>
      )}

      <div className="wi-card__body">{children}</div>
    </section>
  );
}
