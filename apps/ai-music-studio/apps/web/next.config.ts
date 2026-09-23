import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  output: "standalone",
  agentRules: false,
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
  transpilePackages: ["@hungreegoat/studio-ui", "@hungreegoat/studio-contracts"],
  poweredByHeader: false,
};
export default config;

