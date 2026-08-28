import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empaqueta el servidor y solo las dependencias que usa en .next/standalone,
  // para que la imagen no lleve node_modules completo.
  output: 'standalone',
};

export default nextConfig;
