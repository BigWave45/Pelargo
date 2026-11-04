# Pelargo

A premium, non-custodial checkout widget that lets buyers pay from whatever wallet and chain they already have while the merchant receives exactly what they asked for.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Hackathon Demo](https://img.shields.io/badge/Status-Hackathon%20Ready-success.svg)](SCOPE.md)

---

## Status

Stages 1–3 (UI, flow, and demo store) are built with mock data. Real wallet connection and live payments are not built yet. See [SCOPE.md](SCOPE.md) for full architecture and roadmap details.

---

## How to run

```bash
bun install
bun run dev
```

Visit `http://localhost:3000` to interact with the demo merchant store and dev panel.

*(Note: `npm install && npm run dev` can also be used if preferred).*

---

## The Stack

- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Plain CSS powered strictly by design tokens (`src/styles/tokens.css`)
- **Icons**: Minimal SVG vectors and Lucide React icons
- **Zero-runtime API calls**: Deterministic mock intent solver data

---

## Architecture: Built on Intents

Pelargo never holds funds. The buyer picks a wallet and token, gets a quote with a deposit address, and sends funds from their own wallet. The Intents network delivers the merchant's chosen token to the merchant. Pelargo only requests quotes and checks status.

```text
 ┌───────────────┐
 │ Buyer Wallet  │ (Any token & chain: ETH, SOL, NEAR, USDT, USDC)
 └───────┬───────┘
         │ 1. Sends native funds to quote deposit address
         ▼
 ┌────────────────────────────────────────────────────────┐
 │                   Intent Solvers                       │
 │  • Fills order instantly with guaranteed rate          │
 │  • Executes cross-chain bridge & swap off-screen       │
 └───────┬────────────────────────────────────────────────┘
         │ 2. Direct settlement
         ▼
 ┌───────────────┐
 │   Merchant    │ (Receives exact requested currency e.g. 25.00 USDC)
 └───────────────┘

 * Pelargo Widget only coordinates quotes, countdowns, and settlement status *
```

---

## Quick Judge & Reviewer Guide

The demo store for **Northwind Goods** includes a floating **Pelargo Dev Review** panel in the bottom-right corner designed specifically for hackathon evaluation:

1. **Theme Switcher**: Instant toggle between Dark mode (default) and Light mode. Both themes strictly adhere to WCAG 4.5:1 contrast standards.
2. **Screen Jumps**: One-click preview of all 5 happy screens and 3 error/loading states:
   - `1. Choose`: Top 3 chain options with quick route selection.
   - `2. TokenPicker`: Searchable token list grouped by network.
   - `3. Confirm`: Quote breakdown with live 42s timer (<10s warning state).
   - `4. Progress`: 3-stage status timeline with calm pulsing indicator and active-payment exit protection.
   - `5. Receipt`: Success animation and mock transaction explorer link.
   - `Err: Expired`: Automatic recovery for outdated exchange rates.
   - `Err: Failed`: Plain-language confirmation of funds safety.
   - `Loading`: 600ms shimmer skeleton loader.
3. **Merchant Theming Demo**: Test the `accent` prop override button to preview merchant brand personalization.
4. **Mobile Responsiveness**: Test at 360px viewport width—the widget automatically transforms from a centered modal into an ergonomic bottom sheet.

---

## License

This project is licensed under the [MIT License](LICENSE).
