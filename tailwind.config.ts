import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Verdict palette — always paired with an icon/label, never color-only.
        scam: "#dc2626",
        suspicious: "#d97706",
        clean: "#16a34a",
        patch: "#f5e9d4",
        seam: "#8b5a2b",
      },
      fontFamily: {
        // Ragged, "stitched" feel for patches.
        stitch: ["Georgia", "Cambria", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
