import React from "react";
import { Check, ExternalLink } from "lucide-react";
import { AmountRow } from "./AmountRow.tsx";

interface ReceiptProps {
  amountPaid: string;
  amountReceived: string;
  orderId: string;
  txHash?: string;
  explorerUrl?: string;
  onDone: () => void;
}

export function Receipt({
  amountPaid,
  amountReceived,
  orderId,
  txHash = "0x8f2c...4d91",
  explorerUrl,
  onDone,
}: ReceiptProps) {
  return (
    <div className="pelargo-receipt">
      <div className="pelargo-receipt-icon-wrap" aria-hidden="true">
        <Check size={32} strokeWidth={2.5} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        <h2 className="pelargo-receipt-title">Payment complete</h2>
        <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
          Your order has been placed with the merchant
        </p>
      </div>

      <div className="pelargo-receipt-details">
        <AmountRow label="Order ID" value={orderId} />
        <AmountRow label="You paid" value={amountPaid} />
        <AmountRow label="They receive" value={amountReceived} />
      </div>

      <a
        href={explorerUrl || "#tx"}
        target={explorerUrl ? "_blank" : undefined}
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!explorerUrl) e.preventDefault();
        }}
        className="pelargo-tx-link"
        aria-label={`View transaction ${txHash}`}
      >
        <span>View transaction {txHash}</span>
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  );
}
