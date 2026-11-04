import React from "react";
import { DollarSign, ArrowUpRight, ShieldCheck, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { SettlementRecord } from "../mock/data.ts";

interface MerchantDashboardProps {
  settlements: SettlementRecord[];
}

export function MerchantDashboard({ settlements }: MerchantDashboardProps) {
  const totalVolume = settlements.reduce((sum, s) => {
    const val = parseFloat(s.amountReceived.replace(" USDC", "")) || 0;
    return sum + val;
  }, 0);

  const totalFees = settlements.reduce((sum, s) => {
    const val = parseFloat(s.feeUsdc.replace(" USDC", "")) || 0;
    return sum + val;
  }, 0);

  return (
    <div className="merchant-dash-container">
      {/* Metrics Row */}
      <div className="merchant-metrics-grid">
        <div className="merchant-metric-card">
          <span className="merchant-metric-label">Settled Gross Volume</span>
          <div className="merchant-metric-value">
            <span>${totalVolume.toFixed(2)}</span>
            <span className="merchant-metric-currency">USDC</span>
          </div>
          <span className="merchant-metric-sub">Direct to merchant on Base</span>
        </div>

        <div className="merchant-metric-card">
          <span className="merchant-metric-label">Total Intent Settlements</span>
          <div className="merchant-metric-value">{settlements.length}</div>
          <span className="merchant-metric-sub">100% fill rate across 5 chains</span>
        </div>

        <div className="merchant-metric-card">
          <span className="merchant-metric-label">Payout Configuration</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginTop: "var(--space-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
              <span className="merchant-badge-active">Base Mainnet</span>
              <span className="merchant-badge-active">USDC</span>
            </div>
            <code style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>0x892cA...32f1</code>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="merchant-ledger-card">
        <div className="merchant-ledger-header">
          <div>
            <h2 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>
              Live Intent Settlement Ledger
            </h2>
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
              Real-time settlement stream filled by decentralized intent solvers
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <span className="merchant-live-dot" aria-hidden="true" />
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--success)", fontWeight: "var(--fw-semibold)" }}>
              Live Gateway Active
            </span>
          </div>
        </div>

        <div className="merchant-table-wrap">
          <table className="merchant-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Time</th>
                <th>Buyer Paid</th>
                <th>Source Chain</th>
                <th>You Received</th>
                <th>Status</th>
                <th>Explorer</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((tx) => (
                <tr key={tx.id}>
                  <td style={{ fontWeight: "var(--fw-semibold)" }}>{tx.orderId}</td>
                  <td style={{ color: "var(--muted)" }}>{tx.timestamp}</td>
                  <td>{tx.amountPaid}</td>
                  <td>
                    <span className="merchant-chain-pill">{tx.buyerChain}</span>
                  </td>
                  <td style={{ fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>
                    {tx.amountReceived}
                  </td>
                  <td>
                    <span className="merchant-status-pill">
                      <CheckCircle2 size={12} />
                      <span>Settled</span>
                    </span>
                  </td>
                  <td>
                    <a
                      href={tx.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="merchant-link"
                      title="View on block explorer"
                    >
                      <span>{tx.txHash}</span>
                      <ExternalLink size={12} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
