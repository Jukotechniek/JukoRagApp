/** @type {import('next').NextConfig} */

/**
 * Project structure:
 * - app/ directory is located in src/app/ (moved from root to fix Next.js validator.ts path bug)
 * - All components, libs, contexts, etc. are in src/
 * - This structure ensures Next.js generates correct paths in validator.ts
 */

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Required for Docker deployment
  eslint: {
    // Don't fail build on ESLint errors during production build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // TypeScript errors are now resolved - strict checking enabled
    // Fixed validator.ts path bug by moving app/ to src/app/
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  webpack: (config, { isServer }) => {
    // Fix for react-pdf-viewer and pdfjs-dist: prevent Node.js modules from being bundled
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        'utf-8-validate': false,
        'bufferutil': false,
      };
    } else {
      // On server side, also ignore these modules
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        'utf-8-validate': false,
        'bufferutil': false,
      };
    }
    
    // Ignore canvas and other Node.js modules in pdfjs-dist
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      'utf-8-validate': false,
      'bufferutil': false,
    };
    
    return config;
  },
  // REMOVED env section - secrets should ONLY be accessed via process.env in server-side code
  // Never expose service role keys or other secrets in next.config.js env
  // They are automatically available via process.env in API routes and server components
};

export default nextConfig;
