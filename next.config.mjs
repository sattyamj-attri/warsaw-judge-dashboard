/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Allow build to succeed even with TS errors (for rapid iteration)
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Required for Stagehand/Playwright to work in serverless
  serverExternalPackages: ['@browserbasehq/stagehand', 'playwright', 'playwright-core', 'pino-pretty'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig
