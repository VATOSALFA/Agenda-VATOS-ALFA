const OPTIMIZABLE_IMAGE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'images.unsplash.com',
  'i.ibb.co',
  'placehold.co',
  'lh3.googleusercontent.com',
  'vatosalfa.com',
]);

/**
 * Determines whether Next.js image optimization should be bypassed for a given source.
 * Keeps optimization active for local assets (except the tiny 2.6 KB logo icon) and allowlisted CDNs,
 * while safely bypassing unknown external hosts so unconfigured domains never crash rendering.
 */
export function shouldBypassImageOptimization(src?: string | null): boolean {
  if (!src) return true;
  if (src.startsWith('data:') || src.startsWith('blob:')) return true;
  if (src === '/logo-v-400x400.webp') return true;
  if (src.startsWith('/')) return false;

  try {
    const parsed = new URL(src);
    return !OPTIMIZABLE_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return true;
  }
}
