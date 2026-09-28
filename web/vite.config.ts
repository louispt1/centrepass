import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Served from GitHub Pages at https://louispt1.github.io/centrepass/
export default defineConfig({
  base: "/centrepass/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,svg,png,webmanifest}"],
      },
      manifest: {
        name: "CentrePass",
        short_name: "CentrePass",
        description: "Netball match statistics - coded live, courtside, fully offline.",
        display: "standalone",
        orientation: "portrait",
        background_color: "#263E58",
        theme_color: "#263E58",
        icons: [
          { src: "icons/icon.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
