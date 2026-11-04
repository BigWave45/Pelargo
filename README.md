# Pelargo

A premium, non-custodial checkout widget that lets buyers pay from whatever wallet and chain they already have while the merchant receives exactly what they asked for.

## Status

Stages 1-3 (UI, flow and demo store) are built with mock data. Real wallet connection and live payments are not built yet.

## How to run

```bash
bun install
bun run dev
```

Visit `http://localhost:3000` to interact with the demo merchant store and dev panel.

## The Stack

- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Plain CSS powered strictly by design tokens (`src/styles/tokens.css`)
- **Icons**: Minimal SVG vectors and Lucide React icons
- **Zero-runtime API calls**: Deterministic mock intent solver data

## Built on Intents

Pelargo never holds funds. The buyer picks a wallet and token, gets a quote with a deposit address, and sends funds from their own wallet. The Intents network delivers the merchant's chosen token to the merchant. Pelargo only requests quotes and checks status.
