// /src/lib/appNav.js
// Single source of truth for authenticated navigation + sitemap.
// NOTE: keep this "data only" (no JSX/icons) so it can be reused safely.

export const APP_NAV = {
  navigation: [
    {
      key: "overview",
      label: "Overview",
      to: "/app/dashboard",
      paths: ["/app", "/app/dashboard", "/app/overview"],
    },
  ],
  setup: [
    {
      key: "company-site-setup",
      label: "Company & site setup",
      to: "/app/setup/companies-sites",
      paths: ["/app/setup/companies-sites", "/app/companies-sites"],
    },
    {
      key: "colleagues-setup",
      label: "Colleagues",
      to: "/app/setup/colleagues",
      paths: ["/app/setup/colleagues", "/app/colleagues"],
    },
    {
      key: "mhe-setup",
      label: "MHE setup",
      to: "/app/setup/mhe",
      paths: ["/app/setup/mhe", "/app/mhe", "/app/setup/mhe-setup", "/app/setup/mhe-setup/"],
    },
    {
      key: "connections",
      label: "Data Connections",
      to: "/app/connections",
      paths: ["/app/connections", "/app/data-connections", "/app/setup/connections"],
    },
  ],
  tools: [
    {
      key: "scheduling-tool",
      label: "Scheduling tool",
      to: "/app/tools/scheduling",
      paths: ["/app/tools/scheduling", "/app/scheduling", "/app/tools/scheduling-tool", "/app/tools/scheduling/"],
    },
    {
      key: "mhe-training",
      label: "MHE training records",
      to: "/app/setup/mhe-training",
      paths: ["/app/setup/mhe-training", "/app/mhe-training", "/app/tools/mhe-training", "/app/setup/mhe-training/"],
    },
  ],
  settings: [
    { key: "users", label: "Users", to: "/app/users", paths: ["/app/users"] },
    { key: "password", label: "Password reset", to: "/app/password", paths: ["/app/password"] },
  ],
};
