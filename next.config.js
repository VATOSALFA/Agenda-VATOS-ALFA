
/** @type {import('next').NextConfig} */

// Load environment variables from .env file for local development
if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: './.env' });
}


const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    allowedDevOrigins: [
      "https://*.cluster-f4iwdviaqvc2ct6pgytzw4xqy4.cloudworkstations.dev",
    ],
  },
  webpack(config, { isServer }) {
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
    };
    
    // Mark server-side modules as external to prevent bundling errors
    if (!isServer) {
        config.externals = {
            ...config.externals,
            'express': 'express',
            'handlebars': 'handlebars',
            'require-in-the-middle': 'require-in-the-middle',
            '@opentelemetry/api': '@opentelemetry/api',
            '@opentelemetry/sd-node': '@opentelemetry/sd-node',
            '@opentelemetry/resources': '@opentelemetry/resources',
            '@opentelemetry/semantic-conventions': '@opentelemetry/semantic-conventions',
            '@opentelemetry/instrumentation': '@opentelemetry/instrumentation',
            '@opentelemetry/exporter-jaeger': '@opentelemetry/exporter-jaeger',
        };
    }

    config.module.rules.push({
      test: /node_modules\/handlebars\/lib\/index\.js$/,
      loader: 'string-replace-loader',
      options: {
        search: 'require.extensions',
        replace: '[]',
      },
    });

    return config;
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
        hostname: 'storage.googleapis.com',
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
