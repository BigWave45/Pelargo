import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Clock3, LoaderCircle, RefreshCw, Wallet, CheckCircle2 } from "lucide-react";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};
declare global { interface Window { ethereum?: Eip1193Provider } }

const BASE_SEPOLIA_CHAIN_ID = "0x14a34";

function waitForInjectedProvider(timeoutMs = 3000): Promise<Eip1193Provider | null> {
  if (window.ethereum) return Promise.resolve(window.ethereum);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (provider: Eip1193Provider | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("ethereum#initialized", handleInitialized);
      window.clearTimeout(timer);
      resolve(provider);
    };
    const handleInitialized = () => finish(window.ethereum ?? null);
    window.addEventListener("ethereum#initialized", handleInitialized, { once: true });
    const timer = window.setTimeout(() => finish(window.ethereum ?? null), timeoutMs);
    // Recheck after registering the event listener to close the injection race.
    if (window.ethereum) finish(window.ethereum);
  });
}
const BASE_SEPOLIA_CHAIN = {
  chainId: BASE_SEPOLIA_CHAIN_ID,
  chainName: "Base Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://sepolia.base.org"],
  blockExplorerUrls: ["https://sepolia-sepolia.blockscout.com"],
};

function baseSepoliaTokenContract(assetId: string): string | null {
  const match = /^nep141:base-(0x[a-fA-F0-9]{40})\.tp-omft\.testnet$/i.exec(assetId);
  return match?.[1] ?? null;
}

function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

type Token = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
};

type QuoteResponse = {
  correlationId?: string;
  quote?: {
    amountIn?: string;
    amountInFormatted?: string;
    amountInUsd?: string;
    amountOut?: string;
    amountOutFormatted?: string;
    amountOutUsd?: string;
    minAmountIn?: string;
    maxAmountIn?: string;
    deadline?: string;
    timeEstimate?: number;
    depositAddress?: string;
    depositMemo?: string | null;
  };
  message?: string;
  error?: string;
};

export type PelargoCheckoutProps = {
  merchantName?: string;
  destinationSymbol: string;
  destinationNetwork: string;
  recipient: string;
  orderId: string;
  destinationAssetId?: string;
  amount?: string;
  apiBaseUrl?: string;
  fixedAmount?: boolean;
  sessionToken?: string;
  sessionExpiresAt?: string;
};

const NETWORK_ALIASES: Record<string, string[]> = {
  base: ["base"],
  ethereum: ["eth", "ethereum"],
  arbitrum: ["arb", "arbitrum"],
  near: ["near"],
  solana: ["sol", "solana"],
  bitcoin: ["btc", "bitcoin"],
  bnb: ["bsc", "bnb"],
  polygon: ["pol", "polygon"],
};

function toAtomicUnits(value: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) {
    throw new Error("Enter a valid positive amount.");
  }
  const [whole, fraction = ""] = value.trim().split(".");
  if (fraction.length > decimals) {
    throw new Error(`This asset supports at most ${decimals} decimal places.`);
  }
  const atomic = BigInt(whole) * (10n ** BigInt(decimals)) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (atomic <= 0n) throw new Error("Amount must be greater than zero.");
  return atomic.toString();
}

function displayNetwork(token: Token): string {
  // Tidepool exposes Base Sepolia assets with a generic "base" blockchain
  // field; the testnet OMFT suffix is the authoritative network distinction.
  if (token.assetId.startsWith("nep141:base-") && token.assetId.endsWith(".tp-omft.testnet")) {
    return "Base Sepolia";
  }
  return token.blockchain;
}

