import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ¡NADA de `output: "export"` ni `images: { unoptimized: true }`!
  typescript: { ignoreBuildErrors: true }, // opcional/temporal
};

export default nextConfig;
