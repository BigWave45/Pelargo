import { Env } from "./intents";

type RpcRecord = Record<string, unknown>;

function asRecord(value: unknown): RpcRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RpcRecord : null;
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "pelargo-origin-deposit", method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Base Sepolia RPC returned HTTP ${response.status}`);
  const payload = asRecord(await response.json());
  if (!payload || payload.error) throw new Error("Base Sepolia RPC returned an invalid or failed response");
  return payload.result;
}

export type BaseSepoliaDepositEvidence = {
  chainId: "0x14a34";
  tokenContract: string;
  transactionHash: string;
  depositAddress: string;
  amountAtomic: string;
  blockNumber: string;
  blockHash: string;
  confirmations: number;
};

export async function verifyBaseSepoliaErc20Deposit(
  env: Env,
  input: {
    tokenContract: string;
    transactionHash: string;
    depositAddress: string;
    amountAtomic: string;
  },
): Promise<BaseSepoliaDepositEvidence | null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.tokenContract) ||
      !/^0x[a-fA-F0-9]{64}$/.test(input.transactionHash) ||
      !/^0x[a-fA-F0-9]{40}$/.test(input.depositAddress) ||
      !/^\d+$/.test(input.amountAtomic) || BigInt(input.amountAtomic) <= 0n) return null;

  const rpcUrl = env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const chainId = await rpc(rpcUrl, "eth_chainId", []) as string;
  if (chainId?.toLowerCase() !== "0x14a34") return null;

  const receipt = asRecord(await rpc(rpcUrl, "eth_getTransactionReceipt", [input.transactionHash]));
  if (!receipt || receipt.status !== "0x1" ||
      typeof receipt.transactionHash !== "string" ||
      receipt.transactionHash.toLowerCase() !== input.transactionHash.toLowerCase() ||
      typeof receipt.blockNumber !== "string" || typeof receipt.blockHash !== "string" ||
      !Array.isArray(receipt.logs)) return null;

  const latestBlock = await rpc(rpcUrl, "eth_blockNumber", []) as string;
  if (typeof latestBlock !== "string" || !/^0x[0-9a-fA-F]+$/.test(latestBlock)) return null;
  const confirmations = Number(BigInt(latestBlock) - BigInt(receipt.blockNumber) + 1n);
  if (!Number.isSafeInteger(confirmations) || confirmations < 12) return null;

  const expectedToken = input.tokenContract.toLowerCase();
  const expectedRecipient = input.depositAddress.toLowerCase();
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  let received = 0n;
  for (const rawLog of receipt.logs) {
    const log = asRecord(rawLog);
    if (!log || typeof log.address !== "string" || log.address.toLowerCase() !== expectedToken ||
        !Array.isArray(log.topics) || log.topics.length < 3 ||
        typeof log.topics[0] !== "string" || log.topics[0].toLowerCase() !== transferTopic ||
        typeof log.topics[2] !== "string" ||
        typeof log.data !== "string" || !/^0x[0-9a-fA-F]+$/.test(log.data)) continue;
    const recipientTopic = log.topics[2].toLowerCase();
    if (recipientTopic !== `0x${expectedRecipient.slice(2).padStart(64, "0")}`) continue;
    received += BigInt(log.data);
  }
  if (received !== BigInt(input.amountAtomic)) return null;

  return {
    chainId: "0x14a34",
    tokenContract: expectedToken,
    transactionHash: input.transactionHash,
    depositAddress: expectedRecipient,
    amountAtomic: received.toString(),
    blockNumber: BigInt(receipt.blockNumber).toString(),
    blockHash: receipt.blockHash,
    confirmations,
  };
}