function formatExpiry(value?: string) {
  if (!value) return "Not supplied";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

export function PelargoCheckout({
  merchantName = "Merchant",
  destinationSymbol,
  destinationNetwork,
  recipient,
  orderId,
  destinationAssetId,
  amount: initialAmount = "25.00",
  apiBaseUrl = "",
  fixedAmount = false,
  sessionToken = "",
  sessionExpiresAt = "",
}: PelargoCheckoutProps) {
  const recoveryKey = `pelargo:checkout-recovery:v1:${orderId}:${sessionExpiresAt}:${recipient}`;
  type RecoveryState = {
    version: 1;
    orderId: string;
    sessionExpiresAt: string;
    recipient: string;
    sourceAssetId?: string;
    refundTo?: string;
    paymentInstructions?: { address: string; memo?: string | null; quoteId: string; amountIn: string; amountInFormatted?: string; deadline?: string };
    walletTxHash?: string;
  };
  function readRecovery(): RecoveryState | null {
    try {
      const raw = window.localStorage.getItem(recoveryKey);
      if (!raw) return null;
      const saved = JSON.parse(raw) as RecoveryState;
      if (saved.version !== 1 || saved.orderId !== orderId || saved.sessionExpiresAt !== sessionExpiresAt || saved.recipient !== recipient) return null;
      return saved;
    } catch { return null; }
  }
  const [recovery] = useState<RecoveryState | null>(readRecovery);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [sourceAssetId, setSourceAssetId] = useState(recovery?.sourceAssetId ?? "");
  const [refundTo, setRefundTo] = useState(recovery?.refundTo ?? "");
  const [amount, setAmount] = useState(initialAmount);

  useEffect(() => {
    setAmount(initialAmount);
    clearQuote();
  }, [initialAmount]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<QuoteResponse["quote"] | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const [requestedAt, setRequestedAt] = useState("");
  const [committing, setCommitting] = useState(false);
  const [paymentInstructions, setPaymentInstructions] = useState<RecoveryState["paymentInstructions"]>(recovery?.paymentInstructions ?? null);
  const [paymentStatus, setPaymentStatus] = useState<{ paymentStatus: string; providerStatus?: string; settlement?: string } | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChainId, setWalletChainId] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletBalance, setWalletBalance] = useState("");
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);
  const [walletTxHash, setWalletTxHash] = useState(recovery?.walletTxHash ?? "");
  const [statusError, setStatusError] = useState("");
  const quoteRequestRef = useRef(0);
  const [clockNow, setClockNow] = useState(Date.now());
  const sessionExpiryMs = sessionExpiresAt ? Date.parse(sessionExpiresAt) : Number.NaN;
  const sessionExpired = Number.isFinite(sessionExpiryMs) && clockNow >= sessionExpiryMs;
  const quoteExpiryMs = paymentInstructions?.deadline ? Date.parse(paymentInstructions.deadline) : Number.NaN;
  const quoteExpired = Number.isFinite(quoteExpiryMs) && clockNow >= quoteExpiryMs;

  useEffect(() => {
    if (!Number.isFinite(sessionExpiryMs)) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sessionExpiryMs]);

  function clearQuote() {
    quoteRequestRef.current += 1;
    setQuote(null);
    setQuoteId("");
    setRequestedAt("");
    setPaymentInstructions(null);
    setPaymentStatus(null);
    setWalletTxHash("");
    setStatusError("");
    setQuoting(false);
    setCommitting(false);
  }

  const checkoutConfigInitialized = useRef(false);
  useEffect(() => {
    // The first render may be restoring a committed quote from local storage.
    // Only clear state when the merchant changes the checkout identity later.
    if (!checkoutConfigInitialized.current) {
      checkoutConfigInitialized.current = true;
      return;
    }
    clearQuote();
  }, [destinationSymbol, destinationNetwork, recipient, orderId]);

  // Persist only the buyer's non-secret recovery state. Never store the signed
  // checkout bearer token or wallet credentials in browser storage.
  useEffect(() => {
    try {
      if (!paymentInstructions) {
        window.localStorage.removeItem(recoveryKey);
        return;
      }
      const saved: RecoveryState = {
        version: 1, orderId, sessionExpiresAt, recipient,
        sourceAssetId, refundTo, paymentInstructions, walletTxHash,
      };
      window.localStorage.setItem(recoveryKey, JSON.stringify(saved));
    } catch {
      // Storage can be unavailable in private browsing; the active checkout remains usable.
    }
  }, [recoveryKey, orderId, sessionExpiresAt, recipient, sourceAssetId, refundTo, paymentInstructions, walletTxHash]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoadingTokens(true);
      setError("");
      try {
        const response = await fetch(apiUrl("/api/tokens"), {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || payload?.error || `Token service returned HTTP ${response.status}`);
        const list = Array.isArray(payload) ? payload : payload?.tokens;
        if (!Array.isArray(list)) throw new Error("Unexpected token service response.");
        const valid = list.filter((token: any) =>
          token && typeof token.assetId === "string" &&
          typeof token.symbol === "string" &&
          typeof token.blockchain === "string" &&
          Number.isInteger(token.decimals)
        ) as Token[];
        if (!valid.length) throw new Error("No supported assets were returned.");
        setTokens(valid);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Unable to load supported assets.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingTokens(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const networkAliases = NETWORK_ALIASES[destinationNetwork.toLowerCase()] ?? [destinationNetwork.toLowerCase()];
  const destinationToken = useMemo(
    () => tokens.find((token) => destinationAssetId
      ? token.assetId === destinationAssetId
      : token.symbol.toLowerCase() === destinationSymbol.toLowerCase() &&
        networkAliases.includes(token.blockchain.toLowerCase())
    ),
    [tokens, destinationAssetId, destinationSymbol, networkAliases.join("|")]
  );

  const apiUrl = (path: string) => apiBaseUrl
    ? new URL(path, apiBaseUrl.endsWith("/") ? apiBaseUrl : apiBaseUrl + "/").toString()
    : path;

  const sourceTokens = useMemo(
    () => tokens.filter((token) => token.assetId !== destinationToken?.assetId)
      .sort((a, b) => a.blockchain.localeCompare(b.blockchain) || a.symbol.localeCompare(b.symbol)),
    [tokens, destinationToken]
  );

  useEffect(() => {
    if (!sourceTokens.length) return;
    if (!sourceTokens.some((token) => token.assetId === sourceAssetId)) {
      setSourceAssetId(sourceTokens[0].assetId);
    }
  }, [sourceTokens, sourceAssetId]);

  const selectedSource = sourceTokens.find((token) => token.assetId === sourceAssetId);
  const baseTokenContract = selectedSource ? baseSepoliaTokenContract(selectedSource.assetId) : null;
  const walletOnBaseSepolia = walletChainId.toLowerCase() === BASE_SEPOLIA_CHAIN_ID;
  const walletCanPay = Boolean(walletAddress && walletOnBaseSepolia && baseTokenContract && paymentInstructions && !walletTxHash);

  async function connectWallet() {
    setError("");
    setWalletBusy(true);
    try {
      const provider = await waitForInjectedProvider();
      if (!provider) {
        throw new Error("No injected EVM wallet was detected. Open this checkout in MetaMask's built-in browser, then retry.");
      }
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(accounts[0])) {
        throw new Error("The wallet did not return a valid EVM account.");
      }
      const chainId = await provider.request({ method: "eth_chainId" });
      if (typeof chainId !== "string") throw new Error("The wallet did not return its active network.");
      setWalletAddress(accounts[0]);
      setWalletChainId(chainId);
      setWalletTxHash("");
      if (!refundTo.trim()) setRefundTo(accounts[0]);
      if (chainId.toLowerCase() !== BASE_SEPOLIA_CHAIN_ID) {
        setError("Wallet connected. Switch it to Base Sepolia before requesting a wallet payment.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection was not completed.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function switchToBaseSepolia() {
    if (!window.ethereum) return;
    setError("");
    setWalletBusy(true);
    try {
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }] });
      } catch (cause) {
        const code = (cause as { code?: number })?.code;
        if (code !== 4902) throw cause;
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [BASE_SEPOLIA_CHAIN] });
      }
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (typeof chainId !== "string") throw new Error("Unable to confirm the wallet network.");
      setWalletChainId(chainId);
      if (chainId.toLowerCase() !== BASE_SEPOLIA_CHAIN_ID) throw new Error("Wallet did not switch to Base Sepolia.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to switch wallet to Base Sepolia.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function payFromWallet() {
    if (!window.ethereum || !selectedSource || !baseTokenContract || !paymentInstructions || !walletAddress) return;
    if (sessionExpired || quoteExpired) {
      setError("This checkout or quote has expired. Do not send funds. Ask the merchant for a new checkout link.");
      return;
    }
    if (!walletOnBaseSepolia) {
      setError("Switch your wallet to Base Sepolia before paying.");
      return;
    }
    if (walletAddress.toLowerCase() !== refundTo.trim().toLowerCase()) {
      setError("The connected wallet must match the refund address used for this quote. Reconnect the original wallet or create a new checkout quote.");
      return;
    }
    if (paymentInstructions.memo) {
      setError("This provider quote includes a deposit memo. Direct wallet transfer is disabled for this quote; use the manual deposit instructions.");
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(paymentInstructions.address)) {
      setError("The provider returned a deposit address that is not a valid Base EVM address. Use the manual instructions only after checking with the merchant.");
      return;
    }
    if (!/^\d+$/.test(paymentInstructions.amountIn) || BigInt(paymentInstructions.amountIn) <= 0n) {
      setError("The committed quote does not contain a valid exact source amount.");
      return;
    }
    const tokenAddress = baseTokenContract;
    const amountAtomic = BigInt(paymentInstructions.amountIn);
    const transferData = "0xa9059cbb" + paymentInstructions.address.slice(2).toLowerCase().padStart(64, "0") + amountAtomic.toString(16).padStart(64, "0");
    const confirmed = window.confirm(
      "Send the exact quoted testnet amount from your connected wallet?\n\nNetwork: Base Sepolia\nToken contract: " + tokenAddress + "\nDeposit address: " + paymentInstructions.address + "\nAmount (atomic units): " + paymentInstructions.amountIn + "\n\nOnly approve the matching ERC-20 transfer in your wallet. This testnet transfer cannot be reversed."
    );
    if (!confirmed) return;
    setError("");
    setWalletBusy(true);
    try {
      const currentChain = await window.ethereum.request({ method: "eth_chainId" });
      if (typeof currentChain !== "string" || currentChain.toLowerCase() !== BASE_SEPOLIA_CHAIN_ID) {
        throw new Error("Wallet network changed. Switch back to Base Sepolia and retry.");
      }
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || accounts[0].toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error("The connected wallet account changed. Reconnect before paying.");
      }
      const balanceData = "0x70a08231" + walletAddress.slice(2).toLowerCase().padStart(64, "0");
      const rawBalance = await window.ethereum.request({ method: "eth_call", params: [{ to: tokenAddress, data: balanceData }, "latest"] });
      if (typeof rawBalance !== "string" || !/^0x[0-9a-fA-F]+$/.test(rawBalance)) throw new Error("Unable to verify the token balance in your wallet.");
      if (BigInt(rawBalance) < amountAtomic) throw new Error("Insufficient token balance for this exact quote amount.");
      const hash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: walletAddress, to: tokenAddress, data: transferData, value: "0x0" }],
      });
      if (typeof hash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error("The wallet did not return a valid transaction hash.");
      setWalletTxHash(hash);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Wallet transaction was not submitted.";
      setError(message);
    } finally {
      setWalletBusy(false);
    }
  }

  useEffect(() => {
    if (!walletAddress || !baseTokenContract || !window.ethereum || !walletOnBaseSepolia) {
      setWalletBalance("");
      return;
    }
    let cancelled = false;
    setWalletBalanceLoading(true);
    const data = "0x70a08231" + walletAddress.slice(2).toLowerCase().padStart(64, "0");
    window.ethereum.request({ method: "eth_call", params: [{ to: baseTokenContract, data }, "latest"] })
      .then((result) => {
        if (cancelled) return;
        if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/.test(result)) throw new Error("Invalid token balance response.");
        setWalletBalance(formatUnits(BigInt(result), selectedSource?.decimals ?? 6));
      })
      .catch(() => { if (!cancelled) setWalletBalance("Unavailable"); })
      .finally(() => { if (!cancelled) setWalletBalanceLoading(false); });
    return () => { cancelled = true; };
  }, [walletAddress, walletChainId, baseTokenContract, selectedSource?.decimals]);

  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    void waitForInjectedProvider().then((provider) => {
      if (cancelled || !provider?.on) return;
      const handleAccounts = (...args: unknown[]) => {
        const accounts = args[0];
        const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
        setWalletAddress(address);
        setWalletTxHash("");
        if (address) setRefundTo(address);
      };
      const handleChain = (...args: unknown[]) => {
        const chainId = args[0];
        if (typeof chainId === "string") setWalletChainId(chainId);
      };
      provider.on("accountsChanged", handleAccounts);
      provider.on("chainChanged", handleChain);
      detach = () => {
        provider.removeListener?.("accountsChanged", handleAccounts);
        provider.removeListener?.("chainChanged", handleChain);
      };
    }).catch(() => {});
    return () => {
      cancelled = true;
      detach();
    };
  }, []);

  async function requestDryQuote() {
    setError("");
    clearQuote();
    if (sessionExpired) {
      setError("This checkout link has expired. Ask the merchant to create a new checkout link.");
      return;
    }
    if (!sessionToken) {
      setError("This checkout has no signed merchant order session. Ask the merchant to initialize the checkout session.");
      return;
    }
    if (!destinationToken) {
      setError(`The selected settlement asset ${destinationSymbol} on ${destinationNetwork} is not in the current NEAR Intents token list.`);
      return;
    }
    if (!recipient.trim()) {
      setError("The merchant receiving address is not configured.");
      return;
    }
    if (!selectedSource) {
      setError("Select a supported source asset.");
      return;
    }
    if (!refundTo.trim()) {
      setError("Enter a refund address for the selected source network.");
      return;
    }

    let outputAmount: string;
    try {
      outputAmount = toAtomicUnits(amount, destinationToken.decimals);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid amount.");
      return;
    }

    setQuoting(true);
    const requestId = ++quoteRequestRef.current;
    try {
      const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const response = await fetch(apiUrl("/api/quote"), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          dry: true,
          sessionToken,
          swapType: "EXACT_OUTPUT",
          originAsset: selectedSource.assetId,
          destinationAsset: destinationToken.assetId,
          amount: outputAmount,
          recipient: recipient.trim(),
          refundTo: refundTo.trim(),
          depositType: "ORIGIN_CHAIN",
          refundType: "ORIGIN_CHAIN",
          recipientType: "DESTINATION_CHAIN",
          slippageTolerance: 100,
          deadline,
        }),
      });
      const payload = await response.json() as QuoteResponse;
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || `Quote service returned HTTP ${response.status}`);
      }
      if (!payload.quote || typeof payload.quote.amountIn !== "string" || typeof payload.quote.amountOut !== "string") {
        throw new Error("The quote service response did not include the expected amount fields.");
      }
      if (requestId !== quoteRequestRef.current) return;
      setQuote(payload.quote);
      setQuoteId(payload.correlationId ?? "");
      setRequestedAt(new Date().toLocaleTimeString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to request a quote.");
    } finally {
      if (requestId === quoteRequestRef.current) setQuoting(false);
    }
  }

  async function createDepositInstructions() {
    if (!quote || !sessionToken || !selectedSource || !destinationToken) return;
    if (sessionExpired) {
      setError("This checkout link has expired. No deposit instructions were created. Ask the merchant to create a new checkout link.");
      return;
    }
    if (paymentInstructions) return;
    const confirmed = window.confirm(
      `Create a real Tidepool testnet deposit quote?\n\nSource asset: ${selectedSource.assetId}\nNetwork: ${displayNetwork(selectedSource)}\n\nAfter instructions are created, transfer only this exact asset on this exact network. A token with the same symbol but a different contract is not interchangeable. This does not send funds.`
    );
    if (!confirmed) return;

    setError("");
    setCommitting(true);
    try {
      const outputAmount = toAtomicUnits(amount, destinationToken.decimals);
      const response = await fetch(apiUrl("/api/quote"), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          dry: false,
          sessionToken,
          swapType: "EXACT_OUTPUT",
          originAsset: selectedSource.assetId,
          destinationAsset: destinationToken.assetId,
          amount: outputAmount,
          recipient: recipient.trim(),
          refundTo: refundTo.trim(),
          depositType: "ORIGIN_CHAIN",
          refundType: "ORIGIN_CHAIN",
          recipientType: "DESTINATION_CHAIN",
          slippageTolerance: 100,
          deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }),
      });
      const payload = await response.json() as QuoteResponse;
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || `Unable to create deposit instructions (HTTP ${response.status}).`);
      }
      const address = payload.quote?.depositAddress;
      const committedQuoteId = payload.correlationId;
      const committedAmount = payload.quote?.amountIn;
      if (typeof address !== "string" || !address.trim() ||
          typeof committedQuoteId !== "string" || !committedQuoteId.trim() ||
          typeof committedAmount !== "string" || !/^\d+$/.test(committedAmount) || BigInt(committedAmount) <= 0n) {
        throw new Error("The committed provider response is missing a valid deposit address, quote reference or exact source amount. Do not retry this order; contact the merchant.");
      }
      setPaymentInstructions({
        address,
        memo: payload.quote?.depositMemo,
        quoteId: committedQuoteId,
        amountIn: committedAmount,
        amountInFormatted: payload.quote?.amountInFormatted,
        deadline: payload.quote?.deadline,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create deposit instructions.");
    } finally {
      setCommitting(false);
    }
  }

  useEffect(() => {
    if (!paymentInstructions || !sessionToken) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const response = await fetch(
          apiUrl("/api/payment-status?orderId=" + encodeURIComponent(orderId)),
          {
            headers: { accept: "application/json", authorization: "Bearer " + sessionToken },
            cache: "no-store",
          },
        );
        const payload = await response.json();
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (!cancelled) setStatusError(payload?.error || "This checkout session can no longer retrieve payment status.");
            return;
          }
          throw new Error(payload?.error || "Payment status returned HTTP " + response.status);
        }
        if (cancelled) return;
        setStatusError("");
        setPaymentStatus(payload);
        const terminal = ["settled", "failed", "refunded", "incomplete_deposit", "expired"];
        if (terminal.includes(String(payload.paymentStatus).toLowerCase())) return;
      } catch (cause) {
        if (!cancelled) setStatusError(cause instanceof Error ? cause.message : "Unable to retrieve payment status.");
      }
      if (!cancelled) timer = window.setTimeout(poll, 5000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [paymentInstructions?.quoteId, sessionToken, orderId, apiBaseUrl]);
  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Clipboard access failed. Select and copy the deposit details manually.");
    }
  }

  const configReady = Boolean(destinationToken && recipient.trim());

  return (
    <section className="pelargo-checkout" aria-label="Pelargo checkout quote preview">
      <div className="pelargo-checkout-head">
        <div>
          <span className="pelargo-kicker">POWERED BY NEAR INTENTS</span>
          <h2>Pay {merchantName}</h2>
          <p>Choose a supported asset from a network you can pay on.</p>
        </div>
        <span className="pelargo-order">Order {orderId}</span>
      </div>
      {Number.isFinite(sessionExpiryMs) && (
        <div className={sessionExpired ? "pelargo-error" : "pelargo-muted"} role={sessionExpired ? "alert" : "status"}>
          {sessionExpired
            ? "This checkout link has expired. Ask the merchant to create a new link."
            : `Checkout link expires ${new Date(sessionExpiryMs).toLocaleTimeString()}.`}
        </div>
      )}

      {!configReady && !loadingTokens && (
        <div className="pelargo-warning"><AlertCircle size={15} /> Merchant destination is incomplete or not present in the supported token list.</div>
      )}

      <div className="pelargo-amount-field">
        <label htmlFor="pelargo-amount">Amount to receive</label>
        <div>
          <input id="pelargo-amount" inputMode="decimal" value={amount} readOnly={fixedAmount} onChange={(event) => { setAmount(event.target.value); clearQuote(); }} />
          <span>{destinationToken?.symbol ?? destinationSymbol}</span>
        </div>
        <small>{destinationToken ? `Settlement on ${destinationToken.blockchain}` : `Settlement network: ${destinationNetwork}`}</small>
      </div>

      <label className="pelargo-field-label" htmlFor="pelargo-source">You pay with</label>
      <select id="pelargo-source" className="pelargo-select" value={sourceAssetId} onChange={(event) => { setSourceAssetId(event.target.value); clearQuote(); }} disabled={loadingTokens || sourceTokens.length === 0 || Boolean(paymentInstructions)}>
        {sourceTokens.map((token) => (
          <option value={token.assetId} key={token.assetId}>{token.symbol} · {displayNetwork(token)}</option>
        ))}
      </select>
      {selectedSource && (
        <div className="pelargo-muted" role="note">
          <strong>Exact provider asset ID</strong>
          <code style={{ display: "block", overflowWrap: "anywhere", marginTop: 5 }}>{selectedSource.assetId}</code>
          <small>Before transferring, verify the network and token contract in your wallet against this asset ID. Matching the symbol alone is insufficient.</small>
        </div>
      )}

      {selectedSource && baseTokenContract && (
        <div className="pelargo-wallet-panel">
          <div className="pelargo-wallet-heading"><Wallet size={17} /><strong>Pay from your Base wallet</strong></div>
          <p>Connect an EVM wallet to pay the exact quoted USDC amount on Base Sepolia. Pelargo never receives your private key.</p>
          {!walletAddress ? (
            <button type="button" className="pelargo-quote-button" onClick={connectWallet} disabled={walletBusy || sessionExpired}>
              {walletBusy ? <><LoaderCircle size={15} className="pelargo-spin" /> Connecting…</> : <>Connect wallet <ArrowRight size={15} /></>}
            </button>
          ) : (
            <>
              <div className="pelargo-quote-detail"><span>Connected account</span><code>{walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</code></div>
              <div className="pelargo-quote-detail"><span>Network</span><strong>{walletOnBaseSepolia ? "Base Sepolia" : `Wrong network (${walletChainId})`}</strong></div>
              {walletOnBaseSepolia && <div className="pelargo-quote-detail"><span>{selectedSource.symbol} balance</span><strong>{walletBalanceLoading ? "Checking…" : walletBalance || "Unavailable"}</strong></div>}
              {!walletOnBaseSepolia && <button type="button" className="pelargo-quote-button" onClick={switchToBaseSepolia} disabled={walletBusy}>Switch to Base Sepolia</button>}
              <button type="button" className="pelargo-text-button" onClick={connectWallet} disabled={walletBusy}>Reconnect wallet</button>
            </>
          )}
        </div>
      )}

      <label className="pelargo-field-label" htmlFor="pelargo-refund">Your refund address on {selectedSource ? displayNetwork(selectedSource) : "the source network"}</label>
      <input id="pelargo-refund" className="pelargo-text-input" value={refundTo} onChange={(event) => { setRefundTo(event.target.value); clearQuote(); }} placeholder="Wallet address for refunds" autoComplete="off" />

      <button className="pelargo-quote-button" onClick={requestDryQuote} disabled={loadingTokens || quoting || !configReady || !selectedSource || sessionExpired}>
        {quoting ? <><LoaderCircle size={15} className="pelargo-spin" /> Getting quote…</> : <>Preview payment <ArrowRight size={15} /></>}
      </button>

      {loadingTokens && <div className="pelargo-muted"><RefreshCw size={14} className="pelargo-spin" /> Loading supported payment assets…</div>}
      {error && <div className="pelargo-error" role="alert"><AlertCircle size={15} />{error}</div>}

      {quote && (
        <div className="pelargo-quote-result" aria-live="polite">
          <div className="pelargo-quote-label">LIVE QUOTE PREVIEW <span>DRY RUN</span></div>
          <div className="pelargo-quote-amount"><strong>{quote.amountInFormatted ?? quote.amountIn}</strong><span>{selectedSource?.symbol}</span></div>
          <div className="pelargo-route-line"><span>{selectedSource?.blockchain}</span><ArrowRight size={14} /><span>{destinationToken?.blockchain}</span></div>
          {selectedSource && <div className="pelargo-quote-detail"><span>Exact source asset</span><code style={{ overflowWrap: "anywhere", textAlign: "right" }}>{selectedSource.assetId}</code></div>}
          <div className="pelargo-quote-detail"><span>Merchant receives</span><strong>{quote.amountOutFormatted ?? quote.amountOut} {destinationToken?.symbol}</strong></div>
          {quote.amountInUsd && <div className="pelargo-quote-detail"><span>Estimated source value</span><strong>${quote.amountInUsd}</strong></div>}
          {quote.timeEstimate !== undefined && <div className="pelargo-quote-detail"><span>Estimated execution</span><strong>{Math.ceil(quote.timeEstimate / 60)} min</strong></div>}
          <div className="pelargo-quote-detail"><span>Quote deadline</span><strong><Clock3 size={12} /> {formatExpiry(quote.deadline)}</strong></div>
          <p>This is a quote preview only. No deposit address has been created and no payment has been initiated.</p>
          {quoteId && <small>Quote reference: {quoteId}</small>}
          {requestedAt && <small>Requested at {requestedAt}</small>}
          <button className="pelargo-quote-button" onClick={createDepositInstructions} disabled={committing || !refundTo.trim() || sessionExpired}>
            {committing ? <><LoaderCircle size={15} className="pelargo-spin" /> Creating deposit instructions…</> : <>Continue to testnet deposit instructions <ArrowRight size={15} /></>}
          </button>
        </div>
      )}
      {paymentInstructions && (
        <div className="pelargo-quote-result" aria-live="polite">
          <div className="pelargo-quote-label">TESTNET DEPOSIT INSTRUCTIONS <span>REAL TESTNET QUOTE</span></div>
          <strong>Send {paymentInstructions.amountInFormatted ?? paymentInstructions.amountIn} {selectedSource?.symbol} on {selectedSource?.blockchain}</strong>
          <p>Send only the exact source asset and amount shown, using the selected source network. Do not send funds on a different network. Tokens with the same symbol but different contract addresses are different assets.</p>
          <div className="pelargo-quote-detail"><span>Exact source asset ID</span><code style={{ overflowWrap: "anywhere", textAlign: "right" }}>{selectedSource?.assetId}</code></div>
          <div className="pelargo-quote-detail"><span>Deposit address</span><button type="button" onClick={() => copyValue(paymentInstructions.address)}>Copy address</button></div>
          <div className="pelargo-deposit-address">{paymentInstructions.address}</div>
          {paymentInstructions.memo && (
            <>
              <div className="pelargo-quote-detail"><span>Deposit memo / tag</span><button type="button" onClick={() => copyValue(paymentInstructions.memo!)}>Copy memo</button></div>
              <div className="pelargo-deposit-address">{paymentInstructions.memo}</div>
            </>
          )}
          <div className="pelargo-quote-detail"><span>Provider quote reference</span><strong>{paymentInstructions.quoteId}</strong></div>
          {paymentInstructions.deadline && <div className="pelargo-quote-detail"><span>Deposit deadline</span><strong>{formatExpiry(paymentInstructions.deadline)}</strong></div>}
          {baseTokenContract && walletAddress && selectedSource && (
            <div className="pelargo-wallet-payment">
              {walletTxHash ? (
                <>
                  <div className="pelargo-wallet-heading"><CheckCircle2 size={17} /><strong>Transaction submitted</strong></div>
                  <p>Your wallet submitted the source transfer. Pelargo is waiting for provider detection and independent settlement verification.</p>
                  <div className="pelargo-deposit-address">{walletTxHash}</div>
                  <button type="button" className="pelargo-text-button" onClick={() => copyValue(walletTxHash)}>Copy transaction hash</button>
                </>
              ) : (
                <button type="button" className="pelargo-quote-button" onClick={payFromWallet} disabled={!walletCanPay || walletBusy || walletBalanceLoading || walletBalance === "Unavailable" || quoteExpired || sessionExpired}>
                  {walletBusy ? <><LoaderCircle size={15} className="pelargo-spin" /> Waiting for wallet…</> : <>Pay {paymentInstructions.amountInFormatted ?? paymentInstructions.amountIn} {selectedSource.symbol} from wallet <ArrowRight size={15} /></>}
                </button>
              )}
            </div>
          )}
          {(quoteExpired || sessionExpired) && <div className="pelargo-error" role="alert">These deposit instructions have expired. Do not send funds. Start a fresh quote from this checkout to continue.</div>}
          <div className="pelargo-payment-status" aria-live="polite">
            <span>Payment status</span>
            <strong>{paymentStatus?.paymentStatus?.replaceAll("_", " ") ?? "Waiting for status"}</strong>
            {paymentStatus?.providerStatus && <small>Provider: {paymentStatus.providerStatus}</small>}
            {paymentStatus?.settlement && <small>Settlement check: {paymentStatus.settlement.replaceAll("_", " ")}</small>}
            {statusError && <small role="alert">{statusError}</small>}
          </div>
          <p>{walletTxHash ? "The wallet transaction hash is not proof of payment. Pelargo waits for provider detection and independently verifies destination-chain settlement before marking this order paid." : "Creating these instructions did not send funds. You can pay from the connected Base Sepolia wallet above or use the deposit address manually. Pelargo checks provider status and independently verifies destination-chain settlement before marking this order paid."}</p>
          <small>Your checkout details are saved on this device so you can return after switching to your wallet. Wallet approval is never saved.</small>
        </div>
      )}
      <div className="pelargo-checkout-foot">Merchant destination: {destinationToken?.symbol ?? destinationSymbol} · {recipient ? `${recipient.slice(0, 7)}…${recipient.slice(-5)}` : "Not configured"}</div>
    </section>
  );
}
