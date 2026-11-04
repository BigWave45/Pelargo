import React from "react";

export function PelargoBird({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pelargo-brand-bird"
      aria-hidden="true"
    >
      {/* Minimal bird in flight formed by two serene curves */}
      <path d="M3 13c5-6 10-6 18-3" />
      <path d="M6 14c4-3 7-3 12 1" />
    </svg>
  );
}

export function PelargoFooter() {
  return (
    <footer className="pelargo-footer">
      <span className="pelargo-wordmark">
        pelargo
        <PelargoBird size={14} />
      </span>
      <span>•</span>
      <span>Built on Intents</span>
    </footer>
  );
}
