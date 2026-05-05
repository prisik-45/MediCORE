import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  allowedDevOrigins: ["http://localhost:3000", "http://192.168.29.215:3000"]
};

export default nextConfig;
