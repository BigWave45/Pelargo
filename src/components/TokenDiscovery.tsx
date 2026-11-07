import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, AlertCircle, CheckCircle2 } from "lucide-react";

type SupportedToken = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: string;
  priceUpdatedAt?: string;
  contractAddress?: string;
};

function shortAssetId(assetId: string) {
  if (assetId.length < 42) return assetId;
  return assetId.slice(0, 22) + "…" + assetId.slice(-12);
}

export function TokenDiscovery() {
  const [tokens, setTokens] = useState<SupportedToken[]>([]);
  const [query, setQuery] = useState("");
  const [chain, setChain] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const loadTokens = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/tokens", {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        const message = typeof payload?.message === "string"
          ? payload.message
          : typeof payload?.error === "string" ? payload.error : `Token service returned HTTP ${response.status}`;
        throw new Error(message);
      }
      const list = Array.isArray(payload) ? payload : Array.isArray(payload?.tokens) ? payload.tokens : null;
      if (!list) throw new Error("The token service returned an unexpected response.");
      const valid = list.filter((item: any) =>
        item && typeof item.assetId === "string" &&
        typeof item.symbol === "string" &&
        typeof item.blockchain === "string" &&
        Number.isInteger(item.decimals)
      ) as SupportedToken[];
      if (!valid.length) throw new Error("No valid supported assets were returned by the token service.");
      setTokens(valid);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load supported assets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadTokens(); }, []);

  const chains = useMemo(
    () => Array.from(new Set(tokens.map((token) => token.blockchain))).sort(),
    [tokens]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tokens.filter((token) => {
      const matchesChain = chain === "all" || token.blockchain === chain;
      const matchesQuery = !needle ||
        token.symbol.toLowerCase().includes(needle) ||
        token.blockchain.toLowerCase().includes(needle) ||
        token.assetId.toLowerCase().includes(needle);
      return matchesChain && matchesQuery;
    }).sort((a, b) =>
      a.blockchain.localeCompare(b.blockchain) || a.symbol.localeCompare(b.symbol)
    );
  }, [tokens, query, chain]);

  return (
    <section className="workspace-card" aria-label="Live supported payment assets">
      <div className="card-heading">
        <div>
          <h3>Supported payment assets</h3>
          <p>Live asset discovery from NEAR Intents. These are available routes, not connected wallets.</p>
        </div>
        <button className="quiet-button" onClick={() => void loadTokens()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "token-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="token-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="token-toolbar">
        <label className="token-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search token or network" />
        </label>
        <select aria-label="Filter by network" value={chain} onChange={(event) => setChain(event.target.value)}>
          <option value="all">All networks</option>
          {chains.map((name) => <option value={name} key={name}>{name}</option>)}
        </select>
      </div>

      {loading && tokens.length === 0 ? (
        <div className="token-empty"><RefreshCw size={17} className="token-spin" /> Loading supported assets…</div>
      ) : !error && filtered.length === 0 ? (
        <div className="token-empty">No supported assets match this search.</div>
      ) : (
        <div className="token-list">
          {filtered.slice(0, 80).map((token) => (
            <div className="token-row" key={token.assetId}>
              <span className="token-symbol">{token.symbol.slice(0, 3).toUpperCase()}</span>
              <span className="token-main">
                <strong>{token.symbol}</strong>
                <small>{token.blockchain} · {token.decimals} decimals</small>
                <code title={token.assetId}>{shortAssetId(token.assetId)}</code>
              </span>
              <span className="token-live"><CheckCircle2 size={13} /> Supported</span>
            </div>
          ))}
        </div>
      )}

      <div className="token-foot">
        <span>{tokens.length ? `${tokens.length} assets across ${chains.length} networks` : "Asset catalogue unavailable"}</span>
        <span>{lastUpdated ? `Updated ${lastUpdated}` : "Not yet refreshed"}</span>
      </div>
    </section>
  );
}
