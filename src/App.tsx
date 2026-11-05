import React, { useEffect, useMemo, useState } from "react";
import { PelargoCheckout } from "./components/PelargoCheckout.tsx";
import {
  ArrowUpRight, Check, Copy, LayoutDashboard, LogOut, Menu, Radio,
  Settings2, ShieldCheck, Wallet, Code2, Link2, RefreshCw
} from "lucide-react";
import "./styles/workspace.css";

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
type Section = "overview" | "destination" | "checkout" | "developers";

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
    throw new Error(`${data.error || `Request failed (${response.status})`}${detail}`);
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
    api<{ session: CheckoutSession }>(`/api/checkout-session?token=${encodeURIComponent(token)}`)
      .then(data => { if (live) setSession(data.session); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : "Checkout session unavailable."); });
    return () => { live = false; };
  }, [token]);
  if (error) return <div className="auth-shell"><div className="auth-card"><h1>Checkout unavailable</h1><p>{error}</p></div></div>;
  if (!session) return <div className="auth-shell"><div className="auth-card">Loading secure checkout…</div></div>;
  return <main className="buyer-checkout-shell">
    <div className="buyer-checkout-head"><a className="workspace-brand" href="/"><span className="workspace-brand-mark">p</span><span>pelargo</span></a><span>Secure checkout</span></div>
    <div className="buyer-checkout-card">
      <div className="eyebrow">PAYMENT REQUEST</div><h1>Pay {session.merchantName}</h1>
      <p className="workspace-subtitle">Order {session.orderId} · {session.amount} {session.destinationSymbol}</p>
      <PelargoCheckout merchantName={session.merchantName} destinationSymbol={session.destinationSymbol}
        destinationNetwork={session.destinationNetwork} recipient={session.recipient} orderId={session.orderId}
        amount={session.amount} fixedAmount sessionToken={token} sessionExpiresAt={session.expiresAt} />
      <p className="auth-footnote">Only send funds to the deposit instructions generated by this checkout. Creating a quote does not send funds.</p>
    </div>
  </main>;
}

