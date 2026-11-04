import React from "react";

interface TokenBadgeProps {
  tokenSymbol: string;
  chainName: string;
}

export function TokenBadge({ tokenSymbol, chainName }: TokenBadgeProps) {
  // Render minimalist SVG token glyphs
  const renderTokenGlyph = () => {
    switch (tokenSymbol.toUpperCase()) {
      case "ETH":
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L5 13.5L12 17.5L19 13.5L12 2Z" />
            <path d="M12 17.5L5 13.5L12 22L19 13.5L12 17.5Z" />
          </svg>
        );
      case "USDC":
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="9" />
            <path d="M14.5 9.5C14 8.5 12.8 8 11.5 8C9.6 8 8.5 9.2 8.5 10.7C8.5 13.5 15.5 12.2 15.5 15.2C15.5 16.7 14.2 18 12.5 18C10.8 18 9.5 17.2 9 16" />
            <path d="M12 6.5V8M12 18V19.5" />
          </svg>
        );
      case "SOL":
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 8.5L8.5 5H19L15.5 8.5H5Z" />
            <path d="M19 12L15.5 15.5H5L8.5 12H19Z" />
            <path d="M5 19L8.5 15.5H19L15.5 19H5Z" />
          </svg>
        );
      case "NEAR":
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 18V6L18 18V6" />
          </svg>
        );
      case "USDT":
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M7.5 9H16.5M12 9V17" />
          </svg>
        );
      default:
        return <span>{tokenSymbol.slice(0, 3)}</span>;
    }
  };

  const renderChainGlyph = () => {
    switch (chainName.toLowerCase()) {
      case "ethereum":
        return (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L6 13L12 16.5L18 13L12 2Z" />
          </svg>
        );
      case "base":
        return (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="7" />
          </svg>
        );
      case "solana":
        return (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 8h16l-4 3H0z" />
          </svg>
        );
      case "near":
        return (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <text x="3" y="18" fontSize="16" fontWeight="bold">N</text>
          </svg>
        );
      case "arbitrum":
        return (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12,3 21,19 3,19" />
          </svg>
        );
      default:
        return <span style={{ fontSize: "var(--fs-xs)" }}>●</span>;
    }
  };

  return (
    <div className="pelargo-token-avatar-wrap" aria-hidden="true">
      <div className="pelargo-token-icon">
        {renderTokenGlyph()}
      </div>
      <div className="pelargo-chain-badge" title={chainName}>
        {renderChainGlyph()}
      </div>
    </div>
  );
}
