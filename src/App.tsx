import React, { useState, useEffect } from "react";
import { Sun, Moon, ShoppingBag, Compass, Sparkles, Code2, Check, Copy } from "lucide-react";
import { PelargoWidget, WidgetScreen } from "./components/PelargoWidget.tsx";
import { PelargoBird } from "./components/BrandMark.tsx";
import { MOCK_ORDER } from "./mock/data.ts";

export default function App() {
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeScreen, setActiveScreen] = useState<WidgetScreen>("summary");
  const [customAccent, setCustomAccent] = useState<string | undefined>(undefined);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const jumpToScreen = (screen: WidgetScreen) => {
    setActiveScreen(screen);
    setIsWidgetOpen(true);
  };

  const integrationSnippet = `<script src="https://cdn.pelargo.io/v1/checkout.js" async></script>
<button data-pelargo-pay data-amount="25.00" data-recipient="northwind.eth">
  Pay with Pelargo
</button>`;

  const copyCode = () => {
    navigator.clipboard?.writeText(integrationSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="demo-store-page">
      {/* Demo Merchant Store Header */}
      <header className="demo-header">
        <div className="demo-brand">
          <Compass size={22} style={{ color: "var(--accent)" }} />
          <span>Northwind Goods</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div className="demo-cart-badge">1 item in cart</div>
          <button
            type="button"
            className="pelargo-icon-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* Main Store Content */}
      <main className="demo-main">
        <section className="demo-product-card" aria-label="Product details">
          <div className="demo-product-visual">
            <div
              style={{
                width: "calc(var(--space-6) * 3)",
                height: "calc(var(--space-6) * 4)",
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "var(--shadow)",
                gap: "var(--space-2)",
              }}
            >
              <ShoppingBag size={32} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", letterSpacing: "0.08em" }}>
                EDITION NO. 04
              </span>
            </div>
          </div>

          <div className="demo-product-info">
            <span className="demo-category-tag">Field & Studio Collection</span>
            <h2 className="demo-product-title">{MOCK_ORDER.itemTitle}</h2>
            <p className="demo-product-desc">{MOCK_ORDER.itemDescription}</p>

            <div className="demo-product-price">
              <span>{MOCK_ORDER.orderTotal.toFixed(2)}</span>
              <span className="demo-product-currency">{MOCK_ORDER.orderCurrency}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <button
                type="button"
                className="pelargo-primary-btn"
                onClick={() => {
                  setActiveScreen("summary");
                  setIsWidgetOpen(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--space-2)",
                }}
              >
                <PelargoBird size={16} />
                <span>Pay with Pelargo</span>
              </button>
              <span
                style={{
                  fontSize: "var(--fs-xs)",
                  color: "var(--muted)",
                  textAlign: "center",
                }}
              >
                Pay in seconds from your preferred token and chain
              </span>
            </div>
          </div>
        </section>

        {/* Integration code box */}
        <section className="demo-code-box" aria-label="Developer integration snippet">
          <div className="demo-code-header">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <Code2 size={15} />
              <span>One-line merchant integration snippet</span>
            </div>
            <button
              type="button"
              onClick={copyCode}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                fontSize: "var(--fs-xs)",
              }}
            >
              {copiedSnippet ? (
                <>
                  <Check size={14} style={{ color: "var(--success)" }} />
                  <span style={{ color: "var(--success)" }}>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="demo-code-snippet">
            <code>{integrationSnippet}</code>
          </pre>
        </section>
      </main>

      {/* Dev-only reviewer panel in corner */}
      <aside className="dev-panel" aria-label="Development review controls">
        <div className="dev-panel-header">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <Sparkles size={14} style={{ color: "var(--accent)" }} />
            <span className="dev-panel-title">Pelargo Dev Review</span>
          </div>
          <button
            type="button"
            className="dev-panel-btn"
            onClick={toggleTheme}
            title="Toggle theme"
          >
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-1) / 2)" }}>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
            Jump to screen / state:
          </span>
          <div className="dev-panel-actions">
            <button
              type="button"
              className={`dev-panel-btn ${isWidgetOpen && activeScreen === "summary" ? "dev-panel-btn--active" : ""}`}
              onClick={() => jumpToScreen("summary")}
            >
              1. Choose
            </button>
            <button
              type="button"
              className={`dev-panel-btn ${isWidgetOpen && activeScreen === "pick-token" ? "dev-panel-btn--active" : ""}`}
              onClick={() => jumpToScreen("pick-token")}
            >
              2. TokenPicker
            </button>
            <button
              type="button"
              className={`dev-panel-btn ${isWidgetOpen && activeScreen === "confirm" ? "dev-panel-btn--active" : ""}`}
              onClick={() => jumpToScreen("confirm")}
            >
              3. Confirm
            </button>
            <button
              type="button"
              className={`dev-panel-btn ${isWidgetOpen && activeScreen === "progress" ? "dev-panel-btn--active" : ""}`}
              onClick={() => jumpToScreen("progress")}
            >
              4. Progress
            </button>
            <button
              type="button"
              className={`dev-panel-btn ${isWidgetOpen && activeScreen === "receipt" ? "dev-panel-btn--active" : ""}`}
              onClick={() => jumpToScreen("receipt")}
            >
              5. Receipt
            </button>
            <button
              type="button"
              className={`dev-panel-btn ${isWidgetOpen && activeScreen === "error-expired" ? "dev-panel-btn--active" : ""}`}
              onClick={() => jumpToScreen("error-expired")}
            >
              Err: Expired
            </button>
            <button
              type="button"
              className={`dev-panel-btn ${isWidgetOpen && activeScreen === "error-failed" ? "dev-panel-btn--active" : ""}`}
              onClick={() => jumpToScreen("error-failed")}
            >
              Err: Failed
            </button>
            <button
              type="button"
              className={`dev-panel-btn ${isWidgetOpen && activeScreen === "loading" ? "dev-panel-btn--active" : ""}`}
              onClick={() => jumpToScreen("loading")}
            >
              Loading (600ms)
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "var(--space-1)" }}>
          <button
            type="button"
            className="dev-panel-btn"
            onClick={() => setCustomAccent((prev) => (prev ? undefined : "var(--success)"))}
            title="Demonstrate merchant accent prop override"
          >
            {customAccent ? "Reset Accent" : "Merchant Emerald Accent"}
          </button>
          <button
            type="button"
            className="dev-panel-btn"
            onClick={() => setIsWidgetOpen((prev) => !prev)}
          >
            {isWidgetOpen ? "Close Modal" : "Open Modal"}
          </button>
        </div>
      </aside>

      {/* The Pelargo Checkout Widget */}
      <PelargoWidget
        isOpen={isWidgetOpen}
        onClose={() => setIsWidgetOpen(false)}
        initialScreen={activeScreen}
        onScreenChange={(s) => setActiveScreen(s)}
        accent={customAccent}
      />
    </div>
  );
}
