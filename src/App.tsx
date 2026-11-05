import React, { useState, useEffect } from "react";
import {
  Sun,
  Moon,
  Compass,
  Sparkles,
  Code2,
  Check,
  Copy,
  ShoppingBag,
  Store,
  BarChart3,
  Plus,
  Trash2,
} from "lucide-react";
import { PelargoWidget, WidgetScreen } from "./components/PelargoWidget.tsx";
import { DryQuoteTest } from "./components/DryQuoteTest.tsx";
import { PelargoBird } from "./components/BrandMark.tsx";
import { MerchantDashboard } from "./components/MerchantDashboard.tsx";
import {
  MOCK_ORDER,
  STORE_PRODUCTS,
  INITIAL_SETTLEMENT_HISTORY,
  StoreProduct,
  SettlementRecord,
} from "./mock/data.ts";

export default function App() {
  const [activeTab, setActiveTab] = useState<"store" | "merchant">("store");
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeScreen, setActiveScreen] = useState<WidgetScreen>("summary");
  const [customAccent, setCustomAccent] = useState<string | undefined>(undefined);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Cart state
  const [cart, setCart] = useState<{ product: StoreProduct; quantity: number }[]>([
    { product: STORE_PRODUCTS[0], quantity: 1 },
  ]);

  // Merchant settlement history (live state)
  const [settlements, setSettlements] = useState<SettlementRecord[]>(
    INITIAL_SETTLEMENT_HISTORY
  );

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

  const addToCart = (product: StoreProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.priceUsdc * item.quantity,
    0
  );

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const activeOrderId = `NW-${10480 + settlements.length + 1}`;

  const handleSettlementComplete = (record: SettlementRecord) => {
    setSettlements((prev) => [record, ...prev]);
  };

  const integrationSnippet = `<script src="https://cdn.pelargo.io/v1/checkout.js" async></script>
<button data-pelargo-pay data-amount="${cartTotal.toFixed(2)}" data-recipient="northwind.eth">
  Pay with Pelargo
</button>`;

  const copyCode = () => {
    navigator.clipboard?.writeText(integrationSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="demo-store-page">
      {/* Navigation Header */}
      <header className="demo-header">
        <div className="demo-brand">
          <Compass size={22} style={{ color: "var(--accent)" }} />
          <span>Northwind Goods</span>
        </div>

        {/* View Switcher: Storefront vs Merchant Portal */}
        <div className="demo-nav-tabs" role="tablist" aria-label="Application views">
          <button
            type="button"
            className={`demo-nav-tab ${activeTab === "store" ? "demo-nav-tab--active" : ""}`}
            onClick={() => setActiveTab("store")}
            role="tab"
            aria-selected={activeTab === "store"}
          >
            <Store size={14} />
            <span>Storefront</span>
          </button>
          <button
            type="button"
            className={`demo-nav-tab ${activeTab === "merchant" ? "demo-nav-tab--active" : ""}`}
            onClick={() => setActiveTab("merchant")}
            role="tab"
            aria-selected={activeTab === "merchant"}
          >
            <BarChart3 size={14} />
            <span>Merchant Portal</span>
            <span
              style={{
                width: "var(--space-1)",
                height: "var(--space-1)",
                borderRadius: "var(--radius-full)",
                backgroundColor: "var(--success)",
              }}
              aria-hidden="true"
            />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {activeTab === "store" && (
            <div className="demo-cart-btn" aria-label={`Shopping cart with ${cartItemCount} items`}>
              <ShoppingBag size={15} style={{ color: "var(--accent)" }} />
              <span>{cartItemCount} item{cartItemCount !== 1 ? "s" : ""}</span>
              <span style={{ fontWeight: "var(--fw-semibold)" }}>${cartTotal.toFixed(2)}</span>
            </div>
          )}

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

      {/* Main Content Area */}
      <main className="demo-main">
        {activeTab === "merchant" ? (
          <MerchantDashboard settlements={settlements} />
        ) : (
          <>
            {/* Catalog Grid */}
            <section aria-label="Product Catalog">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginBottom: "var(--space-4)" }}>
                <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>
                  Field & Studio Equipment
                </h1>
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--muted)" }}>
                  Waterproof paper, raw machined metal, and expedition canvas. Direct intent checkout in any token.
                </p>
              </div>

              <div className="demo-catalog-grid">
                {STORE_PRODUCTS.map((prod) => (
                  <div key={prod.id} className="demo-catalog-card">
                    <div className="demo-catalog-visual">
                      <ShoppingBag size={28} style={{ color: "var(--accent)" }} />
                      <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", letterSpacing: "0.08em" }}>
                        {prod.edition}
                      </span>
                    </div>

                    <div className="demo-catalog-content">
                      <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {prod.category}
                      </span>
                      <h2 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>
                        {prod.title}
                      </h2>
                      <p style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", lineHeight: "var(--lh)" }}>
                        {prod.description}
                      </p>
                    </div>

                    <div className="demo-catalog-price-row">
                      <span style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>
                        ${prod.priceUsdc.toFixed(2)}{" "}
                        <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", fontWeight: "var(--fw-regular)" }}>USDC</span>
                      </span>

                      <button
                        type="button"
                        className="demo-add-cart-btn"
                        onClick={() => addToCart(prod)}
                        aria-label={`Add ${prod.title} to cart`}
                      >
                        <Plus size={14} />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Active Cart & Pelargo Checkout Panel */}
            <section className="demo-cart-panel" aria-label="Shopping Cart and Pelargo Checkout">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "var(--space-3)" }}>
                <div>
                  <h2 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>
                    Cart Order ({activeOrderId})
                  </h2>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
                    {cart.length === 0 ? "Cart is empty" : `${cartItemCount} items selected`}
                  </span>
                </div>
                <span style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>
                  ${cartTotal.toFixed(2)}{" "}
                  <span style={{ fontSize: "var(--fs-sm)", color: "var(--muted)" }}>USDC</span>
                </span>
              </div>

              {cart.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {cart.map((item) => (
                    <div key={item.product.id} className="demo-cart-item-row">
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <span style={{ fontWeight: "var(--fw-semibold)", color: "var(--text)", fontSize: "var(--fs-sm)" }}>
                          {item.quantity}×
                        </span>
                        <span style={{ fontSize: "var(--fs-sm)", color: "var(--text)" }}>
                          {item.product.title}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                        <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>
                          ${(item.product.priceUsdc * item.quantity).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          className="pelargo-icon-btn"
                          style={{ width: "var(--space-5)", height: "var(--space-5)" }}
                          onClick={() => removeFromCart(item.product.id)}
                          aria-label={`Remove ${item.product.title}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div style={{ paddingTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
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
                      <span>Pay ${cartTotal.toFixed(2)} USDC with Pelargo</span>
                    </button>
                    <span
                      style={{
                        fontSize: "var(--fs-xs)",
                        color: "var(--muted)",
                        textAlign: "center",
                      }}
                    >
                      Buyers pay in ETH, SOL, NEAR, or USDT • Merchant receives exact USDC on Base
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "var(--space-4) 0", color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
                  Your cart is empty. Click "+ Add" on any product above.
                </div>
              )}
            </section>

            {/* Merchant Integration Code Box */}
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
          </>
        )}
      <DryQuoteTest />
      </main>

      {/* Dev-only Reviewer Panel in corner */}
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
              3. Confirm & QR
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
        orderTotal={cartTotal > 0 ? cartTotal : MOCK_ORDER.orderTotal}
        orderId={activeOrderId}
        onSettlementComplete={handleSettlementComplete}
      />
    </div>
  );
}
