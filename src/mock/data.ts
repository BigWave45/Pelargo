export interface PayOption {
  id: string;
  symbol: string;
  name: string;
  chain: string;
  chainId: string;
  balance: number;
  rateUsd: number;
  decimals: number;
  iconType: 'eth' | 'usdc' | 'sol' | 'near' | 'usdt';
  chainIconType: 'ethereum' | 'base' | 'solana' | 'near' | 'arbitrum';
  depositAddress: string;
  explorerBaseUrl: string;
}

export interface StoreProduct {
  id: string;
  title: string;
  category: string;
  description: string;
  priceUsdc: number;
  edition: string;
}

export interface MerchantOrder {
  merchantName: string;
  orderId: string;
  orderTotal: number;
  orderCurrency: string;
  itemTitle: string;
  itemDescription: string;
}

export interface SettlementRecord {
  id: string;
  orderId: string;
  timestamp: string;
  buyerChain: string;
  buyerToken: string;
  amountPaid: string;
  amountReceived: string;
  feeUsdc: string;
  txHash: string;
  explorerUrl: string;
  status: 'settled' | 'confirming';
}

export const STORE_PRODUCTS: StoreProduct[] = [
  {
    id: "journal-01",
    title: "Field Technical Journal (Set of 2)",
    category: "Field & Studio",
    description: "Waterproof stone-paper notebook with laser-etched brass bookmark.",
    priceUsdc: 25.00,
    edition: "EDITION NO. 04",
  },
  {
    id: "pen-02",
    title: "Machined Solid Brass Pen",
    category: "Studio Instruments",
    description: "Balanced raw brass rollerball engineered with German ceramic refill.",
    priceUsdc: 18.00,
    edition: "EDITION NO. 02",
  },
  {
    id: "bag-03",
    title: "Waxed Canvas Field Bag",
    category: "Expedition Gear",
    description: "14oz water-resistant duck canvas with bridle leather straps.",
    priceUsdc: 85.00,
    edition: "EDITION NO. 01",
  },
];

export const MOCK_ORDER: MerchantOrder = {
  merchantName: "Northwind Goods",
  orderId: "NW-10482",
  orderTotal: 25.00,
  orderCurrency: "USDC",
  itemTitle: "Field Technical Journal (Set of 2)",
  itemDescription: "Waterproof stone-paper notebook with laser-etched brass bookmark.",
};

export const MOCK_PAY_OPTIONS: PayOption[] = [
  {
    id: "usdc-base",
    symbol: "USDC",
    name: "USD Coin",
    chain: "Base",
    chainId: "base",
    balance: 180.50,
    rateUsd: 1.00,
    decimals: 2,
    iconType: "usdc",
    chainIconType: "base",
    depositAddress: "0x892cA3b05B85392F8eF9dE9817C8A9eD3F6532f1",
    explorerBaseUrl: "https://basescan.org/tx/",
  },
  {
    id: "eth-ethereum",
    symbol: "ETH",
    name: "Ether",
    chain: "Ethereum",
    chainId: "ethereum",
    balance: 1.425,
    rateUsd: 2850.00,
    decimals: 4,
    iconType: "eth",
    chainIconType: "ethereum",
    depositAddress: "0x71C94B48443B069Fa1C8983229b057d2a57842e9",
    explorerBaseUrl: "https://etherscan.io/tx/",
  },
  {
    id: "sol-solana",
    symbol: "SOL",
    name: "Solana",
    chain: "Solana",
    chainId: "solana",
    balance: 14.80,
    rateUsd: 155.00,
    decimals: 3,
    iconType: "sol",
    chainIconType: "solana",
    depositAddress: "9vG8KxM6Qn2P4R7tY8j8W5h3L1pV4zX6sA9qD2eF7uT",
    explorerBaseUrl: "https://solscan.io/tx/",
  },
  {
    id: "near-near",
    symbol: "NEAR",
    name: "NEAR",
    chain: "NEAR",
    chainId: "near",
    balance: 85.00,
    rateUsd: 4.80,
    decimals: 2,
    iconType: "near",
    chainIconType: "near",
    depositAddress: "intent-solver-vault.pelargo.near",
    explorerBaseUrl: "https://nearblocks.io/txns/",
  },
  {
    id: "usdt-arbitrum",
    symbol: "USDT",
    name: "Tether USD",
    chain: "Arbitrum",
    chainId: "arbitrum",
    balance: 340.00,
    rateUsd: 1.00,
    decimals: 2,
    iconType: "usdt",
    chainIconType: "arbitrum",
    depositAddress: "0x34A618e47B0B2E92aC2d7F78B4519f07a72318e4",
    explorerBaseUrl: "https://arbiscan.io/tx/",
  },
];

