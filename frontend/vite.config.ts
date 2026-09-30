import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  // web3.js and anchor expect Node's Buffer in the browser.
  plugins: [react(), tailwindcss(), nodePolyfills({ include: ["buffer", "crypto", "stream", "util"] })],
  server: {
    port: 5173,
    // Lets a tunnel (cloudflared) expose the dev site, e.g. to open it on a phone.
    allowedHosts: [".trycloudflare.com"],
    // VITE_API_URL=/api: same-origin API through the dev server, so one public address serves both.
    proxy: { "/api": { target: "http://localhost:3000", rewrite: (p) => p.replace(/^\/api/, ""), xfwd: true } },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          solana: ["@solana/web3.js", "@solana/spl-token", "@coral-xyz/anchor"],
          wallet: ["@solana/wallet-adapter-react", "@solana/wallet-adapter-react-ui"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
