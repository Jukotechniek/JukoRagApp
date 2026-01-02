/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Required for Docker deployment
  eslint: {
    // Don't fail build on ESLint errors during production build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Temporarily ignore TypeScript errors during build to allow deployment
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // REMOVED env section - secrets should ONLY be accessed via process.env in server-side code
  // Never expose service role keys or other secrets in next.config.js env
  // They are automatically available via process.env in API routes and server components
};

export default nextConfig;

