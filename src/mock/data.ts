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
}

export interface MerchantOrder {
  merchantName: string;
  orderId: string;
  orderTotal: number;
  orderCurrency: string;
  itemTitle: string;
  itemDescription: string;
}

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
  };
}
