// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // ⭐ THIS is the key line
    allowedHosts: "all",
    port: 8080,
  },
  preview: {
    host: true, // (optional, but good)
    allowedHosts: "all",
    port: 8080,
  },
});
