import { Env } from "./intents";

export type NearSettlementOrder = {
  destinationNetwork: string;
  destinationAsset: string;
  recipient: string;
  amountAtomic: string;
};

export type NearSettlementEvidence = {
  destinationChain: "NEAR";
  destinationAsset: string;
  tokenContract: string;
  transactionHash: string;
  recipient: string;
  amountAtomic: string;
  blockNumber: string;
  blockHash: string;
  confirmations: number;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord : null;
}

function rpcSuccess(value: unknown): boolean {
  const status = record(value);
  return Boolean(status && ("SuccessValue" in status || "SuccessReceiptId" in status));
}

async function postJson(url: string, body: unknown, headers: HeadersInit = {}): Promise<JsonRecord> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`NEAR verification upstream returned HTTP ${response.status}`);
  const payload = record(await response.json());
  if (!payload) throw new Error("NEAR verification upstream returned invalid JSON");
  return payload;
}

/**
 * Verifies a NEAR NEP-141 transfer. FastNear's indexed transaction lookup is
 * used only to resolve signer_id; canonical NEAR RPC then verifies execution
 * at FINAL and the receipt's NEP-141 event. Unsupported networks/assets fail closed.
 */
export async function verifyNearNep141Settlement(
  env: Env,
  order: NearSettlementOrder,
  transactionHash: string,
): Promise<NearSettlementEvidence | null> {
  if (order.destinationNetwork.trim().toUpperCase() !== "NEAR") return null;
  const assetMatch = /^nep141:([a-z0-9._-]+)$/i.exec(order.destinationAsset);
  if (!assetMatch || !order.recipient || !/^\d+$/.test(order.amountAtomic) ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(transactionHash)) return null;
  const tokenContract = assetMatch[1].toLowerCase();

  const indexerUrl = env.NEAR_TX_INDEXER_URL || "https://tx.main.fastnear.com/v0/transactions";
  const rpcUrl = env.NEAR_RPC_URL || "https://rpc.mainnet.near.org";
  const indexerHeaders: Record<string, string> = {};
  if (env.NEAR_INDEXER_API_KEY) indexerHeaders.authorization = `Bearer ${env.NEAR_INDEXER_API_KEY}`;

  const indexed = await postJson(indexerUrl, { tx_hashes: [transactionHash] }, indexerHeaders);
  const indexedTransactions = Array.isArray(indexed.transactions) ? indexed.transactions : [];
  const indexedTx = record(indexedTransactions[0]);
  const indexedTransaction = record(indexedTx?.transaction);
  if (indexedTransaction?.hash !== transactionHash ||
      typeof indexedTransaction.signer_id !== "string" ||
      !indexedTransaction.signer_id) return null;

  const signerId = indexedTransaction.signer_id;
  const txStatus = await postJson(rpcUrl, {
    jsonrpc: "2.0",
    id: "pelargo-settlement-verifier",
    method: "EXPERIMENTAL_tx_status",
    params: [transactionHash, signerId, "FINAL"],
  });
  if (txStatus.error) return null;
  const result = record(txStatus.result);
  if (!result || !rpcSuccess(result.status)) return null;

  const receipts = Array.isArray(result.receipts_outcome) ? result.receipts_outcome : [];
  let matchingReceiptBlockHash: string | null = null;
  for (const item of receipts) {
    const receiptOutcome = record(item);
    const outcome = record(receiptOutcome?.outcome);
    const executorId = outcome?.executor_id;
    const logs = Array.isArray(outcome?.logs) ? outcome.logs : [];
    if (executorId !== tokenContract || !rpcSuccess(outcome?.status)) continue;

    for (const rawLog of logs) {
      if (typeof rawLog !== "string" || !rawLog.startsWith("EVENT_JSON:")) continue;
      let event: JsonRecord | null = null;
      try { event = record(JSON.parse(rawLog.slice("EVENT_JSON:".length))); }
      catch { continue; }
      if (event?.standard !== "nep141" || event.version !== "1.0.0" ||
          event.event !== "ft_transfer" || !Array.isArray(event.data)) continue;
      const matched = event.data.some((rawEntry) => {
        const entry = record(rawEntry);
        return entry?.new_owner_id === order.recipient &&
          entry.amount === order.amountAtomic;
      });
      if (matched && typeof receiptOutcome?.block_hash === "string") {
        matchingReceiptBlockHash = receiptOutcome.block_hash;
        break;
      }
    }
    if (matchingReceiptBlockHash) break;
  }
  if (!matchingReceiptBlockHash) return null;

  const blockResponse = await postJson(rpcUrl, {
    jsonrpc: "2.0",
    id: "pelargo-settlement-block",
    method: "block",
    params: { block_id: matchingReceiptBlockHash },
  });
  const block = record(blockResponse.result);
  const header = record(block?.header);
  if (!header || header.hash !== matchingReceiptBlockHash ||
      (typeof header.height !== "number" && typeof header.height !== "string")) return null;
  const blockHeight = BigInt(header.height);
  if (blockHeight < 1n) return null;

  const latestFinal = await postJson(rpcUrl, {
    jsonrpc: "2.0",
    id: "pelargo-settlement-finality",
    method: "block",
    params: { finality: "final" },
  });
  const latestHeader = record(record(latestFinal.result)?.header);
  if (!latestHeader || (typeof latestHeader.height !== "number" && typeof latestHeader.height !== "string") ||
      BigInt(latestHeader.height) < blockHeight) return null;

  return {
    destinationChain: "NEAR",
    destinationAsset: order.destinationAsset,
    tokenContract,
    transactionHash,
    recipient: order.recipient,
    amountAtomic: order.amountAtomic,
    blockNumber: blockHeight.toString(),
    blockHash: matchingReceiptBlockHash,
    confirmations: Number(BigInt(latestHeader.height) - blockHeight + 1n),
  };
}
