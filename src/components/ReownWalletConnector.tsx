import React, { useEffect } from "react";
import {
  createAppKit,
  useAppKit,
  useAppKitAccount,
  useAppKitNetworkCore,
  useAppKitProvider,
  type Provider,
} from "@reown/appkit/react";
import { baseSepolia } from "@reown/appkit/networks";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
if (!projectId) throw new Error("VITE_REOWN_PROJECT_ID is required to initialize Reown AppKit.");

createAppKit({
  adapters: [new EthersAdapter()],
  networks: [baseSepolia],
  projectId,
  metadata: {
    name: "Pelargo",
    description: "Non-custodial crypto checkout",
    url: window.location.origin,
    icons: [],
  },
  themeMode: "light",
  themeVariables: { "--w3m-accent": "#315be8" },
  features: { analytics: false, email: false, socials: [] },
});

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type Props = {
  onConnected: (provider: Eip1193Provider, address: string, chainId: string) => void;
  onDisconnected: () => void;
  disabled?: boolean;
  label?: string;
};

export default function ReownWalletConnector({
  onConnected, onDisconnected, disabled = false, label = "Connect wallet",
}: Props) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Provider>("eip155");
  const { chainId } = useAppKitNetworkCore();

  useEffect(() => {
    if (isConnected && address && walletProvider) {
      const numericChainId = Number(chainId);
      const normalizedChainId = Number.isFinite(numericChainId)
        ? `0x${numericChainId.toString(16)}`
        : String(chainId ?? "");
      onConnected(walletProvider as unknown as Eip1193Provider, address, normalizedChainId);
    } else if (!isConnected) {
      onDisconnected();
    }
  }, [isConnected, address, walletProvider, chainId, onConnected, onDisconnected]);

  return (
    <button type="button" className="pelargo-quote-button" onClick={() => { void open(); }} disabled={disabled}>
      {label}{!isConnected && <span aria-hidden="true"> →</span>}
    </button>
  );
}
