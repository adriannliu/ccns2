/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow large base64 image payloads in POST /api/analyze (default is 1 MB).
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // macOS caps open files per process (kern.maxfilesperproc), and the
      // default fs.watch-based watcher opens one descriptor per file, which
      // exhausts that limit (EMFILE) on large trees. Poll instead, and skip
      // directories that never need watching in dev.
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/node_modules", "**/.next", "**/.git"],
      };
    }
    return config;
  },
};

export default nextConfig;
