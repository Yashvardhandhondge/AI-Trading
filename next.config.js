/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Configure for proper socket.io handling
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
      {
        // Special headers for socket.io route
        source: '/api/socketio',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ]
  },
  // Allow socket endpoint on serverless platform
  webpack: (config, { isServer }) => {
    // For socket.io support
    if (!isServer) {
      config.externals = [...(config.externals || []), 'bufferutil', 'utf-8-validate'];
    }
    
    return config;
  },
}

module.exports = nextConfig
