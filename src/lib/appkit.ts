import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { defineChain } from "@reown/appkit/networks";

const previewOrigin = "https://reliability-background-recon.pelargo.pages.dev";

export const pelargoBaseSepolia = defineChain({
  id: 84532,
  caipNetworkId: "eip155:84532",
  chainNamespace: "eip155",
  name: "Base Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://base-sepolia.blockscout.com" },
  },
});

const projectId = "1dd7bf7474c9aaa31e24e8e753de9cd4";

export const pelargoAppKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [pelargoBaseSepolia],
  defaultNetwork: pelargoBaseSepolia,
  projectId,
  metadata: {
    name: "Pelargo",
    description: "Merchant-controlled crypto checkout with independently verified settlement.",
    url: previewOrigin,
    icons: [`${previewOrigin}/favicon.ico`],
    // Tell external wallets where to return after the WalletConnect handoff.
    redirect: { universal: previewOrigin },
  },
  themeMode: "light",
  features: { analytics: false, email: false, socials: [] },
});
