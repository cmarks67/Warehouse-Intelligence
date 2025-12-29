import { Card } from "../components/Card/Card";
import { Button } from "../components/Button/Button";

export default {
  title: "Core/Card",
  component: Card,
};

export const Basic = {
  args: {
    title: "KPI Summary",
    subtitle: "Today vs plan",
    actions: <Button variant="secondary">Export</Button>,
    children: (
      <div>
        <div>Lines picked: 12,450</div>
        <div>Accuracy: 99.6%</div>
      </div>
    ),
  },
};
