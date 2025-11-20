

/** @type {import('next').NextConfig} */

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/mercado-pago-webhook',
        destination: 'https://_ah/functions/mercadopagowebhook',
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media.twiliocdn.com',
        port: '',
        pathname: '/**',
      },
       {
        protocol: 'https',
        hostname: 'api.twilio.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
};

module.exports = nextConfig;





