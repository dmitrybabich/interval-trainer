import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// base must match the GitHub Pages sub-path (repo name) so asset URLs resolve.
export default defineConfig({
  base: "/interval-trainer/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon-48.png", "apple-touch-icon.png", "icon.svg"],
      manifest: {
        name: "Interval Trainer",
        short_name: "Intervals",
        description: "Vocal interval trainer — sing intervals, get real-time pitch feedback.",
        theme_color: "#1a1613",
        background_color: "#1a1613",
        display: "standalone",
        orientation: "portrait",
        // scope/start_url resolve against `base`, so they land under /interval-trainer/.
        scope: "./",
        start_url: "./",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Cache the app shell. Piano samples + pitchy come from esm.sh / GitHub Pages
        // CDNs at runtime — cache those on first fetch so a revisit works offline.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,midi}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://esm.sh" || url.origin.includes("githack") || url.href.includes("midi-js-soundfonts"),
            handler: "CacheFirst",
            options: {
              cacheName: "audio-cdn",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
