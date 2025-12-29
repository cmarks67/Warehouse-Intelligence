import "./button.css";

export function Button({ variant = "primary", children, ...props }) {
  return (
    <button className={`wi-btn wi-btn--${variant}`} {...props}>
      {children}
    </button>
  );
}
