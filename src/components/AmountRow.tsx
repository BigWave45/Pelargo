import React from "react";

interface AmountRowProps {
  label: string;
  value: string;
  variant?: "normal" | "total";
}

export function AmountRow({ label, value, variant = "normal" }: AmountRowProps) {
  return (
    <div className={`pelargo-amount-row pelargo-amount-row--${variant}`}>
      <span className="pelargo-amount-label">{label}</span>
      <span className="pelargo-amount-value">{value}</span>
    </div>
  );
}
