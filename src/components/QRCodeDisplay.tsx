import React, { useState } from "react";
import { Copy, Check, QrCode } from "lucide-react";

interface QRCodeDisplayProps {
  address: string;
  amount: string;
  chainName: string;
}

export function QRCodeDisplay({ address, amount, chainName }: QRCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate deterministic grid pattern based on address characters
  const generatePattern = () => {
    const size = 11;
    const cells: boolean[][] = [];
    for (let r = 0; r < size; r++) {
      cells[r] = [];
      for (let c = 0; c < size; c++) {
        // Corner alignment boxes (standard QR markers)
        if (
          (r < 3 && c < 3) ||
          (r < 3 && c > size - 4) ||
          (r > size - 4 && c < 3)
        ) {
          cells[r][c] =
            r === 0 || r === 2 || c === 0 || c === 2 ||
            (r === 0 && c === size - 1) || (r === 2 && c === size - 3) ||
            (r === size - 1 && c === 0) || (r === size - 3 && c === 2);
        } else {
          const charCode = address.charCodeAt((r * size + c) % address.length) || 42;
          cells[r][c] = charCode % 2 === 0;
        }
      }
    }
    return cells;
  };

  const pattern = generatePattern();

  return (
    <div className="pelargo-qr-container">
      <div className="pelargo-qr-visual" aria-label={`QR code for deposit address on ${chainName}`}>
        <svg width="132" height="132" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          {pattern.map((row, r) =>
            row.map((active, c) => (
              <rect
                key={`${r}-${c}`}
                x={c}
                y={r}
                width="0.9"
                height="0.9"
                fill={active ? "var(--text)" : "var(--surface-2)"}
                rx="0.15"
              />
            ))
          )}
        </svg>
      </div>

      <div className="pelargo-qr-info">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Deposit address ({chainName})
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="pelargo-copy-btn"
            aria-label="Copy deposit address"
          >
            {copied ? (
              <>
                <Check size={12} style={{ color: "var(--success)" }} />
                <span style={{ color: "var(--success)" }}>Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <code className="pelargo-address-code" title={address}>
          {address.slice(0, 10)}...{address.slice(-8)}
        </code>

        <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
          Send exact amount: <strong style={{ color: "var(--text)" }}>{amount}</strong>
        </span>
      </div>
    </div>
  );
}
