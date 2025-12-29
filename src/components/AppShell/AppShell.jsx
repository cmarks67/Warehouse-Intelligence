import "./appshell.css";

export function AppShell({ sidebar, children }) {
  return (
    <main className="wi-main">
      <div className="wi-layout">
        <aside className="wi-sidebar">{sidebar}</aside>
        <section className="wi-content">{children}</section>
      </div>
    </main>
  );
}
