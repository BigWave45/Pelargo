import React, { useState } from "react";
import {
  ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, ExternalLink,
  ShieldCheck, Network, LockKeyhole, FileCheck2
} from "lucide-react";
import "../styles/judge-demo.css";

type Evidence = {
  chain: string;
  asset: string;
  amount: string;
  transaction: string;
  block: string;
  explorer: string;
  note: string;
};

type DemoOrder = {
  id: string;
  amount: string;
  created: string;
  providerStatus: string;
  source: Evidence;
  destination: Evidence;
  reconciliation?: string;
};

const orders: DemoOrder[] = [
  {
    id: "ORDER-71455096",
    amount: "5.000000 USDC",
    created: "7 Nov 2026",
    providerStatus: "Recorded separately",
    source: {
      chain: "Base Sepolia",
      asset: "USDC · ERC-20",
      amount: "5.063164 USDC",
      transaction: "0xbbccf1b245af1932f8feacb755d8574c6dd276965661123354f829ffb9f2ffd4",
      block: "55,749,245",
      explorer: "https://sepolia.basescan.org/tx/0xbbccf1b245af1932f8feacb755d8574c6dd276965661123354f829ffb9f2ffd4",
      note: "Source evidence was verified and recorded after the destination order had already settled."
    },
    destination: {
      chain: "NEAR testnet",
      asset: "usdc.tidepool-sandbox.testnet · NEP-141",
      amount: "5.000000 USDC",
      transaction: "EhTBbho5ZWgEUL2G8X36AizRWRKWcsJTzXzV3CvxVQbm",
      block: "276,660,519",
      explorer: "https://testnet.nearblocks.io/txns/EhTBbho5ZWgEUL2G8X36AizRWRKWcsJTzXzV3CvxVQbm",
      note: "Pelargo independently verified the finalized NEP-141 transfer, configured recipient and exact 5 USDC destination amount."
    },
    reconciliation: "The later source verification added provenance evidence. It did not reopen the order, change its paid/settled state or notify the provider again."
  },
  {
    id: "ORDER-35541967",
    amount: "1.000000 USDC",
    created: "7 Nov 2026",
    providerStatus: "SUCCESS",
    source: {
      chain: "Base Sepolia",
      asset: "USDC · ERC-20",
      amount: "1.012633 USDC",
      transaction: "0x886ff617f13d6eddb23d376eaf2437a90082b610f8c006de743b5df1a5464d5c",
      block: "55,569,210",
      explorer: "https://sepolia.basescan.org/tx/0x886ff617f13d6eddb23d376eaf2437a90082b610f8c006de743b5df1a5464d5c",
      note: "Persisted Base Sepolia source-deposit evidence, verified against the committed route."
    },
    destination: {
      chain: "NEAR testnet",
      asset: "usdc.tidepool-sandbox.testnet · NEP-141",
      amount: "1.000000 USDC",
      transaction: "9myMAuSbY4NAcCWDkhZUWqQLGTW47Z2dkrxjhGgtJspS",
      block: "276,599,398",
      explorer: "https://testnet.nearblocks.io/txns/9myMAuSbY4NAcCWDkhZUWqQLGTW47Z2dkrxjhGgtJspS",
      note: "Pelargo verified final NEAR execution, expected NEP-141 token, recipient agentg.testnet and exact destination amount."
    }
  }
];

function EvidencePanel({ title, evidence }: { title: string; evidence: Evidence }) {
  return <div className="judge-evidence-panel">
    <div className="judge-evidence-heading">
      <span>{title}</span>
      <strong>{evidence.chain}</strong>
    </div>
    <div className="judge-evidence-amount">{evidence.amount}</div>
    <div className="judge-evidence-meta"><span>Asset</span><strong>{evidence.asset}</strong></div>
    <div className="judge-evidence-meta"><span>Block</span><strong>{evidence.block}</strong></div>
    <div className="judge-evidence-hash">
      <span>Transaction hash</span>
      <code>{evidence.transaction}</code>
      <a href={evidence.explorer} target="_blank" rel="noreferrer">View on explorer <ExternalLink size={13}/></a>
    </div>
    <p>{evidence.note}</p>
  </div>;
}

