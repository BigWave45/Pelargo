import React, { useEffect, useMemo, useState } from "react";
import { PelargoCheckout } from "./components/PelargoCheckout.tsx";
import { PasswordRecovery } from "./components/PasswordRecovery.tsx";
import {
  ArrowUpRight, Check, Copy, LayoutDashboard, LogOut, Menu, Radio,
  Settings2, ShieldCheck, Wallet, Code2, Link2, RefreshCw,
  UserRound, CreditCard, ChevronDown, Building2, Mail, SlidersHorizontal
} from "lucide-react";
import "./styles/workspace.css";
import "./styles/workspace-premium.css";

type Merchant = { id: string; name: string; email: string };
type Settings = {
  name: string;
  destinationAsset: string | null;
  destinationSymbol: string | null;
  destinationNetwork: string | null;
  recipient: string | null;
  destinationDecimals: number;
};
type Order = {
  orderId: string; amountAtomic: string; destinationSymbol: string | null;
  destinationNetwork: string | null; status: string; createdAt: string; expiresAt: string;
};
type CheckoutSession = {
  merchantId: string; merchantName: string; orderId: string; amount: string;
  amountAtomic: string; destinationAsset: string; destinationSymbol: string;
  destinationNetwork: string; recipient: string; expiresAt: string;
};
type Section = "overview" | "destination" | "checkout" | "developers" | "profile" | "settings" | "subscription";

const nav: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "destination", label: "Payment destination", icon: Wallet },
  { id: "checkout", label: "Create checkout", icon: Settings2 },
  { id: "developers", label: "Developers", icon: Code2 },
];

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const diagnostic = data.diagnostic;
    const detail = diagnostic && typeof diagnostic === "object"
      ? ` (${String(diagnostic.name || "Error")}: ${String(diagnostic.message || "No diagnostic message")})`
      : "";
    // Surface bounded verifier stages in the workspace. A 503 without these
    // stages is not actionable for a merchant or operator.
    const verificationDiagnostics = Array.isArray(data.verificationDiagnostics)
      ? data.verificationDiagnostics.slice(0, 12).map((item: any) =>
          `${String(item.hash || "candidate")}: ${String(item.stage || "unknown")}${item.detail ? ` (${String(item.detail).slice(0, 180)})` : ""}`
        ).join(" | ")
      : "";
    const providerEvidence = data.providerEvidence && typeof data.providerEvidence === "object"
      ? JSON.stringify(data.providerEvidence).slice(0, 900)
      : "";
    const candidate = typeof data.candidateHash === "string" ? data.candidateHash : "";
    const evidenceParts = [
      candidate ? `candidate=${candidate}` : "",
      verificationDiagnostics ? `verification=${verificationDiagnostics}` : "",
      providerEvidence ? `providerEvidence=${providerEvidence}` : "",
    ].filter(Boolean);
    const evidenceDetail = evidenceParts.length ? ` [${evidenceParts.join("; ")}]` : "";
    throw new Error(`${data.error || `Request failed (${response.status})`}${detail}${evidenceDetail}`);
  }
  return data as T;
}

function toAtomic(amount: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("Enter a valid positive amount.");
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) throw new Error(`This destination supports at most ${decimals} decimal places.`);
  const value = BigInt(whole) * (10n ** BigInt(decimals)) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (value <= 0n) throw new Error("Amount must be greater than zero.");
  return value.toString();
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (merchant: Merchant) => void }) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);

  if (showRecovery) return <PasswordRecovery onBack={() => setShowRecovery(false)} />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const data = await api<{ merchant: Merchant }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password }),
      });
      onAuthenticated(data.merchant);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to authenticate."); }
    finally { setBusy(false); }
  }

  return <div className="auth-shell">
    <div className="auth-card">
      <a className="workspace-brand auth-brand" href="/"><span className="workspace-brand-mark">p</span><span>pelargo</span></a>
      <div className="eyebrow">MERCHANT WORKSPACE</div>
      <h1>{mode === "register" ? "Create your merchant account" : "Welcome back"}</h1>
      <p className="workspace-subtitle">{mode === "register" ? "Set up your checkout workspace. Buyers do not need Pelargo accounts." : "Sign in to manage your checkout and payment activity."}</p>
      <form onSubmit={submit}>
        {mode === "register" && <><label className="field-label" htmlFor="auth-name">Business name</label><input id="auth-name" className="workspace-input" value={name} onChange={e => setName(e.target.value)} autoComplete="organization" required maxLength={120} /></>}
        <label className="field-label" htmlFor="auth-email">Email address</label>
        <input id="auth-email" className="workspace-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} />
        <label className="field-label" htmlFor="auth-password">Password</label>
        <input id="auth-password" className="workspace-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 12 : 1} maxLength={128} />
        {mode === "register" && <p className="field-hint">Use at least 12 characters. This password protects access to your merchant workspace.</p>}
        {mode === "login" && <p className="auth-switch" style={{ textAlign: "right", margin: "10px 0 0" }}><button type="button" onClick={() => setShowRecovery(true)}>Forgot password?</button></p>}
        {error && <div className="notice-panel auth-error" role="alert">{error}</div>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"} <ArrowUpRight size={15} /></button>
      </form>
      <p className="auth-switch">{mode === "register" ? "Already have an account?" : "New to Pelargo?"} <button type="button" onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); }}>{mode === "register" ? "Sign in" : "Create an account"}</button></p>
      <p className="auth-footnote">Merchant accounts are for configuring checkout. Payment execution remains subject to network and settlement controls.</p>
    </div>
  </div>;
}

