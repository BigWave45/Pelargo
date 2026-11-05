import React, { useState } from "react";
import { PelargoCheckout } from "./components/PelargoCheckout.tsx";
import {
  ArrowUpRight, Check, ChevronDown, Code2, Copy, ExternalLink,
  FileCode2, LayoutDashboard, Link2, Radio, Settings2, ShieldCheck,
  Wallet, Webhook, CircleHelp, Menu
} from "lucide-react";
import "./styles/workspace.css";

type Section = "overview" | "destination" | "checkout" | "developers";

const navigation: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "destination", label: "Payment destination", icon: Wallet },
  { id: "checkout", label: "Checkout", icon: Settings2 },
  { id: "developers", label: "Developers", icon: Code2 },
];

export default function App() {
  const [section, setSection] = useState<Section>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [merchantName, setMerchantName] = useState("Your business");
  const [asset, setAsset] = useState("USDC");
  const [network, setNetwork] = useState("Base");
  const [recipient, setRecipient] = useState("");
  const [copied, setCopied] = useState(false);

  const copySnippet = async () => {
    const snippet = `<script type="module" src="https://YOUR_PELARGO_HOST/pelargo.js"></script>
<pelargo-checkout
  merchant-name="${merchantName || "Your business"}"
  amount="25.00"
  order-id="ORDER-123"
  destination-symbol="${asset}"
  destination-network="${network}"
  recipient="${recipient || "YOUR_RECIPIENT_ADDRESS"}"
  session-token="SIGNED_SESSION_TOKEN">
</pelargo-checkout>`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const title = navigation.find((item) => item.id === section)?.label ?? "Overview";

  return (
    <div className="workspace">
      <aside className={`workspace-sidebar ${mobileNavOpen ? "workspace-sidebar--open" : ""}`}>
        <a className="workspace-brand" href="#" onClick={(event) => { event.preventDefault(); setSection("overview"); }}>
          <span className="workspace-brand-mark">p</span>
          <span>pelargo</span>
        </a>
        <div className="workspace-side-label">WORKSPACE</div>
        <nav className="workspace-nav" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`workspace-nav-item ${section === id ? "is-active" : ""}`}
              onClick={() => { setSection(id); setMobileNavOpen(false); }}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="workspace-sidebar-bottom">
          <div className="workspace-help"><CircleHelp size={16} /><span>Documentation</span><ArrowUpRight size={13} /></div>
          <div className="workspace-profile">
            <div className="workspace-avatar">YB</div>
            <div className="workspace-profile-copy"><strong>Workspace owner</strong><span>Merchant account</span></div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <button className="workspace-mobile-menu" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label="Toggle navigation"><Menu size={20} /></button>
          <div className="workspace-breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{title}</strong></div>
          <div className="workspace-topbar-right"><span className="environment-pill"><i /> Prototype environment</span><button className="workspace-help-icon" aria-label="Help"><CircleHelp size={18} /></button></div>
        </header>

        <div className="workspace-content">
          {section === "overview" && (
            <>
              <div className="workspace-heading-row">
                <div><div className="eyebrow">MERCHANT WORKSPACE</div><h1>Overview</h1><p className="workspace-subtitle">Configure how your customers pay and how your business receives settlement.</p></div>
                <button className="quiet-button" onClick={() => setSection("destination")}><Settings2 size={15} /> Configure payments</button>
              </div>

              <section className="welcome-panel">
                <div className="welcome-copy"><div className="eyebrow light">GETTING STARTED</div><h2>One checkout. Multiple payment networks.</h2><p>Accept payment in supported assets while defining the asset and address your business wants to receive.</p><button className="welcome-link" onClick={() => setSection("destination")}>Set up your destination <ArrowUpRight size={15} /></button></div>
                <div className="welcome-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core">p</div><span className="orbit-node node-one">◎</span><span className="orbit-node node-two">Ξ</span><span className="orbit-node node-three">◈</span></div>
              </section>

              <div className="section-heading"><div><h2>Setup status</h2><p>Core requirements before a live checkout can be enabled.</p></div><span className="status-outline">0 of 3 complete</span></div>
              <div className="setup-grid">
                <button className="setup-card" onClick={() => setSection("destination")}><span className="setup-icon"><Wallet size={18} /></span><span className="setup-card-copy"><strong>Payment destination</strong><small>Choose the asset and wallet address to receive.</small><em>Configure destination <ArrowUpRight size={13} /></em></span><span className="setup-number">01</span></button>
                <button className="setup-card" onClick={() => setSection("checkout")}><span className="setup-icon"><Settings2 size={18} /></span><span className="setup-card-copy"><strong>Checkout preferences</strong><small>Review the buyer payment experience.</small><em>Review checkout <ArrowUpRight size={13} /></em></span><span className="setup-number">02</span></button>
                <button className="setup-card" onClick={() => setSection("developers")}><span className="setup-icon"><FileCode2 size={18} /></span><span className="setup-card-copy"><strong>Integration</strong><small>Prepare your website integration.</small><em>View integration <ArrowUpRight size={13} /></em></span><span className="setup-number">03</span></button>
              </div>

              <div className="workspace-bottom-grid">
                <section className="workspace-card"><div className="card-heading"><div><h3>Payment activity</h3><p>Verified settlement events will appear here.</p></div><span className="muted-tag">No live data</span></div><div className="empty-state"><div className="empty-icon"><Radio size={20} /></div><strong>No payment activity yet</strong><p>Transactions will appear after checkout is connected and a settlement is verified.</p></div></section>
                <section className="workspace-card readiness-card"><div className="card-heading"><div><h3>Service readiness</h3><p>Current integration state</p></div><ShieldCheck size={18} /></div><div className="readiness-row"><span>Token discovery API</span><span className="readiness-state state-unverified">Needs verification</span></div><div className="readiness-row"><span>Quote generation</span><span className="readiness-state state-unverified">Needs verification</span></div><div className="readiness-row"><span>Settlement tracking</span><span className="readiness-state state-pending">Not connected</span></div><p className="readiness-note">No live payment processing is enabled. This workspace does not report simulated transactions as real activity.</p></section>
              </div>
            </>
          )}

          {section === "destination" && (
            <>
              <div className="workspace-heading-row"><div><div className="eyebrow">CONFIGURATION</div><h1>Payment destination</h1><p className="workspace-subtitle">Choose where Pelargo should route successful customer payments.</p></div><span className="draft-pill">Local draft</span></div>
              <section className="form-panel">
                <div className="form-panel-heading"><span className="form-icon"><Wallet size={18} /></span><div><h2>Settlement details</h2><p>This is the asset and address your business intends to receive.</p></div></div>
                <label className="field-label" htmlFor="merchant-name">Business name</label><input id="merchant-name" className="workspace-input" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Your business name" />
                <div className="field-grid"><div><label className="field-label" htmlFor="asset">Settlement asset</label><select id="asset" className="workspace-input" value={asset} onChange={(e) => setAsset(e.target.value)}><option>USDC</option><option>USDT</option><option>ETH</option><option>NEAR</option></select></div><div><label className="field-label" htmlFor="network">Network</label><select id="network" className="workspace-input" value={network} onChange={(e) => setNetwork(e.target.value)}><option>Base</option><option>Ethereum</option><option>Arbitrum</option><option>NEAR</option></select></div></div>
                <label className="field-label" htmlFor="recipient">Recipient wallet address</label><input id="recipient" className="workspace-input mono-input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Enter a public wallet address" />
                <div className="field-hint"><ShieldCheck size={14} /> Use an address compatible with the selected settlement network. Never enter a seed phrase or private key.</div>
                <div className="form-footer"><span>Changes are held in this browser session only.</span><button className="primary-button" disabled={!merchantName.trim() || !recipient.trim()} onClick={() => window.alert("This prototype does not persist merchant settings yet. No configuration was saved.")}>Save destination <ArrowUpRight size={15} /></button></div>
              </section>
              <div className="notice-panel"><strong>Persistence is not implemented yet.</strong><p>The form is a layout and interaction prototype. Saving is deliberately disabled at the backend level until merchant identity, validation and secure configuration storage are implemented.</p></div>
            </>
          )}

          {section === "checkout" && (
            <>
              <div className="workspace-heading-row"><div><div className="eyebrow">INTENTS ROUTE DISCOVERY</div><h1>Checkout assets</h1><p className="workspace-subtitle">Pelargo reads the currently supported source assets from NEAR Intents. The embeddable buyer flow will use this catalogue dynamically.</p></div><span className="draft-pill">Live API · read only</span></div>
              <PelargoCheckout
                merchantName={merchantName}
                destinationSymbol={asset}
                destinationNetwork={network}
                recipient={recipient}
                orderId="LOCAL-PREVIEW"
              />
              <div className="notice-panel"><strong>Quote preview only.</strong><p>This component uses live token discovery and requests a dry exact-output quote. It does not connect a wallet, create a deposit address, initiate a transfer or mark an order paid. Configure a compatible destination and recipient address first.</p></div>
            </>
          )}

          {section === "developers" && (
            <>
              <div className="workspace-heading-row"><div><div className="eyebrow">BUILD WITH PELARGO</div><h1>Developer integration</h1><p className="workspace-subtitle">Connect Pelargo to your existing checkout rather than sending customers to a separate storefront.</p></div><span className="draft-pill">SDK in development</span></div>
              <section className="integration-panel"><div className="integration-panel-copy"><span className="integration-icon"><Code2 size={19} /></span><h2>Embed checkout</h2><p>The intended integration is a lightweight checkout component configured with an order amount and your verified settlement destination.</p><div className="integration-facts"><div><Check size={15} /><span>Merchant-defined settlement asset</span></div><div><Check size={15} /><span>Buyer-selected supported payment asset</span></div><div><Check size={15} /><span>Settlement verification before paid status</span></div></div></div><div className="code-panel"><div className="code-panel-head"><span>HTML · PROPOSED API</span><button onClick={copySnippet}><Copy size={14} />{copied ? "Copied" : "Copy"}</button></div><pre>{`<script type="module" src="https://YOUR_PELARGO_HOST/pelargo.js"></script>
<pelargo-checkout
  merchant-name="${merchantName || "Your business"}"
  amount="25.00"
  order-id="ORDER-123"
  destination-symbol="${asset}"
  destination-network="${network}"
  recipient="${recipient || "YOUR_RECIPIENT_ADDRESS"}">
</pelargo-checkout>`}</pre><div className="code-panel-foot">Embed contract preview. Replace the host and order values; do not use client-supplied attributes as trusted payment authority.</div></div></section>
              <div className="notice-panel"><strong>Integration is not ready for production.</strong><p>The public SDK, authenticated order creation, webhook delivery and persistent order records have not been implemented. Do not paste this illustrative snippet into a live store.</p></div>
              <section className="workspace-card api-card"><div className="card-heading"><div><h3>API surface</h3><p>Server-side routes currently present in this branch.</p></div><Link2 size={17} /></div><div className="api-row"><code>GET /api/tokens</code><span>Proxy scaffold · verification pending</span></div><div className="api-row"><code>POST /api/quote</code><span>Dry quote validation · schema corrected, retest pending</span></div><div className="api-row"><code>GET /api/status</code><span>Proxy scaffold · end-to-end lifecycle not connected</span></div></section>
            </>
          )}
          <footer className="workspace-footer"><span>Pelargo</span><span>Merchant checkout infrastructure</span><span>Prototype · Mainnet deposits disabled</span></footer>
        </div>
      </main>
    </div>
  );
}
