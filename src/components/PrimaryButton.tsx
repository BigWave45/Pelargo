import React from "react";

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  isLoading?: boolean;
}

export function PrimaryButton({
  children,
  isLoading = false,
  disabled = false,
  className = "",
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      type="button"
      className={`pelargo-primary-btn ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading ? <span className="pelargo-btn-spinner" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}
