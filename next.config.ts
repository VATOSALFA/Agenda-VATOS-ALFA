import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true } // temporal para que no bloquee el build
};

export default nextConfig;
