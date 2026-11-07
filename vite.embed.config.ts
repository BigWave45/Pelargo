import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // React's production runtime reads this expression; standalone browser embeds
  // have no Node.js process global, so replace it at bundle time.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/embed.tsx",
      formats: ["es"],
      fileName: () => "pelargo.js",
      cssFileName: "pelargo",
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
