import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The review surface is viewed at exactly 393×902; Next's development badge
  // sits on top of the tab bar at that size, so it is switched off.
  devIndicators: false,
};

export default nextConfig;
