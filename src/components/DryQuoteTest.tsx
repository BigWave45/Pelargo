import React, { useState } from "react";

const TEST_ADDRESS = "0x91c96b519159d165d15807037f1ac723b086a1b2";

const TEST_PAYLOAD = {
  dry: true,
  swapType: "EXACT_INPUT",
  originAsset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
  destinationAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  amount: "1000000",
  recipient: TEST_ADDRESS,
  refundTo: TEST_ADDRESS,
  slippageTolerance: 100,
};

type QuoteResult = { status: number; ok: boolean; body: unknown };

export function DryQuoteTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setResult(null);
    setNetworkError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(TEST_PAYLOAD),
        signal: controller.signal,
      });
      const raw = await response.text();
      let body: unknown = raw;
      try { body = raw ? JSON.parse(raw) : null; } catch { /* Keep plain-text responses visible. */ }
      setResult({ status: response.status, ok: response.ok, body });
    } catch (error) {
      setNetworkError(error instanceof Error
        ? (error.name === "AbortError" ? "The request timed out after 30 seconds. Try again." : error.message)
        : "The request failed before a response was received.");
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="dry-quote-test-title" style={{
      maxWidth: 920, margin: "28px auto", padding: 22,
      border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
      background: "var(--surface)", color: "var(--text)"
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <p style={{ margin: "0 0 6px", color: "var(--muted)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>Backend connectivity check</p>
          <h2 id="dry-quote-test-title" style={{ margin: 0, fontSize: 19, fontWeight: 650 }}>NEAR Intents dry quote test</h2>
        </div>
        <button type="button" onClick={runTest} disabled={loading} className="pelargo-primary-btn" style={{ minWidth: 170, opacity: loading ? 0.65 : 1 }}>
          {loading ? "Requesting quote…" : "Run 1 USDC test"}
        </button>
      </div>
      <p style={{ margin: "14px 0 8px", color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
        Requests a preview for 1 USDC on Arbitrum to USDC on Base. It uses the supplied public EVM address as recipient and refund address.
      </p>
      <p style={{ margin: "0 0 14px", color: "var(--success)", fontSize: 12, lineHeight: 1.5 }}>
        Safety: dry-run only. This request cannot create a deposit address or move funds.
      </p>
      {networkError && <div role="alert" style={{ padding: 12, borderRadius: 8, background: "var(--surface-2)", color: "var(--text)", fontSize: 13 }}>Request error: {networkError}</div>}
      {result && <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13, fontWeight: 650 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: result.ok ? "var(--success)" : "var(--danger, #d45b5b)" }} />
          HTTP {result.status} · {result.ok ? "Request accepted" : "Request returned an error"}
        </div>
        <pre style={{ margin: 0, padding: 14, maxHeight: 360, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", borderRadius: 8, background: "var(--surface-2)", color: "var(--text)", fontSize: 12, lineHeight: 1.55 }}>
          {typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2)}
        </pre>
      </div>}
    </section>
  );
}
