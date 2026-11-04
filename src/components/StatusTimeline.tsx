import React from "react";
import { Check } from "lucide-react";

export type ProgressStepIndex = 0 | 1 | 2;

interface StatusTimelineProps {
  currentStepIndex: ProgressStepIndex;
}

const STEPS = [
  { id: 0, label: "Payment sent", subtext: "Signed from your wallet" },
  { id: 1, label: "Confirming", subtext: "Settling on chain" },
  { id: 2, label: "Delivered to merchant", subtext: "Funds delivered in full" },
];

export function StatusTimeline({ currentStepIndex }: StatusTimelineProps) {
  return (
    <div
      className="pelargo-timeline"
      role="region"
      aria-label="Payment progress status"
      aria-live="polite"
    >
      {STEPS.map((step, index) => {
        const isCompleted = index < currentStepIndex;
        const isActive = index === currentStepIndex;
        const isLast = index === STEPS.length - 1;

        return (
          <div key={step.id} className="pelargo-timeline-step">
            <div className="pelargo-timeline-node-wrap">
              <div
                className={`pelargo-timeline-dot ${
                  isCompleted
                    ? "pelargo-timeline-dot--completed"
                    : isActive
                    ? "pelargo-timeline-dot--active"
                    : ""
                }`}
                aria-hidden="true"
              >
                {isCompleted ? (
                  <Check size={13} strokeWidth={2.5} />
                ) : isActive ? (
                  <div
                    style={{
                      width: "var(--space-2)",
                      height: "var(--space-2)",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: "var(--accent)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "calc(var(--space-1) + 2px)",
                      height: "calc(var(--space-1) + 2px)",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: "var(--muted)",
                    }}
                  />
                )}
              </div>

              {!isLast ? (
                <div
                  className={`pelargo-timeline-line ${
                    isCompleted ? "pelargo-timeline-line--completed" : ""
                  }`}
                  aria-hidden="true"
                />
              ) : null}
            </div>

            <div className="pelargo-timeline-text">
              <span className="pelargo-timeline-label">{step.label}</span>
              <span className="pelargo-timeline-subtext">{step.subtext}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
