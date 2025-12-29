import { PageFrame } from "../components/PageFrame/PageFrame";
import { Card } from "../components/Card/Card";

export default {
  title: "Layout/PageFrame",
  component: PageFrame,
};

export const Example = () => (
  <PageFrame>
    <Card title="PageFrame working">Your layout now has consistent spacing.</Card>
  </PageFrame>
);
