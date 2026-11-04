# Pelargo

A premium, non-custodial checkout widget that lets buyers pay from whatever wallet and chain they already have while the merchant receives exactly what they asked for.

## How to run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to interact with the demo merchant store and dev panel.

## The Stack

- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Plain CSS powered strictly by design tokens (`src/styles/tokens.css`)
- **Icons**: Minimal SVG vectors and Lucide React icons
- **Zero-runtime API calls**: Deterministic mock intent solver data

## Built on Intents

Pelargo is non-custodial and operates on intent-based settlement architecture:
- Pelargo never holds customer or merchant funds.
- Buyers sign standard intent authorizations from their native chain (Ethereum, Base, Solana, NEAR, Arbitrum).
- Professional intent solvers fill the request and deliver the exact designated currency to the merchant directly.