export function JudgeDemo() {
  const [expanded, setExpanded] = useState<string | null>(orders[0].id);
  return <main className="judge-demo-shell">
    <header className="judge-demo-topbar">
      <a className="workspace-brand" href="/"><span className="workspace-brand-mark">p</span><span>pelargo</span></a>
      <a className="judge-demo-back" href="/"><ArrowLeft size={15}/> Merchant sign in</a>
    </header>
    <div className="judge-demo-content">
      <div className="judge-demo-kicker"><span className="judge-demo-dot"/> JUDGE ACCESS <span className="judge-demo-readonly"><LockKeyhole size={12}/> Read-only</span></div>
      <div className="judge-demo-intro">
        <div>
          <h1>Cross-chain payments, with settlement you can verify.</h1>
          <p>Explore Pelargo's merchant workspace using previously completed Base Sepolia to NEAR testnet payments. No account, wallet connection or transaction is required.</p>
        </div>
        <div className="judge-demo-proof-mark"><ShieldCheck size={34}/><span>NEAR settlement<br/>independently verified</span></div>
      </div>
      <div className="judge-demo-banner">
        <div><strong>Historical testnet evidence</strong><p>These are recorded transactions from the isolated Preview environment, not live activity. This demo is a fixed evidence view and does not connect to merchant accounts or payment services.</p></div>
        <span><LockKeyhole size={15}/> No actions enabled</span>
      </div>
      <section className="judge-demo-metrics">
        <article><span>Demonstrated route</span><strong>Base Sepolia → NEAR</strong><small>ERC-20 to NEP-141</small></article>
        <article><span>Historical settled orders</span><strong>2</strong><small>With source and destination evidence</small></article>
        <article><span>Settlement authority</span><strong>Chain RPC</strong><small>NEAR destination verification</small></article>
      </section>
      <section className="judge-demo-flow">
        <div className="judge-demo-section-title"><div><span>PAYMENT CONTROL FLOW</span><h2>What Pelargo verifies</h2></div><span>Merchant destination: NEAR</span></div>
        <div className="judge-demo-flow-steps">
          <div><span>01</span><Network size={18}/><strong>Buyer pays</strong><small>Supported source asset on Base Sepolia</small></div>
          <i>→</i>
          <div><span>02</span><FileCheck2 size={18}/><strong>Pelargo checks</strong><small>Order binding and transaction evidence</small></div>
          <i>→</i>
          <div><span>03</span><ShieldCheck size={18}/><strong>NEAR verifies</strong><small>Final execution, token, recipient and amount</small></div>
          <i>→</i>
          <div><span>04</span><CheckCircle2 size={18}/><strong>Order settles</strong><small>Paid only after matching evidence</small></div>
        </div>
      </section>
      <section className="judge-demo-orders">
        <div className="judge-demo-section-title"><div><span>MERCHANT ORDER RECORDS</span><h2>Completed payment evidence</h2></div><span>2 records</span></div>
        {orders.map(order => <article className="judge-demo-order" key={order.id}>
          <button className="judge-demo-order-toggle" type="button" aria-expanded={expanded === order.id} onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
            <div className="judge-demo-order-main">
              <span className="judge-demo-order-id">{order.id}</span>
              <strong>{order.amount}</strong>
              <small>{order.created} · {order.source.chain} to {order.destination.chain}</small>
            </div>
            <div className="judge-demo-order-state"><span><CheckCircle2 size={14}/> Paid · Settled</span><small>NEAR settlement verified</small></div>
            <ChevronDown className={expanded === order.id ? "is-expanded" : ""} size={18}/>
          </button>
          {expanded === order.id && <div className="judge-demo-order-detail">
            <div className="judge-demo-verification-note"><ShieldCheck size={17}/><div><strong>Settlement evidence persisted</strong><p>The merchant order is settled because the NEAR destination transfer matches the configured NEP-141 asset, recipient and exact amount. Provider status is recorded separately and is not the settlement authority.</p></div></div>
            <div className="judge-demo-evidence-grid">
              <EvidencePanel title="SOURCE PAYMENT" evidence={order.source}/>
              <EvidencePanel title="NEAR SETTLEMENT" evidence={order.destination}/>
            </div>
            {order.reconciliation && <div className="judge-demo-reconciliation"><strong>Reconciliation detail</strong><p>{order.reconciliation}</p></div>}
            <div className="judge-demo-order-foot"><span>Provider status: {order.providerStatus}</span><span>Verification source: chain_rpc</span></div>
          </div>}
        </article>)}
      </section>
      <footer className="judge-demo-footer">
        <span>Pelargo · Pay across chains. Settle on NEAR.</span>
        <a href="https://github.com/BigWave45/Pelargo" target="_blank" rel="noreferrer">Review source code <ArrowUpRight size={13}/></a>
      </footer>
    </div>
  </main>;
}
