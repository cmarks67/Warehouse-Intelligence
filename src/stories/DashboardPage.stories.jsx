import { AppLayout } from "../components/AppLayout/AppLayout";
import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";

export default { title: "Pages/Dashboard" };

export const Default = () => (
  <AppLayout activeNav="overview" onSelectNav={() => {}}>
    <Card title="Account" subtitle="Account ID:">
      All users and tools are scoped to this account.
    </Card>

    <Card
      title="Equipment alerts"
      subtitle="Overdue and due within 30 days (earliest of Inspection / LOLER / Service / PUWER)."
      actions={
        <div style={{ display: "flex", gap: ".5rem" }}>
          <Button variant="secondary">Reload</Button>
          <Button variant="primary">Open MHE setup</Button>
        </div>
      }
    >
      <div style={{ color: "var(--wi-text-muted)" }}>Loading...</div>
    </Card>

    <Card
      title="Scheduling tool"
      subtitle="Plan MHE and labour, track indirect time, and compare plan vs actual by shift."
    >
      <Button variant="primary">Open scheduling tool</Button>
    </Card>
  </AppLayout>
);
