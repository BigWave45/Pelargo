import React from "react";
import { createRoot, Root } from "react-dom/client";
import { PelargoCheckout } from "./components/PelargoCheckout";
import "./styles/embed.css";

class PelargoCheckoutElement extends HTMLElement {
  private root?: Root;
  private mountNode?: HTMLDivElement;

  static get observedAttributes() {
    return [
      "merchant-name",
      "amount",
      "order-id",
      "destination-asset",
      "destination-symbol",
      "destination-network",
      "recipient",
      "session-token",
    ];
  }

  connectedCallback() {
    if (this.root) return;
    const shadow = this.attachShadow({ mode: "open" });
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = new URL("./pelargo.css", import.meta.url).toString();
    shadow.appendChild(stylesheet);
    this.mountNode = document.createElement("div");
    this.mountNode.className = "pelargo-embed-root";
    shadow.appendChild(this.mountNode);
    this.root = createRoot(this.mountNode);
    this.renderCheckout();
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = undefined;
    this.mountNode = undefined;
  }

  attributeChangedCallback() {
    this.renderCheckout();
  }

  private renderCheckout() {
    if (!this.root || !this.mountNode) return;
    const amount = this.getAttribute("amount") ?? "";
    const orderId = this.getAttribute("order-id") ?? "";
    const recipient = this.getAttribute("recipient") ?? "";
    const sessionToken = this.getAttribute("session-token") ?? "";
    const destinationAssetId = this.getAttribute("destination-asset") ?? undefined;
    const destinationSymbol = this.getAttribute("destination-symbol") ?? "";
    const destinationNetwork = this.getAttribute("destination-network") ?? "";
    const merchantName = this.getAttribute("merchant-name") ?? "Merchant";
    const missing = !amount || !orderId || !recipient || !sessionToken ||
      (!destinationAssetId && (!destinationSymbol || !destinationNetwork));

    if (missing) {
      this.root.render(
        <div className="pelargo-embed-error" role="alert">
          Pelargo checkout configuration is incomplete. Provide amount, order-id, recipient, session-token and either destination-asset or destination-symbol plus destination-network.
        </div>
      );
      return;
    }

    this.root.render(
      <PelargoCheckout
        merchantName={merchantName}
        destinationSymbol={destinationSymbol}
        destinationNetwork={destinationNetwork}
        destinationAssetId={destinationAssetId}
        recipient={recipient}
        orderId={orderId}
        amount={amount}
        fixedAmount
        sessionToken={sessionToken}
        apiBaseUrl={new URL(import.meta.url).origin}
      />
    );
  }
}

if (!customElements.get("pelargo-checkout")) {
  customElements.define("pelargo-checkout", PelargoCheckoutElement);
}
