/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow large base64 image payloads in POST /api/analyze (default is 1 MB).
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
