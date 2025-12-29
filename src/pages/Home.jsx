import { Link } from "react-router-dom";
import "./home.css";

export function Home() {
  return (
    <div className="wi-home">
      {/* HEADER */}
      <header className="wi-home__header">
        <div className="wi-home__headerInner">
          <div className="wi-home__logoWrap">
            <div className="wi-home__logo">
              Warehouse <span className="wi-home__highlight">Intelligence</span>
            </div>
            <div className="wi-home__logoSubtitle">
              Practical tools for real-world warehouse operations.
            </div>
          </div>

          <div className="wi-home__headerCta">
            <Link to="/login" className="wi-home__btnOutline">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="wi-home__main">
        <div className="wi-home__container">
          {/* HERO */}
          <section className="wi-home__hero">
            <div>
              <div className="wi-home__eyebrow">Operational decision support</div>

              <h1 className="wi-home__title">Run your warehouse like a live control tower.</h1>

              <p className="wi-home__subtitle">
                Warehouse Intelligence brings your key planning tools into one place – starting with a live
                scheduling engine built for shift leads, planners and operations managers.
              </p>

              <div className="wi-home__ctaRow">
                <Link to="/login" className="wi-home__btnPrimary">
                  Log in / Register
                </Link>
                <a className="wi-home__btnGhost" href="#tools">
                  View tools overview
                </a>
              </div>

              <div className="wi-home__note">
                Designed by an operator, for operators. No fluff – just tools you can actually use on the floor.
              </div>
            </div>

            <aside className="wi-home__panel" aria-label="Current focus">
              <div className="wi-home__panelTitle">
                Current focus: <span className="wi-home__tag">Scheduling</span>
              </div>

              <ul className="wi-home__panelList">
                <li>
                  <span>Shift &amp; MHE planning</span>
                  <span>Live</span>
                </li>
                <li>
                  <span>Plan vs actual visibility</span>
                  <span>Live</span>
                </li>
                <li>
                  <span>User &amp; access levels</span>
                  <span>Live</span>
                </li>
                <li>
                  <span>Performance &amp; cost KPIs</span>
                  <span>In development</span>
                </li>
              </ul>
            </aside>
          </section>

          {/* TOOLS OVERVIEW */}
          <section id="tools">
            <h2 className="wi-home__sectionTitle">Tools overview</h2>
            <p className="wi-home__sectionSubtitle">
              Warehouse Intelligence will grow into a suite of tools. The first module – the scheduling
              tool – is live now, with more operational analytics to follow.
            </p>

            <div className="wi-home__toolsGrid">
              <article className="wi-home__toolCard">
                <div>
                  <div className="wi-home__toolTitle">Scheduling tool</div>
                  <div className="wi-home__toolDesc">
                    Build and adjust daily MHE and labour plans in minutes. See direct vs indirect hours,
                    plan vs actual, and costs at a glance.
                  </div>
                </div>
                <div>
                  <span className="wi-home__label wi-home__labelLive">Live</span>
                </div>
              </article>

              <article className="wi-home__toolCard">
                <div>
                  <div className="wi-home__toolTitle">Users &amp; access</div>
                  <div className="wi-home__toolDesc">
                    Secure access for your team. Set up business accounts, admin vs standard users, and
                    keep data ring-fenced by operation.
                  </div>
                </div>
                <div>
                  <span className="wi-home__label wi-home__labelLive">Live</span>
                </div>
              </article>

              <article className="wi-home__toolCard">
                <div>
                  <div className="wi-home__toolTitle">Performance &amp; cost insights</div>
                  <div className="wi-home__toolDesc">
                    Future modules will surface KPIs such as productivity, cost-per-unit, lane performance
                    and shift comparisons to close the loop from plan to outcome.
                  </div>
                </div>
                <div>
                  <span className="wi-home__label wi-home__labelSoon">Coming soon</span>
                </div>
              </article>
            </div>
          </section>
        </div>
      </main>

      <footer className="wi-home__footer">© 2025 Warehouse Intelligence. All rights reserved.</footer>
    </div>
  );
}
