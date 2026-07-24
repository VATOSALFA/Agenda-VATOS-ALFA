export default function weservLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  // Only proxy external URLs (like Firebase Storage)
  if (src.startsWith('http')) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}&output=webp`;
  }
  // Return local images directly (e.g. /logo-vatos-wa.webp)
  return src;
}