export const INITIAL_SETTLEMENT_HISTORY: SettlementRecord[] = [
  {
    id: "set-01",
    orderId: "NW-10480",
    timestamp: "12 mins ago",
    buyerChain: "Solana",
    buyerToken: "SOL",
    amountPaid: "0.161 SOL",
    amountReceived: "25.00 USDC",
    feeUsdc: "0.20 USDC",
    txHash: "5kK8...9p2q",
    explorerUrl: "https://solscan.io",
    status: "settled",
  },
  {
    id: "set-02",
    orderId: "NW-10479",
    timestamp: "38 mins ago",
    buyerChain: "Ethereum",
    buyerToken: "ETH",
    amountPaid: "0.0088 ETH",
    amountReceived: "25.00 USDC",
    feeUsdc: "0.20 USDC",
    txHash: "0x72a...4f1c",
    explorerUrl: "https://etherscan.io",
    status: "settled",
  },
  {
    id: "set-03",
    orderId: "NW-10477",
    timestamp: "1 hour ago",
    buyerChain: "Base",
    buyerToken: "USDC",
    amountPaid: "25.20 USDC",
    amountReceived: "25.00 USDC",
    feeUsdc: "0.20 USDC",
    txHash: "0x918...e84c",
    explorerUrl: "https://basescan.org",
    status: "settled",
  },
];

export interface QuoteDetails {
  basePayAmount: number;
  feeAmount: number;
  totalPayAmount: number;
  formattedYouPay: string;
  formattedFee: string;
  formattedReceive: string;
  formattedTotal: string;
  payButtonText: string;
  rateDescription: string;
  depositAddress: string;
  explorerUrl: string;
  txHash: string;
}

export function formatCryptoAmount(num: number, decimals: number): string {
  if (num === 0) return "0";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(2, decimals),
    maximumFractionDigits: decimals,
  });
}

export function computeQuote(option: PayOption, targetUsd: number = 25.00): QuoteDetails {
  const FEE_RATE = 0.008; // 0.8% fee
  const rawBaseInToken = targetUsd / option.rateUsd;
  const rawFeeInToken = rawBaseInToken * FEE_RATE;
  const rawTotalInToken = rawBaseInToken + rawFeeInToken;

  const formattedYouPay = `${formatCryptoAmount(rawBaseInToken, option.decimals)} ${option.symbol}`;
  const formattedFee = `${formatCryptoAmount(rawFeeInToken, option.decimals > 2 ? option.decimals + 1 : 2)} ${option.symbol}`;
  const formattedReceive = `${targetUsd.toFixed(2)} USDC`;
  const formattedTotal = `${formatCryptoAmount(rawTotalInToken, option.decimals)} ${option.symbol}`;
  const payButtonText = `Pay ${formattedTotal}`;

  const rateDescription = option.symbol === "USDC"
    ? "1.00 USDC = 1.00 USDC"
    : `1 ${option.symbol} ≈ ${option.rateUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;

  const txHash = `0x${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)}`;
  const explorerUrl = `${option.explorerBaseUrl}${txHash.replace("...", "")}`;

  return {
    basePayAmount: rawBaseInToken,
    feeAmount: rawFeeInToken,
    totalPayAmount: rawTotalInToken,
    formattedYouPay,
    formattedFee,
    formattedReceive,
    formattedTotal,
    payButtonText,
    rateDescription,
    depositAddress: option.depositAddress,
    explorerUrl,
    txHash,
  };
}
