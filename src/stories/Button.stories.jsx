import { Button } from "../components/Button/Button";

export default {
  title: "Core/Button",
  component: Button,
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "danger"],
    },
  },
};

export const Primary = {
  args: {
    variant: "primary",
    children: "Warehouse Intelligence",
  },
};

export const Secondary = {
  args: {
    variant: "secondary",
    children: "Secondary",
  },
};

export const Danger = {
  args: {
    variant: "danger",
    children: "Danger",
  },
};
