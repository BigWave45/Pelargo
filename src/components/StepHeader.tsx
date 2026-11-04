import React from "react";
import { ArrowLeft, X, Store } from "lucide-react";

interface StepHeaderProps {
  title: string;
  merchantName: string;
  orderTotalText: string;
  merchantLogo?: React.ReactNode;
  onBack?: () => void;
  onClose: () => void;
  showBack?: boolean;
}

export function StepHeader({
  title,
  merchantName,
  orderTotalText,
  merchantLogo,
  onBack,
  onClose,
  showBack = false,
}: StepHeaderProps) {
  return (
    <header className="pelargo-header">
      <div className="pelargo-header-nav">
        <div className="pelargo-header-left">
          {showBack && onBack ? (
            <button
              type="button"
              className="pelargo-icon-btn"
              onClick={onBack}
              aria-label="Go back"
            >
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <h1 className="pelargo-header-title">{title}</h1>
        </div>

        <button
          type="button"
          className="pelargo-icon-btn"
          onClick={onClose}
          aria-label="Close modal"
        >
          <X size={18} />
        </button>
      </div>

      <div className="pelargo-merchant-strip" aria-label="Merchant details">
        <div className="pelargo-merchant-info">
          <div className="pelargo-merchant-logo" aria-hidden="true">
            {merchantLogo || <Store size={14} />}
          </div>
          <span className="pelargo-merchant-name">{merchantName}</span>
        </div>
        <span className="pelargo-merchant-total">{orderTotalText}</span>
      </div>
    </header>
  );
}
