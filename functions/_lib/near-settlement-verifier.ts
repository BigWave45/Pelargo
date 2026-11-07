import { Env, intentsProvider } from "./intents";

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

async function requestJson(url: string, init: RequestInit): Promise<JsonRecord> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    // Keep a short upstream body fragment for actionable diagnostics without
    // returning an unbounded response or changing verification decisions.
    const detail = (await response.text()).replace(/\\s+/g, " ").slice(0, 240);
    throw new Error(`NEAR verification upstream returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const payload = record(await response.json());
  if (!payload) throw new Error("NEAR verification upstream returned invalid JSON");
  return payload;
}

async function postJson(url: string, body: unknown): Promise<JsonRecord> {
  return requestJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function indexedSigner(payload: JsonRecord, expectedHash: string): string | null {
  // NearScanner uses hash/signer_id; NearBlocks v3 uses
  // transaction_hash/signer_account_id. v3 response envelopes may expose
  // either a single data object or a data array. Accept only a hash-bound row.
  const candidates: JsonRecord[] = [];
  const add = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const itemRecord = record(item);
        if (itemRecord) candidates.push(itemRecord);
      }
      return;
    }
    const itemRecord = record(value);
    if (itemRecord) candidates.push(itemRecord);
  };

  add(payload.transaction);
  add(payload.data);
  add(payload.result);
  const data = record(payload.data);
  const result = record(payload.result);
  add(data?.transaction);
  add(data?.transactions);
  add(result?.transaction);
  add(result?.data);
  add(payload);

  for (const candidate of candidates) {
    const hash = candidate.hash ?? candidate.transaction_hash;
    const signer = candidate.signer_id ?? candidate.signer_account_id;
    if (hash === expectedHash && typeof signer === "string" &&
        signer.length > 0 && signer.length <= 64) return signer;
  }
  return null;
}


const EMPTY_NEAR_TX_ROOT = "11111111111111111111111111111111";

function blockHeader(payload: JsonRecord): JsonRecord | null {
  return record(record(payload.result)?.header);
}

async function rpcBlockByHeight(rpcUrl: string, height: bigint): Promise<JsonRecord> {
  const payload = await postJson(rpcUrl, {
    jsonrpc: "2.0", id: "pelargo-near-block-scan", method: "block",
    params: { block_id: Number(height) },
  });
  if (payload.error) throw new Error("NEAR RPC block lookup failed during signer recovery");
  const result = record(payload.result);
  const header = blockHeader(payload);
  if (!result || !header) throw new Error("NEAR RPC returned an incomplete block during signer recovery");
  return result;
}

function blockTimestampNs(block: JsonRecord): bigint | null {
  const timestamp = record(block.header)?.timestamp_nanosec;
  if (typeof timestamp !== "string" && typeof timestamp !== "number") return null;
  try { return BigInt(timestamp); } catch { return null; }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await task(values[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

/**
 * No-key testnet fallback for signer discovery. It uses only the configured
 * canonical NEAR RPC: binary-search finalized block timestamps around the
 * provider's status timestamp, inspect a small bounded block window, then read
 * non-empty chunks until the exact transaction hash is found. The discovered
 * signer is only a hint; EXPERIMENTAL_tx_status and receipt verification below
 * remain mandatory.
 */
type RecoveryStore = { db: NonNullable<Env["DB"]>; orderId: string };

type RecoveryCursor = {
  scan_candidate_hash: string | null;
  scan_observed_at: string | null;
  scan_first_height: string | null;
  scan_last_height: string | null;
  scan_next_height: string | null;
  scan_chunk_hashes: string | null;
  scan_chunk_offset: number;
  scan_signer_id: string | null;
};

/**
 * Testnet fallback. When a D1 recovery store is supplied, one call performs
 * at most one eight-block batch or one four-chunk batch and persists its
 * cursor. The next scheduled/browser poll resumes from that exact position.
 * Signer discovery remains a hint; canonical tx status and receipt checks
 * below are always required before settlement.
 */
async function signerFromCanonicalRpcBlockWindow(
  rpcUrl: string,
  expectedHash: string,
  observedAt: string | undefined,
  configuredWindowBlocks: string | undefined,
  onDiagnostic?: (stage: string, detail?: string) => void,
  recoveryStore?: RecoveryStore,
): Promise<string | null> {
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) return null;
  const targetNs = BigInt(Date.parse(observedAt)) * 1_000_000n;
  const requestedWindow = configuredWindowBlocks?.trim() ? Number(configuredWindowBlocks) : 120;
  if (!Number.isInteger(requestedWindow) || requestedWindow < 8 || requestedWindow > 600) {
    throw new Error("NEAR_TX_RECOVERY_WINDOW_BLOCKS must be an integer from 8 to 600");
  }

  // Stateless verifier calls (unit tests and explicit one-off tooling) retain
  // the bounded full-window behavior. Production payment-status always supplies
  // the D1 store and therefore uses the resumable one-batch path below.
  if (!recoveryStore) {
    const latestPayload = await postJson(rpcUrl, {
      jsonrpc: "2.0", id: "pelargo-near-block-scan-head", method: "block",
      params: { finality: "final" },
    });
    const latestHeader = blockHeader(latestPayload);
    if (!latestHeader || (typeof latestHeader.height !== "number" && typeof latestHeader.height !== "string") ||
        (typeof latestHeader.timestamp_nanosec !== "string" && typeof latestHeader.timestamp_nanosec !== "number")) {
      throw new Error("NEAR RPC returned an incomplete finalized head for signer recovery");
    }
    const headHeight = BigInt(latestHeader.height);
    const ageNs = BigInt(latestHeader.timestamp_nanosec) - targetNs;
    if (ageNs < -60_000_000_000n || ageNs > 7_200_000_000_000n) return null;
    const lowerBound = headHeight > 10_000n ? headHeight - 10_000n : 1n;
    let low = lowerBound, high = headHeight;
    while (low < high) {
      const middle = (low + high) / 2n;
      const block = await rpcBlockByHeight(rpcUrl, middle);
      const timestamp = blockTimestampNs(block);
      if (timestamp === null) throw new Error("NEAR RPC block omitted timestamp_nanosec");
      if (timestamp < targetNs) low = middle + 1n;
      else high = middle;
    }
    const width = BigInt(requestedWindow);
    const first = low - (width - 8n) < lowerBound ? lowerBound : low - (width - 8n);
    const last = low + 8n > headHeight ? headHeight : low + 8n;
    const matches = new Set<string>();
    for (let height = last; height >= first; height -= 8n) {
      const heights: bigint[] = [];
      for (let h = height; h >= first && heights.length < 8; h--) heights.push(h);
      const blocks = await mapWithConcurrency(heights, 4, (h) => rpcBlockByHeight(rpcUrl, h));
      const refs: string[] = [];
      for (const block of blocks) {
        for (const raw of (Array.isArray(block.chunks) ? block.chunks : [])) {
          const chunk = record(raw);
          if (chunk && typeof chunk.chunk_hash === "string" && chunk.tx_root !== EMPTY_NEAR_TX_ROOT &&
              !refs.includes(chunk.chunk_hash)) refs.push(chunk.chunk_hash);
        }
      }
      for (let offset = 0; offset < refs.length; offset += 4) {
        const batch = refs.slice(offset, offset + 4);
        await mapWithConcurrency(batch, 4, async (chunkHash) => {
          const payload = await postJson(rpcUrl, {
            jsonrpc: "2.0", id: "pelargo-near-chunk-scan", method: "chunk",
            params: { chunk_id: chunkHash },
          });
          if (payload.error) throw new Error("NEAR RPC chunk lookup failed during signer recovery");
          const transactions = Array.isArray(record(payload.result)?.transactions)
            ? record(payload.result)!.transactions as unknown[] : [];
          for (const raw of transactions) {
            const tx = record(raw);
            if (tx?.hash === expectedHash && typeof tx.signer_id === "string" &&
                /^[a-z0-9._-]{2,64}$/.test(tx.signer_id)) matches.add(tx.signer_id);
          }
          return null;
        });
      }
      if (matches.size > 0) break;
    }
    return matches.size === 1 ? [...matches][0] : null;
  }

  let cursor: RecoveryCursor | null = null;
  if (recoveryStore) {
    cursor = await recoveryStore.db.prepare(
      `SELECT scan_candidate_hash, scan_observed_at, scan_first_height, scan_last_height,
              scan_next_height, scan_chunk_hashes, scan_chunk_offset, scan_signer_id
         FROM payment_reconciliation_jobs WHERE order_id = ?`
    ).bind(recoveryStore.orderId).first<RecoveryCursor>();
    if (cursor?.scan_candidate_hash !== expectedHash || cursor.scan_observed_at !== observedAt ||
        !cursor.scan_first_height || !cursor.scan_last_height || !cursor.scan_next_height) {
      cursor = null;
    }
  }

  if (cursor?.scan_signer_id) {
    onDiagnostic?.("signer_reused_from_persisted_rpc_scan");
    return cursor.scan_signer_id;
  }

  if (!cursor) {
    const latestPayload = await postJson(rpcUrl, {
      jsonrpc: "2.0", id: "pelargo-near-block-scan-head", method: "block",
      params: { finality: "final" },
    });
    const latestHeader = blockHeader(latestPayload);
    if (!latestHeader || (typeof latestHeader.height !== "number" && typeof latestHeader.height !== "string") ||
        (typeof latestHeader.timestamp_nanosec !== "string" && typeof latestHeader.timestamp_nanosec !== "number")) {
      throw new Error("NEAR RPC returned an incomplete finalized head for signer recovery");
    }
    const headHeight = BigInt(latestHeader.height);
    const headTimestampNs = BigInt(latestHeader.timestamp_nanosec);
    const ageNs = headTimestampNs - targetNs;
    if (ageNs < -60_000_000_000n || ageNs > 7_200_000_000_000n) return null;

    const lowerBound = headHeight > 10_000n ? headHeight - 10_000n : 1n;
    let low = lowerBound;
    let high = headHeight;
    while (low < high) {
      const middle = (low + high) / 2n;
      const block = await rpcBlockByHeight(rpcUrl, middle);
      const timestamp = blockTimestampNs(block);
      if (timestamp === null) throw new Error("NEAR RPC block omitted timestamp_nanosec");
      if (timestamp < targetNs) low = middle + 1n;
      else high = middle;
    }

    const width = BigInt(requestedWindow);
    const first = low - (width - 8n) < lowerBound ? lowerBound : low - (width - 8n);
    const last = low + 8n > headHeight ? headHeight : low + 8n;
    cursor = {
      scan_candidate_hash: expectedHash,
      scan_observed_at: observedAt,
      scan_first_height: first.toString(),
      scan_last_height: last.toString(),
      scan_next_height: last.toString(),
      scan_chunk_hashes: null,
      scan_chunk_offset: 0,
      scan_signer_id: null,
    };
    if (recoveryStore) {
      await recoveryStore.db.prepare(
        `UPDATE payment_reconciliation_jobs
            SET scan_candidate_hash = ?, scan_observed_at = ?, scan_first_height = ?,
                scan_last_height = ?, scan_next_height = ?, scan_chunk_hashes = NULL,
                scan_chunk_offset = 0, scan_signer_id = NULL, updated_at = ?
          WHERE order_id = ?`
      ).bind(expectedHash, observedAt, first.toString(), last.toString(), last.toString(),
        new Date().toISOString(), recoveryStore.orderId).run();
    }
  }

  const firstHeight = BigInt(cursor.scan_first_height!);
  const nextHeight = BigInt(cursor.scan_next_height!);
  const chunkHashes: string[] = cursor.scan_chunk_hashes
    ? JSON.parse(cursor.scan_chunk_hashes) as string[] : [];
  let chunkOffset = Number(cursor.scan_chunk_offset ?? 0);
  const persist = async (patch: {
    nextHeight?: bigint; hashes?: string[] | null; offset?: number;
  }) => {
    if (!recoveryStore) return;
    await recoveryStore.db.prepare(
      `UPDATE payment_reconciliation_jobs
          SET scan_next_height = ?, scan_chunk_hashes = ?, scan_chunk_offset = ?, updated_at = ?
        WHERE order_id = ? AND scan_candidate_hash = ?`
    ).bind(
      (patch.nextHeight ?? nextHeight).toString(),
      patch.hashes === undefined ? (chunkHashes.length ? JSON.stringify(chunkHashes) : null) :
        (patch.hashes?.length ? JSON.stringify(patch.hashes) : null),
      patch.offset ?? chunkOffset, new Date().toISOString(), recoveryStore.orderId, expectedHash,
    ).run();
  };

  if (chunkHashes.length > 0 && chunkOffset < chunkHashes.length) {
    const batch = chunkHashes.slice(chunkOffset, chunkOffset + 4);
    const signers = new Set<string>();
    await mapWithConcurrency(batch, 4, async (chunkHash) => {
      const payload = await postJson(rpcUrl, {
        jsonrpc: "2.0", id: "pelargo-near-chunk-scan", method: "chunk",
        params: { chunk_id: chunkHash },
      });
      if (payload.error) throw new Error("NEAR RPC chunk lookup failed during signer recovery");
      const transactions = Array.isArray(record(payload.result)?.transactions)
        ? record(payload.result)!.transactions as unknown[] : [];
      for (const raw of transactions) {
        const tx = record(raw);
        if (tx?.hash === expectedHash && typeof tx.signer_id === "string" &&
            /^[a-z0-9._-]{2,64}$/.test(tx.signer_id)) signers.add(tx.signer_id);
      }
      return null;
    });
    if (signers.size === 1) {
      if (recoveryStore) await recoveryStore.db.prepare(
        "UPDATE payment_reconciliation_jobs SET scan_signer_id = ?, scan_chunk_hashes = NULL, scan_chunk_offset = 0, updated_at = ? WHERE order_id = ? AND scan_candidate_hash = ?"
      ).bind([...signers][0], new Date().toISOString(), recoveryStore.orderId, expectedHash).run();
      onDiagnostic?.("signer_resolved_from_canonical_rpc_block_scan");
      return [...signers][0];
    }
    if (signers.size > 1) throw new Error("NEAR signer recovery returned ambiguous matching signers");
    chunkOffset += batch.length;
    if (chunkOffset >= chunkHashes.length) await persist({ hashes: null, offset: 0 });
    else await persist({ offset: chunkOffset });
    onDiagnostic?.("testnet_rpc_block_scan_progress",
      `chunks=${Math.min(chunkOffset, chunkHashes.length)}/${chunkHashes.length}; blocks_before=${nextHeight}`);
    return null;
  }

  if (nextHeight < firstHeight) {
    onDiagnostic?.("testnet_rpc_block_scan_exhausted",
      `heights=${firstHeight}-${cursor.scan_last_height}; candidate=${expectedHash}`);
    return null;
  }

  const heights: bigint[] = [];
  for (let h = nextHeight; h >= firstHeight && heights.length < 8; h--) heights.push(h);
  const blocks = await mapWithConcurrency(heights, 4, (height) => rpcBlockByHeight(rpcUrl, height));
  const refs: string[] = [];
  for (const block of blocks) {
    const chunks = Array.isArray(block.chunks) ? block.chunks : [];
    for (const raw of chunks) {
      const chunk = record(raw);
      if (!chunk || typeof chunk.chunk_hash !== "string" || chunk.tx_root === EMPTY_NEAR_TX_ROOT) continue;
      if (!refs.includes(chunk.chunk_hash)) refs.push(chunk.chunk_hash);
    }
  }
  const next = heights[heights.length - 1] - 1n;
  await persist({ nextHeight: next, hashes: refs, offset: 0 });
  onDiagnostic?.("testnet_rpc_block_scan_progress",
    `blocks=${heights.length}; chunks_found=${refs.length}; next_height=${next}`);
  return null;
}

/**
 * Verifies a NEAR NEP-141 transfer. NearScanner's indexed transaction lookup
 * is used only to resolve signer_id; canonical NEAR RPC then verifies execution
 * at FINAL and the receipt's NEP-141 event. Unsupported networks/assets fail closed.
 */
export async function verifyNearNep141Settlement(
  env: Env,
  order: NearSettlementOrder,
  transactionHash: string,
  onDiagnostic?: (stage: string, detail?: string) => void,
  providerObservedAt?: string,
  recoveryStore?: RecoveryStore,
): Promise<NearSettlementEvidence | null> {
  const reject = (stage: string): null => {
    onDiagnostic?.(stage);
    return null;
  };
  if (order.destinationNetwork.trim().toUpperCase() !== "NEAR") return reject("unsupported_destination_network");
  const assetMatch = /^nep141:([a-z0-9._-]+)$/i.exec(order.destinationAsset);
  if (!assetMatch || !order.recipient || !/^\d+$/.test(order.amountAtomic) ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(transactionHash)) {
    onDiagnostic?.("invalid_order_or_transaction_hash");
    return null;
  }
  const tokenContract = assetMatch[1].toLowerCase();

  const provider = intentsProvider(env);
  const rpcUrl = env.NEAR_RPC_URL ||
    (provider.network === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

  let indexerUrl: string;
  let indexerHeaders: HeadersInit = {};
  if (provider.network === "testnet") {
    // Testnet signer lookup uses NearBlocks' public testnet v3 API.
    const template = env.NEAR_TX_INDEXER_URL || "https://api-testnet.nearblocks.io/v3/txns/{hash}";
    if (!template.includes("{hash}")) throw new Error("NEAR_TX_INDEXER_URL must contain {hash}");
    indexerUrl = template.replace("{hash}", encodeURIComponent(transactionHash));
    if (env.NEAR_TX_INDEXER_API_KEY) indexerHeaders = { authorization: `Bearer ${env.NEAR_TX_INDEXER_API_KEY}` };
  } else {
    if (!env.NEARSCANNER_API_KEY) throw new Error("NearScanner API key is required for mainnet settlement verification");
    const template = env.NEARSCANNER_TX_API_URL || "https://nearscanner.com/api/v1/explorer/tx/{hash}";
    indexerUrl = template.includes("{hash}")
      ? template.replace("{hash}", encodeURIComponent(transactionHash))
      : `${template.replace(/\/$/, "")}/${encodeURIComponent(transactionHash)}`;
    indexerHeaders = { "x-api-key": env.NEARSCANNER_API_KEY };
  }

  // Fail closed if the RPC endpoint is pointed at the wrong network.
  const networkStatus = await postJson(rpcUrl, {
    jsonrpc: "2.0", id: "pelargo-near-network-check", method: "status", params: [],
  });
  if (record(networkStatus.result)?.chain_id !== provider.network) return reject("rpc_network_mismatch");

  // A configured signer avoids depending on a third-party indexer. This is
  // only a signer hint: canonical RPC must still resolve this exact hash for
  // that signer and prove successful final execution plus the exact NEP-141
  // transfer below. A wrong signer therefore fails closed.
  const configuredHash = env.NEAR_TX_HASH?.trim();
  const configuredSigner = configuredHash === transactionHash ? env.NEAR_TX_SIGNER_ID?.trim() : undefined;
  let signerId: string | null = null;
  if (configuredSigner) {
    if (!/^[a-z0-9._-]{2,64}$/.test(configuredSigner)) {
      throw new Error("NEAR_TX_SIGNER_ID is not a valid NEAR account ID");
    }
    signerId = configuredSigner;
  } else {
    try {
      const indexed = await requestJson(indexerUrl, { method: "GET", headers: indexerHeaders });
      signerId = indexedSigner(indexed, transactionHash);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown indexer failure";
      const retryableIndexerFailure = /HTTP (429|5\d\d)|fetch failed|NetworkError|TimeoutError/i.test(detail);
      if (provider.network !== "testnet" || !retryableIndexerFailure) throw error;
      onDiagnostic?.("testnet_indexer_unavailable_rpc_block_scan");
    }
    if (!signerId && provider.network === "testnet") {
      onDiagnostic?.("testnet_rpc_block_scan_started");
      signerId = await signerFromCanonicalRpcBlockWindow(
        rpcUrl, transactionHash, providerObservedAt, env.NEAR_TX_RECOVERY_WINDOW_BLOCKS, onDiagnostic,
        recoveryStore,
      );
      if (signerId) onDiagnostic?.("signer_resolved_from_canonical_rpc_block_scan");
    }
    if (!signerId) return reject(providerObservedAt
      ? "indexer_and_bounded_rpc_block_scan_did_not_find_matching_signer"
      : "indexer_did_not_return_matching_signer_provider_timestamp_required_for_rpc_scan");
  }
  const requestFinalStatus = (senderAccountId: string) => postJson(rpcUrl, {
    jsonrpc: "2.0",
    id: "pelargo-settlement-verifier",
    method: "EXPERIMENTAL_tx_status",
    params: {
      tx_hash: transactionHash,
      sender_account_id: senderAccountId,
      wait_until: "FINAL",
    },
  });
  let txStatus = await requestFinalStatus(signerId);
  // A configured signer is a lookup hint, not an authority. If canonical RPC
  // rejects that sender/hash pair, recover the signer through the testnet
  // indexer and then the bounded canonical block scan before giving up.
  if (txStatus.error && configuredSigner && provider.network === "testnet") {
    onDiagnostic?.("configured_signer_hint_rejected_trying_indexer");
    const rejectedHint = signerId;
    signerId = null;
    try {
      const indexed = await requestJson(indexerUrl, { method: "GET", headers: indexerHeaders });
      signerId = indexedSigner(indexed, transactionHash);
    } catch {
      onDiagnostic?.("testnet_indexer_unavailable_after_signer_hint_rejection");
    }
    if (!signerId || signerId === rejectedHint) {
      signerId = await signerFromCanonicalRpcBlockWindow(
        rpcUrl, transactionHash, providerObservedAt, env.NEAR_TX_RECOVERY_WINDOW_BLOCKS,
        onDiagnostic, recoveryStore,
      );
    }
    if (!signerId || signerId === rejectedHint) {
      return reject("configured_signer_rejected_and_alternative_signer_not_found");
    }
    onDiagnostic?.("alternative_signer_resolved_after_configured_hint_rejection");
    txStatus = await requestFinalStatus(signerId);
  }
  if (txStatus.error) return reject("rpc_transaction_status_error");
  const result = record(txStatus.result);
  if (!result || !rpcSuccess(result.status)) return reject("transaction_not_successful_or_not_final");

  const receipts = Array.isArray(result.receipts_outcome) ? result.receipts_outcome : [];
  let netReceived = 0n;
  let lastRelevantReceiptBlockHash: string | null = null;
  for (const item of receipts) {
    const receiptOutcome = record(item);
    const outcome = record(receiptOutcome?.outcome);
    if (outcome?.executor_id !== tokenContract || !rpcSuccess(outcome.status)) continue;

    const logs = Array.isArray(outcome.logs) ? outcome.logs : [];
    for (const rawLog of logs) {
      if (typeof rawLog !== "string" || !rawLog.startsWith("EVENT_JSON:")) continue;
      let event: JsonRecord | null = null;
      try { event = record(JSON.parse(rawLog.slice("EVENT_JSON:".length))); }
      catch { continue; }
      if (event?.standard !== "nep141" || event.version !== "1.0.0" ||
          event.event !== "ft_transfer" || !Array.isArray(event.data)) continue;

      for (const rawEntry of event.data) {
        const entry = record(rawEntry);
        if (!entry || typeof entry.amount !== "string" || !/^\d+$/.test(entry.amount)) continue;
        const incoming = entry.new_owner_id === order.recipient;
        const outgoing = entry.old_owner_id === order.recipient;
        if (!incoming && !outgoing) continue;
        const amount = BigInt(entry.amount);
        netReceived += incoming ? amount : -amount;
        if (typeof receiptOutcome?.block_hash === "string") {
          lastRelevantReceiptBlockHash = receiptOutcome.block_hash;
        }
      }
    }
  }

  // NEP-141 ft_transfer_call can emit an incoming transfer before its
  // resolver receipt refunds some or all of it. Verify net movement across
  // all successful token-contract receipts, not just the first incoming log.
  if (netReceived !== BigInt(order.amountAtomic) || !lastRelevantReceiptBlockHash) return reject("exact_nep141_net_transfer_not_found");

  const blockResponse = await postJson(rpcUrl, {
    jsonrpc: "2.0",
    id: "pelargo-settlement-block",
    method: "block",
    params: { block_id: lastRelevantReceiptBlockHash },
  });
  const block = record(blockResponse.result);
  const header = record(block?.header);
  if (!header || header.hash !== lastRelevantReceiptBlockHash ||
      (typeof header.height !== "number" && typeof header.height !== "string")) return reject("receipt_block_lookup_failed");
  const blockHeight = BigInt(header.height);
  if (blockHeight < 1n) return reject("invalid_receipt_block_height");

  const latestFinal = await postJson(rpcUrl, {
    jsonrpc: "2.0",
    id: "pelargo-settlement-finality",
    method: "block",
    params: { finality: "final" },
  });
  const latestHeader = record(record(latestFinal.result)?.header);
  if (!latestHeader || (typeof latestHeader.height !== "number" && typeof latestHeader.height !== "string") ||
      BigInt(latestHeader.height) < blockHeight) return reject("receipt_block_not_finalized");

  return {
    destinationChain: "NEAR",
    destinationAsset: order.destinationAsset,
    tokenContract,
    transactionHash,
    recipient: order.recipient,
    amountAtomic: order.amountAtomic,
    blockNumber: blockHeight.toString(),
    blockHash: lastRelevantReceiptBlockHash,
    confirmations: Number(BigInt(latestHeader.height) - blockHeight + 1n),
  };
}
