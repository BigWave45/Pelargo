import React, { useEffect, useState } from "react";

interface QuoteTimerProps {
  initialSeconds?: number;
  onExpire?: () => void;
  isPaused?: boolean;
}

export function QuoteTimer({ initialSeconds = 42, onExpire, isPaused = false }: QuoteTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    setSecondsLeft(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (isPaused) return;

    if (secondsLeft <= 0) {
      if (onExpire) {
        onExpire();
      }
      return;
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onExpire) onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsLeft, isPaused, onExpire]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const formattedTime = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  const isWarning = secondsLeft <= 10;

  return (
    <div
      className={`pelargo-quote-timer ${isWarning ? "pelargo-quote-timer--warning" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="pelargo-quote-timer-dot" aria-hidden="true" />
      <span>Quote valid for {formattedTime}</span>
    </div>
  );
}
