
import withPWAInit from '@ducanh2912/next-pwa';
import fs from 'fs';
import path from 'path';

let buildId = 'dev';
try {
  const versionPath = path.join(process.cwd(), 'public', 'version.json');
  if (fs.existsSync(versionPath)) {
    const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    buildId = data.version;
  }
} catch (err) {
  console.warn('[Config] Failed to read version.json, using fallback:', err);
}

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: false,
  publicExcludes: ['!janeth-fullscreen.mp4', '!**/*.mp4', '!**/*.gif', '!logo-vatos-wa.png', '!version.json', '!llms.txt', '!.well-known/**/*', '!noprecache/**/*'],
  workboxOptions: {
    cleanupOutdatedCaches: true,
    exclude: [
      /\/_next\/static\/.*(?<!\.p)\.woff2/,
      /\.map$/,
      /^manifest.*\.js$/,
      /\(admin\)/,
      /finanzas/,
      /gerencia/,
      /ceo/,
    ],
    runtimeCaching: [
      {
        urlPattern: ({ request, url }) =>
          request.headers.get('RSC') === '1' ||
          url.searchParams.has('_rsc') ||
          url.pathname.startsWith('/_next/data/'),
        handler: 'NetworkOnly',
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', 'date-fns'],
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  async headers() {
    const immutableCacheHeaders = [
      {
        key: 'Cache-Control',
        value: 'public, max-age=31536000, immutable',
      },
    ];

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=()',
          },
          {
            key: 'Link',
            value: '</.well-known/ai-catalog.json>; rel="ai-catalog", </.well-known/ard.json>; rel="ard", </llms.txt>; rel="llms-txt"',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://www.googleadservices.com https://*.googleadservices.com https://*.doubleclick.net https://www.google.com https://*.google.com https://*.google.com.mx https://www.gstatic.com https://*.gstatic.com https://*.mercadopago.com https://*.mlstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https:",
              "media-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasestorage.app https://*.cloudfunctions.net https://*.run.app https://accounts.google.com https://apis.google.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://www.google.com https://*.google.com https://*.google.com.mx https://*.doubleclick.net https://www.googleadservices.com https://*.googleadservices.com https://*.mercadopago.com https://*.mercadopago.com.mx https://*.mlstatic.com https://*.mercadolibre.com",
              "frame-src 'self' https://*.mercadopago.com https://*.mercadopago.com.mx https://*.mercadolibre.com https://accounts.google.com https://*.firebaseapp.com https://www.googletagmanager.com https://*.googletagmanager.com https://www.google.com https://*.google.com https://*.doubleclick.net",
              "worker-src 'self' blob:",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
      {
        source: '/services/:path*',
        headers: immutableCacheHeaders,
      },
      ...[
        '/logo-header-blanco.webp',
        '/logo-header-blanco.png',
        '/logo-v-400x400.webp',
        '/logo-vatos-alfa.webp',
        '/logo-vatos-alfa.png',
        '/logo-vatos-wa.webp',
        '/logo-vatos-wa.png',
        '/icon-192x192.png',
        '/icon-512x512.png',
        '/icon-maskable-512x512.png',
        '/apple-touch-icon.png',
        '/icono-pagina-web.webp',
        '/janeth-poster.jpg',
      ].map((source) => ({
        source,
        headers: immutableCacheHeaders,
      })),
    ];
  },

  images: {
    formats: ['image/webp'],
    minimumCacheTTL: 2592000,
    deviceSizes: [384, 640, 750, 828, 1080, 1200],
    imageSizes: [36, 64, 96, 128, 256, 384],
    qualities: [75, 80, 85, 90, 95, 100],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
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
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ibb.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'vatosalfa.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildId,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_MP_WEB_PUBLIC_KEY: process.env.NEXT_PUBLIC_MP_WEB_PUBLIC_KEY || process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || '',
    NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || process.env.NEXT_PUBLIC_MP_WEB_PUBLIC_KEY || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || '',
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || process.env.NEXT_PUBLIC_MP_WEB_PUBLIC_KEY || process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || '',
  }
};

export default withPWA(nextConfig);
