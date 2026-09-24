import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  output: "standalone",
  agentRules: false,
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
  transpilePackages: ["@hungreegoat/studio-ui", "@hungreegoat/studio-contracts"],
  poweredByHeader: false,
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      // Browsers ignore HSTS over local HTTP; the same image is safe behind TLS.
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default config;
