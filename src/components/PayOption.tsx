import React from "react";
import { ChevronRight } from "lucide-react";
import { TokenBadge } from "./TokenBadge.tsx";
import { PayOption as PayOptionType, formatCryptoAmount } from "../mock/data.ts";

interface PayOptionProps {
  option: PayOptionType;
  isSelected?: boolean;
  onSelect: (option: PayOptionType) => void;
}

export function PayOption({ option, isSelected = false, onSelect }: PayOptionProps) {
  const formattedBalance = `${formatCryptoAmount(option.balance, option.decimals)} ${option.symbol}`;

  return (
    <button
      type="button"
      className={`pelargo-pay-option ${isSelected ? "pelargo-pay-option--selected" : ""}`}
      onClick={() => onSelect(option)}
      aria-pressed={isSelected}
      aria-label={`${option.name} on ${option.chain}, balance ${formattedBalance}`}
    >
      <div className="pelargo-pay-option-left">
        <TokenBadge tokenSymbol={option.symbol} chainName={option.chain} />
        <div className="pelargo-pay-option-info">
          <div className="pelargo-token-name">
            <span>{option.name}</span>
            <span className="pelargo-token-chain-tag">({option.chain})</span>
          </div>
          <div className="pelargo-token-balance">{formattedBalance} available</div>
        </div>
      </div>

      <div className="pelargo-pay-option-right" aria-hidden="true">
        <ChevronRight size={18} />
      </div>
    </button>
  );
}