function BuyerCheckout({ token }: { token: string }) {
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/checkout-session", {
      headers: { accept: "application/json", authorization: "Bearer " + token },
      cache: "no-store",
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "Checkout session unavailable.");
        return data as { session: CheckoutSession };
      })
      .then(data => { if (live) setSession(data.session); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : "Checkout session unavailable."); });
    return () => { live = false; };
  }, [token]);
  if (error) return <div className="auth-shell"><div className="auth-card"><h1>Checkout unavailable</h1><p>{error}</p><p className="auth-footnote">Ask the merchant to issue a new checkout link if this one has expired or already been used.</p></div></div>;
  if (!session) return <div className="auth-shell"><div className="auth-card">Loading secure checkout…</div></div>;
  return <main className="buyer-checkout-shell">
    <div className="buyer-checkout-head"><a className="workspace-brand" href="/"><span className="workspace-brand-mark">p</span><span>pelargo</span></a><span><ShieldCheck size={14}/> Secure checkout</span></div>
    <div className="buyer-checkout-grid">
      <aside className="buyer-order-panel">
        <div className="eyebrow">PAYMENT REQUEST</div>
        <h1>Pay {session.merchantName}</h1>
        <div className="buyer-order-amount"><strong>{session.amount}</strong><span>{session.destinationSymbol}</span></div>
        <div className="buyer-order-meta">
          <div><span>Order reference</span><strong>{session.orderId}</strong></div>
          <div><span>Merchant receives</span><strong>{session.destinationSymbol} on {session.destinationNetwork}</strong></div>
        </div>
        <div className="buyer-trust-note"><ShieldCheck size={17}/><p>Payment is complete only after Pelargo independently verifies the destination transfer. A wallet transaction or provider status alone is not confirmation.</p></div>
      </aside>
      <section className="buyer-checkout-card">
        <div className="buyer-checkout-section-head">
          <div className="eyebrow">PAYMENT</div>
          <h2>Choose how to pay</h2>
          <p>Select a supported source asset. The quote will show the exact amount and network before you commit.</p>
        </div>
        <PelargoCheckout merchantName={session.merchantName} destinationSymbol={session.destinationSymbol}
          destinationNetwork={session.destinationNetwork} recipient={session.recipient} orderId={session.orderId}
          amount={session.amount} fixedAmount sessionToken={token} sessionExpiresAt={session.expiresAt} />
        <p className="auth-footnote">Only send funds to deposit instructions generated for this order. Creating a quote preview does not send funds.</p>
      </section>
    </div>
  </main>;
}

