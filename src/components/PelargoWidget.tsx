import React, { useState, useEffect } from "react";
import { ChevronRight, AlertCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { Modal } from "./Modal.tsx";
import { StepHeader } from "./StepHeader.tsx";
import { AmountRow } from "./AmountRow.tsx";
import { PayOption } from "./PayOption.tsx";
import { TokenPicker } from "./TokenPicker.tsx";
import { PrimaryButton } from "./PrimaryButton.tsx";
import { QuoteTimer } from "./QuoteTimer.tsx";
import { StatusTimeline, ProgressStepIndex } from "./StatusTimeline.tsx";
import { Receipt } from "./Receipt.tsx";
import { PelargoFooter } from "./BrandMark.tsx";
import {
  MOCK_ORDER,
  MOCK_PAY_OPTIONS,
  PayOption as PayOptionType,
  computeQuote,
} from "../mock/data.ts";

export type WidgetScreen =
  | "loading"
  | "summary"
  | "pick-token"
  | "confirm"
  | "progress"
  | "receipt"
  | "error-expired"
  | "error-failed";

export interface PelargoWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  accent?: string;
  logo?: React.ReactNode;
  initialScreen?: WidgetScreen;
  onScreenChange?: (screen: WidgetScreen) => void;
}

export function PelargoWidget({
  isOpen,
  onClose,
  accent,
  logo,
  initialScreen = "summary",
  onScreenChange,
}: PelargoWidgetProps) {
  const [currentScreen, setCurrentScreen] = useState<WidgetScreen>(initialScreen);
  const [selectedOption, setSelectedOption] = useState<PayOptionType>(MOCK_PAY_OPTIONS[0]);
  const [progressStep, setProgressStep] = useState<ProgressStepIndex>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [quoteKey, setQuoteKey] = useState(0);

  // Sync when initialScreen changes externally (e.g. from dev panel)
  useEffect(() => {
    setCurrentScreen(initialScreen);
  }, [initialScreen]);

  const setScreen = (screen: WidgetScreen) => {
    setCurrentScreen(screen);
    if (onScreenChange) {
      onScreenChange(screen);
    }
  };

  // If loading screen is mounted, simulate ~600ms load time
  useEffect(() => {
    if (currentScreen === "loading" && isOpen) {
      const timer = setTimeout(() => {
        setScreen("summary");
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentScreen, isOpen]);

  // Handle Progress screen mock auto-advancement every 2 seconds
  useEffect(() => {
    if (currentScreen !== "progress" || !isOpen) {
      setProgressStep(0);
      return;
    }

    const t1 = setTimeout(() => {
      setProgressStep(1);
    }, 2000);

    const t2 = setTimeout(() => {
      setProgressStep(2);
    }, 4000);

    const t3 = setTimeout(() => {
      setScreen("receipt");
    }, 6000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [currentScreen, isOpen]);

  const quote = computeQuote(selectedOption, MOCK_ORDER.orderTotal);
  const topOptions = MOCK_PAY_OPTIONS.slice(0, 3);
  const orderTotalDisplay = `${MOCK_ORDER.orderTotal.toFixed(2)} ${MOCK_ORDER.orderCurrency}`;

  // Handle attempt to close
  const handleAttemptClose = () => {
    if (currentScreen === "progress") {
      setShowExitConfirm(true);
      return;
    }
    setShowExitConfirm(false);
    onClose();
  };

  const confirmExit = () => {
    setShowExitConfirm(false);
    onClose();
  };

  const getStepTitle = (): string => {
    switch (currentScreen) {
      case "loading":
        return "Loading";
      case "summary":
        return "Pay";
      case "pick-token":
        return "Choose token";
      case "confirm":
        return "Review payment";
      case "progress":
        return "Processing payment";
      case "receipt":
        return "Receipt";
      case "error-expired":
        return "Quote expired";
      case "error-failed":
        return "Payment failed";
    }
  };

  // Inline custom merchant accent override if provided
  const customStyle: React.CSSProperties = accent ? ({ "--accent": accent } as React.CSSProperties) : {};

  return (
    <Modal isOpen={isOpen} onClose={handleAttemptClose} ariaLabel={getStepTitle()}>
      <div style={customStyle} className="pelargo-widget-root">
        <StepHeader
          title={getStepTitle()}
          merchantName={MOCK_ORDER.merchantName}
          orderTotalText={orderTotalDisplay}
          merchantLogo={logo}
          showBack={currentScreen === "pick-token" || currentScreen === "confirm"}
          onBack={() => {
            if (currentScreen === "pick-token") setScreen("summary");
            if (currentScreen === "confirm") setScreen("summary");
          }}
          onClose={handleAttemptClose}
        />

        <main className="pelargo-body">
          {/* Leaving confirmation dialog during active payment */}
          {showExitConfirm ? (
            <div className="pelargo-error-view" role="alert">
              <div className="pelargo-warning-icon">
                <AlertTriangle size={24} />
              </div>
              <h2 className="pelargo-error-title">Payment in progress</h2>
              <p className="pelargo-error-message">
                Your payment has already been sent to the network. If you exit now, settlement will still complete.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", width: "100%" }}>
                <PrimaryButton onClick={() => setShowExitConfirm(false)}>
                  Stay and wait
                </PrimaryButton>
                <button
                  type="button"
                  className="pelargo-secondary-btn"
                  onClick={confirmExit}
                >
                  Exit anyway
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Screen: Loading */}
              {currentScreen === "loading" && (
                <div className="pelargo-skeleton-wrap" aria-label="Loading payment options">
                  <div className="pelargo-skeleton-row" />
                  <div className="pelargo-skeleton-row" />
                  <div className="pelargo-skeleton-row" />
                </div>
              )}

              {/* Screen 1: Summary and choose */}
              {currentScreen === "summary" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    <span
                      style={{
                        fontSize: "var(--fs-xs)",
                        fontWeight: "var(--fw-semibold)",
                        color: "var(--muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Pay with
                    </span>

                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {topOptions.map((opt) => (
                        <PayOption
                          key={opt.id}
                          option={opt}
                          isSelected={opt.id === selectedOption.id}
                          onSelect={(chosen) => setSelectedOption(chosen)}
                        />
                      ))}

                      <button
                        type="button"
                        className="pelargo-pay-option"
                        onClick={() => setScreen("pick-token")}
                        aria-label="View more payment options"
                      >
                        <span style={{ fontSize: "var(--fs-sm)", color: "var(--text)" }}>
                          More options
                        </span>
                        <div className="pelargo-pay-option-right" aria-hidden="true">
                          <ChevronRight size={18} />
                        </div>
                      </button>
                    </div>
                  </div>

                  <PrimaryButton onClick={() => setScreen("confirm")}>
                    Continue
                  </PrimaryButton>
                </div>
              )}

              {/* Screen 2: Pick token */}
              {currentScreen === "pick-token" && (
                <TokenPicker
                  options={MOCK_PAY_OPTIONS}
                  selectedId={selectedOption.id}
                  onSelectOption={(chosen) => {
                    setSelectedOption(chosen);
                    setScreen("summary");
                  }}
                />
              )}

              {/* Screen 3: Confirm */}
              {currentScreen === "confirm" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  <QuoteTimer
                    key={quoteKey}
                    initialSeconds={42}
                    onExpire={() => setScreen("error-expired")}
                  />

                  <div
                    style={{
                      backgroundColor: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: "var(--space-3) var(--space-4)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-1)",
                    }}
                  >
                    <AmountRow label="You pay" value={quote.formattedYouPay} />
                    <AmountRow label="Fee (0.8%)" value={quote.formattedFee} />
                    <AmountRow label="They receive" value={quote.formattedReceive} />
                    <AmountRow label="Total" value={quote.formattedTotal} variant="total" />
                  </div>

                  <p
                    style={{
                      fontSize: "var(--fs-xs)",
                      color: "var(--muted)",
                      textAlign: "center",
                    }}
                  >
                    {quote.rateDescription}
                  </p>

                  <PrimaryButton
                    isLoading={isSubmitting}
                    onClick={() => {
                      setIsSubmitting(true);
                      setTimeout(() => {
                        setIsSubmitting(false);
                        setScreen("progress");
                      }, 500);
                    }}
                  >
                    {quote.payButtonText}
                  </PrimaryButton>
                </div>
              )}

              {/* Screen 4: Progress */}
              {currentScreen === "progress" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  <p
                    style={{
                      fontSize: "var(--fs-sm)",
                      color: "var(--muted)",
                      textAlign: "center",
                    }}
                  >
                    This usually takes under a minute.
                  </p>

                  <StatusTimeline currentStepIndex={progressStep} />
                </div>
              )}

              {/* Screen 5: Receipt */}
              {currentScreen === "receipt" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  <Receipt
                    amountPaid={quote.formattedTotal}
                    amountReceived={quote.formattedReceive}
                    orderId={MOCK_ORDER.orderId}
                    onDone={onClose}
                  />

                  <PrimaryButton onClick={onClose}>Done</PrimaryButton>
                </div>
              )}

              {/* Error State: Quote expired */}
              {currentScreen === "error-expired" && (
                <div className="pelargo-error-view" role="alert">
                  <div className="pelargo-warning-icon" aria-hidden="true">
                    <RefreshCw size={24} />
                  </div>
                  <h2 className="pelargo-error-title">Quote expired</h2>
                  <p className="pelargo-error-message">
                    Exchange rates have updated. Request a new quote to continue your payment.
                  </p>
                  <PrimaryButton
                    onClick={() => {
                      setQuoteKey((k) => k + 1);
                      setScreen("confirm");
                    }}
                  >
                    Get a new quote
                  </PrimaryButton>
                </div>
              )}

              {/* Error State: Failed */}
              {currentScreen === "error-failed" && (
                <div className="pelargo-error-view" role="alert">
                  <div className="pelargo-error-icon" aria-hidden="true">
                    <AlertCircle size={24} />
                  </div>
                  <h2 className="pelargo-error-title">Payment failed</h2>
                  <p className="pelargo-error-message">
                    Your funds are returned to your wallet.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", width: "100%" }}>
                    <PrimaryButton onClick={() => setScreen("confirm")}>
                      Try again
                    </PrimaryButton>
                    <button
                      type="button"
                      className="pelargo-secondary-btn"
                      onClick={() => setScreen("summary")}
                    >
                      Choose another token
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        <PelargoFooter />
      </div>
    </Modal>
  );
}
