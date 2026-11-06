import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { offlinePlugin } from "./scripts/offline-plugin";
export default defineConfig({
  plugins: [react(), tailwindcss(), offlinePlugin()],
});