export default function App() {
  const buyerToken = useMemo(() => new URLSearchParams(window.location.search).get("checkout") || "", []);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [section, setSection] = useState<Section>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
    if (buyerToken) return;
    api<{ merchant: Merchant }>("/api/auth/session")
      .then(data => setMerchant(data.merchant))
      .catch(() => setMerchant(null))
      .finally(() => setAuthChecked(true));
  }, [buyerToken]);

  useEffect(() => {
    if (!merchant) return;
    refreshWorkspace().catch(e => setError(e instanceof Error ? e.message : "Unable to load workspace."));
  }, [merchant]);

  if (buyerToken) return <BuyerCheckout token={buyerToken} />;
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
      const link = `${window.location.origin}/?checkout=${encodeURIComponent(result.token)}`;
      setCreatedLink(link);
      // Advance the form to a fresh reference so a replacement link cannot collide with the expired order.
      setOrderId(`ORDER-${Date.now().toString().slice(-8)}`);
      await refreshWorkspace();
      setNotice("Checkout link created. Share it with your buyer.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create checkout."); }
    finally { setBusy(false); }
  }

  async function submitSourceDeposit(event: React.FormEvent) {
    event.preventDefault();
    if (!recoveryOrderId) return;
    setRecoveryBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{
        originDeposit: string; providerNotification: string; providerStatus: string;
        sourceTransactionHash: string; nearTxHashes?: string[];
      }>("/api/deposit-submit", {
        method: "POST",
        body: JSON.stringify({ orderId: recoveryOrderId, transactionHash: sourceTransactionHash.trim() }),
      });
      const settlement = await api<{ paymentStatus: string; providerStatus: string; settlement: string }>(
        `/api/payment-status?orderId=${encodeURIComponent(recoveryOrderId)}`
      ).catch(() => null);
      await refreshWorkspace();
      setNotice(settlement?.settlement === "verified"
        ? "Source deposit verified. Destination settlement independently verified; order is paid."
        : `Source deposit verified and provider notified. Provider status: ${settlement?.providerStatus || result.providerStatus}. Settlement: ${settlement?.settlement || "pending provider confirmation"}.`);
      setSourceTransactionHash("");
      setRecoveryOrderId("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reconcile source deposit."); }
    finally { setRecoveryBusy(false); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    setMerchant(null); setAuthChecked(true);
  }

  const title = nav.find(item => item.id === section)?.label ?? "Overview";
  return <div className="workspace">
    <aside className={`workspace-sidebar ${mobileNavOpen ? "workspace-sidebar--open" : ""}`}>
      <a className="workspace-brand" href="#" onClick={e => { e.preventDefault(); setSection("overview"); }}><span className="workspace-brand-mark">p</span><span>pelargo</span></a>
      <div className="workspace-side-label">WORKSPACE</div>
      <nav className="workspace-nav" aria-label="Main navigation">
        {nav.map(({ id, label, icon: Icon }) => <button key={id} className={`workspace-nav-item ${section === id ? "is-active" : ""}`} onClick={() => { setSection(id); setMobileNavOpen(false); }}><Icon size={17} /><span>{label}</span></button>)}
      </nav>
      <div className="workspace-sidebar-bottom">
        <div className="workspace-profile"><div className="workspace-avatar">{merchant.name.slice(0, 2).toUpperCase()}</div><div className="workspace-profile-copy"><strong>{merchant.name}</strong><span>{merchant.email}</span></div><button className="icon-action" onClick={logout} aria-label="Sign out"><LogOut size={15} /></button></div>
      </div>
    </aside>
    <main className="workspace-main">
      <header className="workspace-topbar">
        <button className="workspace-mobile-menu" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label="Toggle navigation"><Menu size={20} /></button>
        <div className="workspace-breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{title}</strong></div>
        <div className="workspace-topbar-right"><span className="environment-pill"><i /> Testnet checkout</span></div>
      </header>
      <div className="workspace-content">
        {error && <div className="notice-panel auth-error" role="alert">{error}</div>}
        {notice && <div className="notice-panel auth-success" role="status">{notice}</div>}
        {section === "overview" && <>
          <div className="workspace-heading-row"><div><div className="eyebrow">MERCHANT WORKSPACE</div><h1>Overview</h1><p className="workspace-subtitle">Manage your settlement destination and create buyer checkout links.</p></div><button className="quiet-button" onClick={() => setSection("destination")}><Settings2 size={15} /> Configure payments</button></div>
          <section className="welcome-panel"><div className="welcome-copy"><div className="eyebrow light">PE LARGO CHECKOUT</div><h2>One checkout. Multiple payment networks.</h2><p>Buyers choose a supported source asset. Your business defines its settlement destination.</p><button className="welcome-link" onClick={() => setSection("checkout")}>Create a checkout <ArrowUpRight size={15} /></button></div><div className="welcome-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core">p</div></div></section>
          <div className="section-heading"><div><h2>Payment activity</h2><p>Orders belonging to this merchant account.</p></div><button className="quiet-button" onClick={() => refreshWorkspace().catch(e => setError(String(e)))}><RefreshCw size={14} /> Refresh</button></div>
          <section className="workspace-card">
            {orders.length === 0 ? <div className="empty-state"><div className="empty-icon"><Radio size={20} /></div><strong>No checkout orders yet</strong><p>Save a destination and create your first checkout link.</p></div> :
              <div className="order-list">{orders.map(order => <div className="order-row" key={order.orderId}><div><strong>{order.orderId}</strong><span>{order.destinationSymbol || "Asset"} · {new Date(order.createdAt).toLocaleString()}</span></div><span className="readiness-state state-pending">{order.status.replaceAll("_", " ")}</span>{["quote_committed", "awaiting_deposit", "deposit_detected", "processing"].includes(order.status) && <button className="quiet-button" type="button" onClick={() => { setRecoveryOrderId(order.orderId); setSourceTransactionHash(""); }}>Reconcile deposit</button>}</div>)}</div>}
          </section>
          {recoveryOrderId && <form className="form-panel" onSubmit={submitSourceDeposit}>
            <div className="form-panel-heading"><span className="form-icon"><ShieldCheck size={18} /></span><div><h2>Reconcile source deposit</h2><p>Submit the existing source-chain transaction for {recoveryOrderId}. Pelargo verifies the token contract, deposit address and exact quoted amount before notifying the provider. This does not move funds.</p></div></div>
            <label className="field-label" htmlFor="source-transaction-hash">Base Sepolia transaction hash</label>
            <input id="source-transaction-hash" className="workspace-input mono-input" value={sourceTransactionHash} onChange={e => setSourceTransactionHash(e.target.value)} placeholder="0x…" required pattern="0x[a-fA-F0-9]{64}" maxLength={66} />
            <div className="form-footer"><button className="quiet-button" type="button" onClick={() => setRecoveryOrderId("")}>Cancel</button><button className="primary-button" disabled={recoveryBusy}>{recoveryBusy ? "Verifying deposit…" : "Verify and notify provider"} <ArrowUpRight size={15} /></button></div>
          </form>}
        </>}
        {section === "destination" && <>
          <div className="workspace-heading-row"><div><div className="eyebrow">MERCHANT CONFIGURATION</div><h1>Payment destination</h1><p className="workspace-subtitle">Set the asset and NEAR address your business wants to receive.</p></div></div>
          <form className="form-panel" onSubmit={saveSettings}>
            <div className="form-panel-heading"><span className="form-icon"><Wallet size={18} /></span><div><h2>Settlement details</h2><p>These values are saved to your merchant account and used when issuing checkout sessions.</p></div></div>
            <label className="field-label" htmlFor="merchant-name">Business name</label><input id="merchant-name" className="workspace-input" value={settings.name || ""} onChange={e => setSettings({ ...settings, name: e.target.value })} required maxLength={120} />
            <label className="field-label" htmlFor="destination-asset">NEAR Intents destination asset ID</label><input id="destination-asset" className="workspace-input mono-input" value={settings.destinationAsset || ""} onChange={e => setSettings({ ...settings, destinationAsset: e.target.value })} placeholder="e.g. nep141:usdc.omft.near" required maxLength={256} />
            <div className="field-grid">
              <div><label className="field-label" htmlFor="destination-symbol">Asset symbol</label><input id="destination-symbol" className="workspace-input" value={settings.destinationSymbol || ""} onChange={e => setSettings({ ...settings, destinationSymbol: e.target.value })} placeholder="USDC" required maxLength={32} /></div>
              <div><label className="field-label" htmlFor="destination-decimals">Token decimals</label><input id="destination-decimals" className="workspace-input" type="number" min="0" max="30" value={settings.destinationDecimals} onChange={e => setSettings({ ...settings, destinationDecimals: Number(e.target.value) })} required /></div>
            </div>
            <label className="field-label" htmlFor="destination-network">Settlement network</label><select id="destination-network" className="workspace-input" value={settings.destinationNetwork || "NEAR"} onChange={e => setSettings({ ...settings, destinationNetwork: e.target.value })} required><option value="NEAR">NEAR · Tidepool testnet</option></select>
            <label className="field-label" htmlFor="recipient">NEAR recipient address</label><input id="recipient" className="workspace-input mono-input" value={settings.recipient || ""} onChange={e => setSettings({ ...settings, recipient: e.target.value })} placeholder="account.near or supported token receiver" required maxLength={256} />
            <div className="field-hint"><ShieldCheck size={14} /> Use a public recipient address only. Never enter a seed phrase or private key. Confirm the token ID and decimal precision against the provider catalogue before accepting payments.</div>
            <div className="form-footer"><span>Changes are saved to your account.</span><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save destination"} <ArrowUpRight size={15} /></button></div>
          </form>
        </>}
        {section === "checkout" && <>
          <div className="workspace-heading-row"><div><div className="eyebrow">BUYER PAYMENT LINK</div><h1>Create checkout</h1><p className="workspace-subtitle">Generate a short-lived, signed checkout session for a specific order.</p></div></div>
          <form className="form-panel" onSubmit={createCheckout}>
            <div className="form-panel-heading"><span className="form-icon"><Link2 size={18} /></span><div><h2>New checkout</h2><p>Checkout sessions expire after 15 minutes. Creating a link does not move funds.</p></div></div>
            <label className="field-label" htmlFor="order-id">Order reference</label><input id="order-id" className="workspace-input" value={orderId} onChange={e => setOrderId(e.target.value)} required maxLength={256} />
            <label className="field-label" htmlFor="order-amount">Amount ({settings.destinationSymbol || "destination asset"})</label><input id="order-amount" className="workspace-input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required />
            <div className="field-hint">Destination: {settings.destinationSymbol || "Not configured"} · {settings.destinationNetwork || "NEAR"}. Configure and save your destination before creating a link.</div>
            <div className="form-footer"><span>Buyer does not need a Pelargo account.</span><button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create checkout link"} <ArrowUpRight size={15} /></button></div>
          </form>
          {createdLink && <section className="workspace-card generated-link"><div className="card-heading"><div><h3>Checkout link created</h3><p>Share this URL with the buyer. It is a bearer link and should be treated as private to this order.</p></div><Check size={18} /></div><div className="generated-link-value">{createdLink}</div><button className="quiet-button" onClick={async () => { await navigator.clipboard.writeText(createdLink); setCopied(true); }}><Copy size={14} /> {copied ? "Copied" : "Copy checkout link"}</button></section>}
        </>}
        {section === "developers" && <>
          <div className="workspace-heading-row"><div><div className="eyebrow">DEVELOPER TOOLS</div><h1>Integration</h1><p className="workspace-subtitle">Use the server-side API to create signed checkout sessions for your own orders.</p></div></div>
          <section className="workspace-card api-card"><div className="card-heading"><div><h3>Available endpoints</h3><p>Merchant dashboard uses secure cookie sessions. Server integrations use merchant API credentials.</p></div><Code2 size={17} /></div><div className="api-row"><code>POST /api/checkout-session</code><span>Create a signed order session.</span></div><div className="api-row"><code>GET /api/order?orderId=…</code><span>Retrieve an order scoped to the authenticated merchant.</span></div><div className="api-row"><code>GET /api/payment-status?orderId=…</code><span>Poll payment status; paid state requires independent settlement verification.</span></div><div className="api-row"><code>POST /api/deposit-submit</code><span>Verify an origin-chain deposit against the saved quote and notify the provider.</span></div></section>
          <div className="notice-panel"><strong>Testnet readiness is still being verified.</strong><p>Do not use this checkout for mainnet payments. A committed quote creates deposit instructions; the buyer must still send funds, and Pelargo marks an order paid only after independent settlement verification.</p></div>
        </>}
        <footer className="workspace-footer"><span>Pelargo</span><span>Merchant checkout infrastructure</span><span>Testnet · Mainnet deposits disabled</span></footer>
      </div>
    </main>
  </div>;
}