export default function App() {
  const [buyerToken] = useState(() => {
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("checkout") || "";
    const search = new URLSearchParams(window.location.search);
    const legacyQueryToken = search.get("checkout") || "";
    const token = fragmentToken || legacyQueryToken;
    if (token) {
      // Remove bearer credentials from the visible URL and browser history before any API request.
      search.delete("checkout");
      const remainingQuery = search.toString();
      window.history.replaceState(null, "", window.location.pathname + (remainingQuery ? "?" + remainingQuery : ""));
    }
    return token;
  });
  const passwordResetToken = useMemo(() => new URLSearchParams(window.location.search).get("password-reset") || "", []);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [section, setSection] = useState<Section>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    name: "", destinationAsset: "", destinationSymbol: "USDC",
    destinationNetwork: "NEAR", recipient: "", destinationDecimals: 6,
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [amount, setAmount] = useState("1.00");
  const [orderId, setOrderId] = useState(`ORDER-${Date.now().toString().slice(-8)}`);
  const [createdLink, setCreatedLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [recoveryOrderId, setRecoveryOrderId] = useState("");
  const [sourceTransactionHash, setSourceTransactionHash] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null);
  const [merchantApiKey, setMerchantApiKey] = useState("");
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [apiKeyNotice, setApiKeyNotice] = useState("");

  async function refreshWorkspace() {
    const [profile, activity] = await Promise.all([
      api<{ settings: Settings }>("/api/merchant-settings"),
      api<{ orders: Order[] }>("/api/orders"),
    ]);
    setSettings({
      ...profile.settings,
      destinationNetwork: profile.settings.destinationNetwork || "NEAR",
    });
    setOrders(activity.orders);
  }

  useEffect(() => {
    if (buyerToken || passwordResetToken) return;
    api<{ merchant: Merchant }>("/api/auth/session")
      .then(data => setMerchant(data.merchant))
      .catch(() => setMerchant(null))
      .finally(() => setAuthChecked(true));
  }, [buyerToken, passwordResetToken]);

  useEffect(() => {
    if (!merchant) return;
    refreshWorkspace().catch(e => setError(e instanceof Error ? e.message : "Unable to load workspace."));
  }, [merchant]);

  if (buyerToken) return <BuyerCheckout token={buyerToken} />;
  if (passwordResetToken) return <PasswordRecovery resetToken={passwordResetToken} onBack={() => { window.location.href = "/"; }} />;
  if (!authChecked) return <div className="auth-shell"><div className="auth-card">Loading Pelargo…</div></div>;
  if (!merchant) return <AuthScreen onAuthenticated={setMerchant} />;

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/merchant-settings", { method: "PUT", body: JSON.stringify({ ...settings, destinationNetwork: settings.destinationNetwork || "NEAR" }) });
      await refreshWorkspace();
      setNotice("Payment destination saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save settings."); }
    finally { setBusy(false); }
  }

  async function createCheckout(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setCreatedLink("");
    try {
      if (!settings.destinationAsset || !settings.destinationSymbol || !settings.recipient) {
        throw new Error("Save a payment destination before creating a checkout.");
      }
      const atomic = toAtomic(amount, settings.destinationDecimals);
      const result = await api<{ token: string; session: CheckoutSession }>("/api/checkout-session", {
        method: "POST",
        body: JSON.stringify({
          orderId, amount, amountAtomic: atomic,
          destinationAsset: settings.destinationAsset,
          destinationSymbol: settings.destinationSymbol,
          destinationNetwork: settings.destinationNetwork || "NEAR",
          recipient: settings.recipient,
          expiresInSeconds: 900,
        }),
      });
      const link = `${window.location.origin}/#checkout=${encodeURIComponent(result.token)}`;
      setCreatedLink(link);
      // Advance the form to a fresh reference so a replacement link cannot collide with the expired order.
      setOrderId(`ORDER-${Date.now().toString().slice(-8)}`);
      await refreshWorkspace();
      setNotice("Checkout link created. Share it with your buyer.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create checkout."); }
    finally { setBusy(false); }
  }

  async function checkPaymentStatus(orderId: string) {
    setBusy(true); setCheckingOrderId(orderId); setError(""); setNotice("");
    try {
      const result = await api<{
        paymentStatus: string; providerStatus: string; settlement: string;
        providerEvidence?: {
          originChainTxHashes?: string[]; nearTxHashes?: string[];
          destinationChainTxHashes?: string[]; quoteCorrelationMatches?: boolean | null;
        };
      }>(`/api/payment-status?orderId=${encodeURIComponent(orderId)}`, {
        signal: AbortSignal.timeout(20_000),
      });
      await refreshWorkspace();
      const evidence = result.providerEvidence;
      const providerRefs = evidence
        ? ` Provider quote match: ${evidence.quoteCorrelationMatches === true ? "yes" : evidence.quoteCorrelationMatches === false ? "no" : "not reported"}. Source hashes: ${evidence.originChainTxHashes?.join(", ") || "none reported"}. NEAR hashes: ${evidence.nearTxHashes?.join(", ") || "none reported"}. Destination hashes: ${evidence.destinationChainTxHashes?.join(", ") || "none reported"}.`
        : "";
      setNotice(result.settlement === "verified"
        ? `Payment ${orderId} is settled and independently verified.`
        : `Payment ${orderId}: ${result.paymentStatus}. Provider: ${result.providerStatus}. Settlement: ${result.settlement}.${providerRefs}`);
    } catch (e) {
      setError(e instanceof DOMException && e.name === "TimeoutError"
        ? "Status check timed out after 20 seconds. The provider did not respond; retrying will not submit another payment."
        : e instanceof Error ? e.message : "Unable to refresh payment status.");
    } finally { setBusy(false); setCheckingOrderId(null); }
  }

  async function submitSourceDeposit(event: React.FormEvent) {
    event.preventDefault();
    if (!recoveryOrderId) return;
    setRecoveryBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{
        originDeposit: string; providerNotification: string; providerStatus: string;
        sourceTransactionHash: string; originChainTxHashes?: string[];
        nearTxHashes?: string[]; destinationChainTxHashes?: string[];
      }>("/api/deposit-submit", {
        method: "POST",
        body: JSON.stringify({ orderId: recoveryOrderId, transactionHash: sourceTransactionHash.trim() }),
      });
      await refreshWorkspace();
      setNotice(result.providerNotification === "not_resubmitted_provider_already_successful"
        ? "Source transaction verified and evidence recorded. Existing destination settlement remains unchanged. The provider was not notified again."
        : `Source transaction verified. Provider notification: ${result.providerNotification}. Provider status: ${result.providerStatus}.`);
      setSourceTransactionHash("");
      setRecoveryOrderId("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to verify source transaction."); }
    finally { setRecoveryBusy(false); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    setMerchant(null); setAuthChecked(true);
  }

  const title = nav.find(item => item.id === section)?.label ??
    ({ profile: "Profile", settings: "Settings", subscription: "Subscription" } as Record<string, string>)[section] ?? "Overview";
  const settledCount = orders.filter(order => order.status === "settled").length;
  const activeCount = orders.filter(order => ["quote_committed", "awaiting_deposit", "deposit_detected", "processing"].includes(order.status)).length;
  const attentionCount = orders.filter(order => ["needs_review", "failed", "expired", "cancelled", "verification_failed"].includes(order.status)).length;
  const formatOrderAmount = (order: Order) => {
    try {
      const raw = BigInt(order.amountAtomic || "0");
      const decimals = Math.max(0, Math.min(30, settings.destinationDecimals || 6));
      const scale = 10n ** BigInt(decimals);
      const whole = raw / scale;
      const fraction = (raw % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
      return fraction ? `${whole}.${fraction}` : whole.toString();
    } catch { return "—"; }
  };
  const statusLabel = (status: string) => status.replaceAll("_", " ");
  const canCheckStatus = (status: string) => ["quote_committed", "awaiting_deposit", "deposit_detected", "processing", "settled"].includes(status);
  return <div className="workspace">
    <aside className={`workspace-sidebar ${mobileNavOpen ? "workspace-sidebar--open" : ""}`}>
      <a className="workspace-brand" href="#" onClick={e => { e.preventDefault(); setSection("overview"); }}><span className="workspace-brand-mark">p</span><span>pelargo</span></a>
      <div className="workspace-side-label">WORKSPACE</div>
      <nav className="workspace-nav" aria-label="Main navigation">
        {nav.map(({ id, label, icon: Icon }) => <button key={id} className={`workspace-nav-item ${section === id ? "is-active" : ""}`} onClick={() => { setSection(id); setMobileNavOpen(false); }}><Icon size={17} /><span>{label}</span></button>)}
      </nav>
      <div className="workspace-sidebar-bottom">
        <div className="sidebar-account-label">YOUR ACCOUNT</div>
        <button className="workspace-profile-open sidebar-profile-open" type="button" onClick={() => setSection("profile")} aria-label="Open merchant profile">
          <div className="workspace-avatar">{merchant.name.slice(0, 2).toUpperCase()}</div>
          <div className="workspace-profile-copy"><strong>{merchant.name}</strong><span>{merchant.email}</span></div>
        </button>
        <div className="sidebar-account-links">
          <button type="button" onClick={() => setSection("settings")}><SlidersHorizontal size={15}/> Settings</button>
          <button type="button" onClick={() => setSection("subscription")}><CreditCard size={15}/> Subscription</button>
          <button type="button" onClick={() => void logout()}><LogOut size={15}/> Sign out</button>
        </div>
      </div>
     </aside>
    <main className="workspace-main">
      <header className="workspace-topbar">
        <button className="workspace-mobile-menu" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label="Toggle navigation"><Menu size={20} /></button>
        <div className="workspace-breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{title}</strong></div>
        <div className="workspace-topbar-right">
           <span className="environment-pill"><i /> Testnet checkout</span>
           <div className="account-menu-wrap">
             <button className={`account-menu-trigger ${accountMenuOpen ? "is-open" : ""}`} type="button" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(!accountMenuOpen)}>
               <span className="workspace-avatar">{merchant.name.slice(0, 2).toUpperCase()}</span>
               <span className="account-trigger-name">{merchant.name}</span>
               <ChevronDown size={14}/>
             </button>
             {accountMenuOpen && <div className="account-menu" role="menu">
               <div className="account-menu-identity"><strong>{merchant.name}</strong><span>{merchant.email}</span></div>
               <button type="button" role="menuitem" onClick={() => { setSection("profile"); setAccountMenuOpen(false); }}><UserRound size={15}/> Profile</button>
               <button type="button" role="menuitem" onClick={() => { setSection("settings"); setAccountMenuOpen(false); }}><SlidersHorizontal size={15}/> Settings</button>
               <button type="button" role="menuitem" onClick={() => { setSection("subscription"); setAccountMenuOpen(false); }}><CreditCard size={15}/> Subscription</button>
               <div className="account-menu-divider"/>
               <button type="button" role="menuitem" className="account-menu-signout" onClick={() => { setAccountMenuOpen(false); void logout(); }}><LogOut size={15}/> Sign out</button>
             </div>}
           </div>
         </div>
      </header>
      <div className="workspace-content">
        {error && <div className="notice-panel auth-error" role="alert">{error}</div>}
        {notice && <div className="notice-panel auth-success" role="status">{notice}</div>}
        {section === "overview" && <>
          <div className="overview-intro">
            <div>
              <div className="eyebrow">MERCHANT WORKSPACE</div>
              <h1>Your payments, in view.</h1>
              <p className="workspace-subtitle">A clear record of what buyers send and what reaches your settlement destination.</p>
            </div>
            <div className="overview-actions">
              <button className="quiet-button" onClick={() => setSection("destination")}><Settings2 size={15} /> Destination</button>
              <button className="primary-button" onClick={() => setSection("checkout")}><Link2 size={15} /> Create checkout</button>
            </div>
          </div>

          <section className="overview-metrics" aria-label="Payment activity summary">
            <article className="overview-metric">
              <span>All orders</span>
              <strong>{orders.length}</strong>
              <small>Orders created in this workspace</small>
            </article>
            <article className="overview-metric">
              <span>In progress</span>
              <strong>{activeCount}</strong>
              <small>Awaiting deposit or settlement</small>
            </article>
            <article className="overview-metric">
              <span>Settled</span>
              <strong>{settledCount}</strong>
              <small>Independently verified payments</small>
            </article>
            <article className="overview-metric">
              <span>Needs attention</span>
              <strong>{attentionCount}</strong>
              <small>Review, failure or expiry states</small>
            </article>
          </section>

          <section className="payment-flow" aria-label="How Pelargo checkout works">
            <div className="payment-flow-heading">
              <span className="eyebrow">PAYMENT ROUTE</span>
              <span>One checkout. Verifiable settlement.</span>
            </div>
            <div className="payment-flow-steps">
              <div><span className="flow-index">01</span><strong>Buyer</strong><small>Chooses a supported asset</small></div>
              <i aria-hidden="true">→</i>
              <div><span className="flow-index">02</span><strong>Pelargo</strong><small>Creates and tracks the payment</small></div>
              <i aria-hidden="true">→</i>
              <div><span className="flow-index">03</span><strong>NEAR Intents</strong><small>Routes the cross-chain transfer</small></div>
              <i aria-hidden="true">→</i>
              <div><span className="flow-index">04</span><strong>Settlement</strong><small>Verified at the destination</small></div>
            </div>
          </section>

          <section className="activity-section">
            <div className="section-heading">
              <div><h2>Payment activity</h2><p>Order status and settlement actions for this merchant.</p></div>
              <button className="quiet-button" onClick={() => refreshWorkspace().catch(e => setError(String(e)))} disabled={busy}><RefreshCw size={14} /> Refresh</button>
            </div>
            <div className="activity-table-wrap">
              {orders.length === 0 ? <div className="empty-state activity-empty"><div className="empty-icon"><Radio size={20} /></div><strong>No payment activity yet</strong><p>Configure your settlement destination, then create a checkout link for your first order.</p><button className="primary-button" onClick={() => setSection(settings.destinationAsset ? "checkout" : "destination")}>{settings.destinationAsset ? "Create checkout" : "Configure destination"} <ArrowUpRight size={15} /></button></div> :
                <table className="activity-table">
                  <thead><tr><th>Order</th><th>Created</th><th>Requested amount</th><th>Lifecycle</th><th className="activity-actions-heading">Actions</th></tr></thead>
                  <tbody>{orders.map(order => <tr key={order.orderId}>
                    <td data-label="Order"><strong className="activity-order-id">{order.orderId}</strong><small>{order.destinationNetwork || "NEAR"} settlement</small></td>
                    <td data-label="Created"><span className="activity-date">{new Date(order.createdAt).toLocaleString()}</span></td>
                    <td data-label="Requested amount"><strong>{formatOrderAmount(order)} {order.destinationSymbol || settings.destinationSymbol || ""}</strong></td>
                    <td data-label="Lifecycle"><span className={`activity-status status-${order.status.replace(/[^a-z0-9_-]/gi, "-")}`}>{statusLabel(order.status)}</span></td>
                    <td data-label="Actions"><div className="activity-row-actions">
                      {canCheckStatus(order.status) && <button className="table-action" type="button" disabled={busy} onClick={() => checkPaymentStatus(order.orderId)}>{checkingOrderId === order.orderId ? "Checking…" : "Check status"}</button>}
                      {["quote_committed", "awaiting_deposit", "deposit_detected", "processing", "settled"].includes(order.status) && <button className="table-action table-action-muted" type="button" onClick={() => { setRecoveryOrderId(order.orderId); setSourceTransactionHash(""); }}>Verify source</button>}
                    </div></td>
                  </tr>)}</tbody>
                </table>}
            </div>
          </section>

          {recoveryOrderId && <form className="form-panel recovery-panel" onSubmit={submitSourceDeposit}>
            <div className="form-panel-heading"><span className="form-icon"><ShieldCheck size={18} /></span><div><h2>Verify source transaction</h2><p>This verifies and records the original Base Sepolia source transaction for {recoveryOrderId}. It does not reopen settlement or initiate another transfer.</p></div></div>
            <label className="field-label" htmlFor="source-transaction-hash">Base Sepolia transaction hash</label>
            <input id="source-transaction-hash" className="workspace-input mono-input" value={sourceTransactionHash} onChange={e => setSourceTransactionHash(e.target.value)} placeholder="0x…" required pattern="0x[a-fA-F0-9]{64}" maxLength={66} />
            <div className="form-footer"><button className="quiet-button" type="button" onClick={() => setRecoveryOrderId("")}>Cancel</button><button className="primary-button" disabled={recoveryBusy}>{recoveryBusy ? "Verifying…" : "Verify source transaction"} <ArrowUpRight size={15} /></button></div>
          </form>}
        </>}
        {section === "destination" && <>
          <div className="workspace-heading-row"><div><div className="eyebrow">MERCHANT CONFIGURATION</div><h1>Payment destination</h1><p className="workspace-subtitle">Set the asset and NEAR address your business wants to receive.</p></div></div>
          <div className="configuration-layout">
            <form className="form-panel configuration-form" onSubmit={saveSettings}>
              <div className="form-panel-heading"><span className="form-icon"><Wallet size={18} /></span><div><h2>Settlement destination</h2><p>Where Pelargo should deliver completed payments for this merchant.</p></div></div>
              <div className="form-section-label">BUSINESS</div>
              <label className="field-label" htmlFor="merchant-name">Business name</label><input id="merchant-name" className="workspace-input" value={settings.name || ""} onChange={e => setSettings({ ...settings, name: e.target.value })} required maxLength={120} />
              <div className="form-section-label">RECEIVING ASSET</div>
              <label className="field-label" htmlFor="destination-asset">NEAR Intents asset ID</label><input id="destination-asset" className="workspace-input mono-input" value={settings.destinationAsset || ""} onChange={e => setSettings({ ...settings, destinationAsset: e.target.value })} placeholder="nep141:usdc.omft.near" required maxLength={256} />
              <div className="field-grid">
                <div><label className="field-label" htmlFor="destination-symbol">Token symbol</label><input id="destination-symbol" className="workspace-input" value={settings.destinationSymbol || ""} onChange={e => setSettings({ ...settings, destinationSymbol: e.target.value })} placeholder="USDC" required maxLength={32} /></div>
                <div><label className="field-label" htmlFor="destination-decimals">Token decimals</label><input id="destination-decimals" className="workspace-input" type="number" min="0" max="30" value={settings.destinationDecimals} onChange={e => setSettings({ ...settings, destinationDecimals: Number(e.target.value) })} required /></div>
              </div>
              <div className="form-section-label">SETTLEMENT ACCOUNT</div>
              <label className="field-label" htmlFor="destination-network">Network</label><select id="destination-network" className="workspace-input" value={settings.destinationNetwork || "NEAR"} onChange={e => setSettings({ ...settings, destinationNetwork: e.target.value })} required><option value="NEAR">NEAR · Tidepool testnet</option></select>
              <label className="field-label" htmlFor="recipient">Recipient address</label><input id="recipient" className="workspace-input mono-input" value={settings.recipient || ""} onChange={e => setSettings({ ...settings, recipient: e.target.value })} placeholder="account.near or supported token receiver" required maxLength={256} />
              <div className="field-hint"><ShieldCheck size={14} /> Public address only. Never enter a seed phrase or private key. Verify the asset ID and decimals against the provider catalogue.</div>
              <div className="form-footer"><span>Changes apply to newly created checkout sessions.</span><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save destination"} <ArrowUpRight size={15} /></button></div>
            </form>
            <aside className="configuration-aside">
              <span className="eyebrow">DESTINATION PREVIEW</span>
              <h2>Where payments arrive</h2>
              <p>Buyers pay with a supported source asset. Pelargo routes the transfer and verifies the destination settlement independently.</p>
              <div className="destination-preview-row"><span>Business</span><strong>{settings.name || "Your business"}</strong></div>
              <div className="destination-preview-row"><span>Receiving asset</span><strong>{settings.destinationSymbol || "Not configured"}</strong></div>
              <div className="destination-preview-row"><span>Network</span><strong>{settings.destinationNetwork || "NEAR"}</strong></div>
              <div className="destination-preview-row destination-address"><span>Recipient</span><code>{settings.recipient || "Add a recipient address"}</code></div>
              <div className="configuration-note"><ShieldCheck size={15}/><span>Destination changes do not alter existing orders or completed settlements.</span></div>
            </aside>
          </div>
        </>}
        {section === "checkout" && <>
          <div className="workspace-heading-row"><div><div className="eyebrow">BUYER PAYMENT LINK</div><h1>Create checkout</h1><p className="workspace-subtitle">Generate a short-lived, signed checkout session for a specific order.</p></div></div>
          <div className="checkout-create-layout">
            <form className="form-panel checkout-create-form" onSubmit={createCheckout}>
              <div className="form-panel-heading"><span className="form-icon"><Link2 size={18} /></span><div><h2>Order details</h2><p>Create a private, time-limited payment link for one order.</p></div></div>
              <label className="field-label" htmlFor="order-id">Order reference</label><input id="order-id" className="workspace-input" value={orderId} onChange={e => setOrderId(e.target.value)} required maxLength={256} />
              <label className="field-label" htmlFor="order-amount">Amount to receive ({settings.destinationSymbol || "destination asset"})</label><div className="amount-input-wrap"><input id="order-amount" className="workspace-input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required /><span>{settings.destinationSymbol || "—"}</span></div>
              <div className="checkout-create-meta"><span><ShieldCheck size={14}/> Signed checkout session</span><span><span className="meta-dot"/> Expires in 15 minutes</span></div>
              <div className="form-footer"><span>Creating a link does not move funds.</span><button className="primary-button" disabled={busy || !settings.destinationAsset || !settings.recipient}>{busy ? "Creating…" : "Create checkout link"} <ArrowUpRight size={15} /></button></div>
            </form>
            <aside className="checkout-summary-panel">
              <span className="eyebrow">CHECKOUT SUMMARY</span>
              <h2>What your buyer will see</h2>
              <div className="checkout-summary-amount"><small>Requested payment</small><strong>{amount || "0"} <i>{settings.destinationSymbol || "TOKEN"}</i></strong></div>
              <div className="destination-preview-row"><span>Order</span><strong>{orderId || "—"}</strong></div>
              <div className="destination-preview-row"><span>Settles to</span><strong>{settings.name || merchant.name}</strong></div>
              <div className="destination-preview-row"><span>Destination</span><strong>{settings.destinationNetwork || "NEAR"} · {settings.destinationSymbol || "Not configured"}</strong></div>
              {!settings.destinationAsset || !settings.recipient ? <div className="configuration-note"><Wallet size={15}/><span>Set a payment destination before creating a checkout.</span><button type="button" onClick={()=>setSection("destination")}>Configure</button></div> : <div className="configuration-note"><ShieldCheck size={15}/><span>Buyer can pay without creating a Pelargo account.</span></div>}
            </aside>
          </div>
          {createdLink && <section className="workspace-card generated-link"><div className="card-heading"><div><h3>Checkout link created</h3><p>Share this URL with the buyer. It is a bearer link and should be treated as private to this order.</p></div><Check size={18} /></div><div className="generated-link-value">{createdLink}</div><button className="quiet-button" onClick={async () => { await navigator.clipboard.writeText(createdLink); setCopied(true); }}><Copy size={14} /> {copied ? "Copied" : "Copy checkout link"}</button></section>}
        </>}
        {section === "developers" && <>
          <div className="workspace-heading-row"><div><div className="eyebrow">DEVELOPER DOCUMENTATION</div><h1>Build with Pelargo</h1><p className="workspace-subtitle">Connect your existing order system to Pelargo using a server API, then send buyers to a secure hosted checkout.</p></div></div>
          <section className="workspace-card api-card developer-intro-card">
            <div className="developer-intro-copy"><span className="eyebrow">INTEGRATION MODEL</span><h2>Works with any website or app that has a backend.</h2><p>Use the API from your server, whether your storefront is custom-built, mobile, or powered by a commerce platform. Your server creates the order session. Pelargo hosts the buyer payment page. After payment, your server checks the order status before fulfilling the order.</p></div>
            <div className="developer-flow"><span>Your website</span><i>→</i><span>Your backend</span><i>→</i><span>Pelargo checkout</span><i>→</i><span>Verified settlement</span></div>
          </section>
          <section className="workspace-card api-card">
            <div className="card-heading"><div><h3>1. Create a server API key</h3><p>Generate a merchant key. It is displayed once. Store it as a secret on your backend and never expose it in browser code or a mobile app.</p></div><ShieldCheck size={17}/></div>
            {merchantApiKey ? <div className="notice-panel auth-success"><strong>New merchant API key</strong><p>Copy it now and save it in your server-side secret manager. It will not be shown again. The previous key is now invalid.</p><div className="generated-link-value">{merchantApiKey}</div><button className="quiet-button" type="button" onClick={async()=>{await navigator.clipboard.writeText(merchantApiKey);setApiKeyNotice("API key copied.");}}><Copy size={14}/> Copy API key</button></div> : <div className="form-footer"><span>Rotating a key immediately invalidates the previous key.</span><button className="primary-button" type="button" disabled={apiKeyBusy} onClick={async()=>{const confirmed=window.confirm("Generate a new merchant API key? Any previous key will stop working immediately.");if(!confirmed)return;setApiKeyBusy(true);setApiKeyNotice("");setError("");try{const result=await api<{apiKey:string;warning:string}>("/api/merchant-api-key",{method:"POST",body:"{}"});setMerchantApiKey(result.apiKey);setApiKeyNotice(result.warning);}catch(e){setError(e instanceof Error?e.message:"Unable to generate merchant API key.");}finally{setApiKeyBusy(false);}}}>{apiKeyBusy?"Generating…":"Generate / rotate API key"} <ArrowUpRight size={15}/></button></div>}
            {apiKeyNotice && !merchantApiKey && <p className="field-hint">{apiKeyNotice}</p>}
          </section>
          <section className="workspace-card api-card">
            <div className="card-heading"><div><h3>2. Create a checkout session from your backend</h3><p>Call Pelargo from a trusted server after creating an order in your own database. The merchant key stays on the server.</p></div><Code2 size={17}/></div>
            <div className="code-panel"><div className="code-panel-head"><span>NODE.JS · SERVER EXAMPLE</span><button type="button" onClick={async()=>{await navigator.clipboard.writeText(`const response = await fetch("https://design-blue-white-premium.pelargo.pages.dev/api/checkout-session", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-pelargo-merchant-key": process.env.PELARGO_MERCHANT_API_KEY,
  },
  body: JSON.stringify({
    orderId: String(order.id),
    amount: "1",
    amountAtomic: "1000000",
    destinationAsset: process.env.PELARGO_DESTINATION_ASSET,
    destinationSymbol: "USDC",
    destinationNetwork: "NEAR",
    recipient: process.env.PELARGO_RECIPIENT,
    expiresInSeconds: 900,
  }),
});
if (!response.ok) throw new Error("Pelargo session creation failed");
const { token } = await response.json();
const checkoutUrl = "https://design-blue-white-premium.pelargo.pages.dev/#checkout=" + encodeURIComponent(token);
// Return checkoutUrl to the authenticated buyer/order page.`);setApiKeyNotice("Server example copied.");}}><Copy size={12}/> Copy example</button></div><pre>{`const response = await fetch("https://design-blue-white-premium.pelargo.pages.dev/api/checkout-session", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-pelargo-merchant-key": process.env.PELARGO_MERCHANT_API_KEY,
  },
  body: JSON.stringify({
    orderId: String(order.id),
    amount: "1",
    amountAtomic: "1000000",
    destinationAsset: process.env.PELARGO_DESTINATION_ASSET,
    destinationSymbol: "USDC",
    destinationNetwork: "NEAR",
    recipient: process.env.PELARGO_RECIPIENT,
    expiresInSeconds: 900,
  }),
});
if (!response.ok) throw new Error("Pelargo session creation failed");
const { token } = await response.json();
const checkoutUrl = "https://design-blue-white-premium.pelargo.pages.dev/#checkout=" + encodeURIComponent(token);
// Return checkoutUrl to the authenticated buyer/order page.`}</pre><div className="code-panel-foot">The amount and amountAtomic values above are illustrative only. Send the exact order amount in human-readable units and an integer atomic-unit string using the configured destination token's decimals. The destination asset, symbol, network and recipient must match your merchant configuration.</div></div>
          </section>
          <section className="workspace-card api-card">
            <div className="card-heading"><div><h3>3. Redirect the buyer to hosted checkout</h3><p>Return the generated URL from your own authenticated backend route. Your frontend does not need a Pelargo API key or a Pelargo JavaScript bundle.</p></div><Link2 size={17}/></div>
            <div className="code-panel"><div className="code-panel-head"><span>BROWSER · JAVASCRIPT</span><button type="button" onClick={async()=>{await navigator.clipboard.writeText(`const result = await fetch("/api/pelargo/create-checkout", {
  method: "POST",
  credentials: "same-origin",
});
if (!result.ok) throw new Error("Unable to start checkout");
const { checkoutUrl } = await result.json();
window.location.assign(checkoutUrl);`);setApiKeyNotice("Browser redirect example copied.");}}><Copy size={12}/> Copy example</button></div><pre>{`const result = await fetch("/api/pelargo/create-checkout", {
  method: "POST",
  credentials: "same-origin",
});
if (!result.ok) throw new Error("Unable to start checkout");
const { checkoutUrl } = await result.json();
window.location.assign(checkoutUrl);`}</pre><div className="code-panel-foot">The /api/pelargo/create-checkout route is part of your own application. It should authenticate the buyer, create the Pelargo session server-to-server, and return the hosted checkout URL. Do not call Pelargo's merchant API from the browser.</div></div>
          </section>
          <section className="workspace-card api-card">
            <div className="card-heading"><div><h3>4. Verify payment before fulfilling the order</h3><p>Use merchant-scoped order and payment status endpoints from your backend. Do not fulfil an order based only on a buyer redirect or provider status.</p></div><RefreshCw size={17}/></div>
            <div className="api-row"><code>POST /api/checkout-session</code><span>Create a signed, expiring buyer session.</span></div>
            <div className="api-row"><code>GET /api/order?orderId=…</code><span>Retrieve an order belonging to your merchant.</span></div>
            <div className="api-row"><code>GET /api/payment-status?orderId=…</code><span>Read provider status and independently verified settlement.</span></div>
            <div className="api-row"><code>POST /api/deposit-submit</code><span>Verify a buyer's Base Sepolia source transaction when manual deposit evidence is needed.</span></div>
          </section>
          <section className="workspace-card api-card developer-capabilities">
            <div className="card-heading"><div><h3>What is supported in this Preview</h3><p>Current integration scope, without implying a packaged SDK that has not been released.</p></div><Check size={17}/></div>
            <div className="developer-capability-grid">
              <div><strong>Hosted checkout</strong><span>Available. Redirect buyers to a signed, order-specific Pelargo checkout link.</span></div>
              <div><strong>Any backend</strong><span>Available through HTTPS APIs and server-side HTTP requests.</span></div>
              <div><strong>Embedded checkout SDK</strong><span>Not published. There is no stable JavaScript bundle or custom-element CDN at this stage.</span></div>
              <div><strong>Platform plugins</strong><span>Shopify, WooCommerce and other ready-made plugins are not available yet.</span></div>
              <div><strong>Payment route</strong><span>Preview currently verifies the implemented Base Sepolia source to NEAR testnet destination route. Do not assume universal chain or token support.</span></div>
              <div><strong>Payment notifications</strong><span>No merchant webhook delivery is currently exposed. Poll the merchant status endpoint from your backend.</span></div>
            </div>
          </section>
          <div className="notice-panel"><strong>Testnet Preview only.</strong><p>These examples target the Pelargo Preview host and testnet route. A committed quote creates real testnet deposit instructions. Buyers must send the exact asset and amount shown. Do not use this integration for mainnet or real customer funds. The Preview host is not a production API hostname.</p></div>
        </>}
        {section === "profile" && <section className="account-page">
          <div className="workspace-heading-row"><div><div className="eyebrow">ACCOUNT</div><h1>Profile</h1><p className="workspace-subtitle">Your merchant identity and workspace account.</p></div></div>
          <div className="account-detail-card">
            <div className="account-detail-avatar">{merchant.name.slice(0, 2).toUpperCase()}</div>
            <div className="account-detail-main"><span className="eyebrow">MERCHANT PROFILE</span><h2>{merchant.name}</h2><p>{merchant.email}</p></div>
            <span className="account-state-pill">Signed in</span>
          </div>
          <div className="account-info-grid">
            <article className="account-info-card"><Building2 size={17}/><span>Business name</span><strong>{settings.name || merchant.name}</strong><small>Managed in Payment destination settings.</small></article>
            <article className="account-info-card"><Mail size={17}/><span>Account email</span><strong>{merchant.email}</strong><small>Used to identify this merchant account.</small></article>
          </div>
          <div className="account-page-actions"><button className="quiet-button" type="button" onClick={() => setSection("settings")}><SlidersHorizontal size={14}/> Account settings</button><button className="quiet-button account-signout-button" type="button" onClick={() => void logout()}><LogOut size={14}/> Sign out</button></div>
        </section>}
        {section === "settings" && <section className="account-page">
          <div className="workspace-heading-row"><div><div className="eyebrow">WORKSPACE PREFERENCES</div><h1>Settings</h1><p className="workspace-subtitle">Manage the configuration connected to this merchant workspace.</p></div></div>
          <div className="settings-link-list">
            <button type="button" onClick={() => setSection("destination")}><span className="settings-link-icon"><Wallet size={17}/></span><span><strong>Payment destination</strong><small>Change the receiving asset, network and recipient address.</small></span><ArrowUpRight size={16}/></button>
            <button type="button" onClick={() => setSection("developers")}><span className="settings-link-icon"><Code2 size={17}/></span><span><strong>Developer credentials</strong><small>Generate or rotate the server-side merchant API key.</small></span><ArrowUpRight size={16}/></button>
            <button type="button" onClick={() => setSection("profile")}><span className="settings-link-icon"><UserRound size={17}/></span><span><strong>Account profile</strong><small>View the business identity and sign-in email for this account.</small></span><ArrowUpRight size={16}/></button>
          </div>
          <div className="settings-security-note"><ShieldCheck size={17}/><p>Account email and password changes are not currently exposed in this testnet workspace. Do not assume these controls are available here.</p></div>
        </section>}
        {section === "subscription" && <section className="account-page">
          <div className="workspace-heading-row"><div><div className="eyebrow">PLANS & BILLING</div><h1>Subscription</h1><p className="workspace-subtitle">Manage your Pelargo plan and billing status.</p></div></div>
          <div className="subscription-preview-card">
            <span className="subscription-icon"><CreditCard size={20}/></span>
            <span className="eyebrow">TESTNET PREVIEW</span>
            <h2>Subscriptions are not enabled yet.</h2>
            <p>Pelargo does not currently charge subscription fees or provide plan management, invoices or payment methods. This section is reserved for billing when the product is ready for it.</p>
            <span className="subscription-state">No active subscription · No billing configured</span>
          </div>
        </section>}
        <footer className="workspace-footer"><span>Pelargo</span><span>Merchant checkout infrastructure</span><span>Testnet · Mainnet deposits disabled</span></footer>
      </div>
    </main>
  </div>;
}
