import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "stream.zkas.wallet",
  appName: "Stream Wallet",
  webDir: "dist",
  backgroundColor: "#071713",
  ios: {
    contentInset: "never",
    // Match the origin accepted by the official hosted wallet daemon's CORS policy.
    scheme: "capacitor",
  },
  server: {
    // Capacitor 6 configures Android's WebView origin here (https://localhost).
    androidScheme: "https",
  },
};

export default config;
