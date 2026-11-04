import React, { useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck, Zap } from "lucide-react";
import { PayOption as PayOptionType } from "../mock/data.ts";

interface IntentRouteInspectorProps {
  option: PayOptionType;
  orderTotalUsdc: number;
}

export function IntentRouteInspector({ option, orderTotalUsdc }: IntentRouteInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="pelargo-route-inspector">
      <button
        type="button"
        className="pelargo-route-header-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Zap size={14} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>
            Intent Solver Route (0% Slippage)
          </span>
        </div>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isOpen ? (
        <div className="pelargo-route-body">
          <div className="pelargo-route-step-item">
            <span className="pelargo-route-badge">1</span>
            <div className="pelargo-route-step-desc">
              <strong>Source Deposit</strong>
              <span>You send {option.symbol} directly to the solver vault on {option.chain}.</span>
            </div>
          </div>

          <div className="pelargo-route-step-item">
            <span className="pelargo-route-badge">2</span>
            <div className="pelargo-route-step-desc">
              <strong>Guaranteed Intent Fill</strong>
              <span>Solver network locks guaranteed exchange rate. No AMM price impact or MEV.</span>
            </div>
          </div>

          <div className="pelargo-route-step-item">
            <span className="pelargo-route-badge">3</span>
            <div className="pelargo-route-step-desc">
              <strong>Merchant Settlement</strong>
              <span>Merchant receives {orderTotalUsdc.toFixed(2)} USDC on Base instantly.</span>
            </div>
          </div>

          <div className="pelargo-route-assurance">
            <ShieldCheck size={14} style={{ color: "var(--success)" }} />
            <span>Non-custodial: Pelargo never pools or holds user funds.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
