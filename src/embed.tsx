import React, { useEffect, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { PelargoCheckout } from "./components/PelargoCheckout";
import "./styles/embed.css";

type CheckoutProps = {
  merchantName: string;
  destinationSymbol: string;
  destinationNetwork: string;
  destinationAssetId?: string;
  recipient: string;
  orderId: string;
  amount: string;
  sessionToken: string;
  apiBaseUrl: string;
};

function PelargoCheckoutLauncher({
  checkout,
  buttonLabel,
}: {
  checkout: CheckoutProps;
  buttonLabel: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="pelargo-launcher">
      <button
        type="button"
        className="pelargo-launcher-button"
        onClick={() => setOpen(true)}
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          className="pelargo-modal-backdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <section
            className="pelargo-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Pay ${checkout.merchantName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pelargo-modal-topbar">
              <span>SECURE CHECKOUT</span>
              <button
                type="button"
                className="pelargo-modal-close"
                aria-label="Close checkout"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <PelargoCheckout
              merchantName={checkout.merchantName}
              destinationSymbol={checkout.destinationSymbol}
              destinationNetwork={checkout.destinationNetwork}
              destinationAssetId={checkout.destinationAssetId}
              recipient={checkout.recipient}
              orderId={checkout.orderId}
              amount={checkout.amount}
              fixedAmount
              sessionToken={checkout.sessionToken}
              apiBaseUrl={checkout.apiBaseUrl}
            />
          </section>
        </div>
      )}
    </div>
  );
}

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
      "button-label",
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
    const buttonLabel = this.getAttribute("button-label") ?? "Pay with crypto";
    const missing = !amount || !orderId || !recipient || !sessionToken ||
      (!destinationAssetId && (!destinationSymbol || !destinationNetwork));

    if (missing) {
      this.root.render(
        <div className="pelargo-embed-error" role="alert">
          Pelargo checkout configuration is incomplete. Provide amount, order-id,
          recipient, session-token and either destination-asset or
          destination-symbol plus destination-network.
        </div>
      );
      return;
    }

    this.root.render(
      <PelargoCheckoutLauncher
        buttonLabel={buttonLabel}
        checkout={{
          merchantName,
          destinationSymbol,
          destinationNetwork,
          destinationAssetId,
          recipient,
          orderId,
          amount,
          sessionToken,
          apiBaseUrl: new URL(import.meta.url).origin,
        }}
      />
    );
  }
}

if (!customElements.get("pelargo-checkout")) {
  customElements.define("pelargo-checkout", PelargoCheckoutElement);
}
