import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 43200; // 12 hours

const DEFAULT_PLACE_ID = process.env.GOOGLE_MAPS_PLACE_ID || 'ChIJxQ4hagBb04URwQM4y5UsX-U';
const OFFICIAL_QUERY = 'VATOS ALFA Barber Shop Av. Sombrerete 1001, Col. Cipreses, Querétaro';
const ALLOWED_PLACE_IDS = new Set<string>(
  [DEFAULT_PLACE_ID, 'ChIJxQ4hagBb04URwQM4y5UsX-U'].filter(Boolean)
);

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ratingCache = new Map<string, { payload: Record<string, any>; expiresAt: number }>();

function jsonWithCache(payload: Record<string, any>) {
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=86400',
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestedPlaceId = (searchParams.get('placeId') || '').trim();
  const placeId = ALLOWED_PLACE_IDS.has(requestedPlaceId) ? requestedPlaceId : DEFAULT_PLACE_ID;

  const cached = ratingCache.get(placeId);
  if (cached && Date.now() < cached.expiresAt) {
    return jsonWithCache(cached.payload);
  }

  const defaultMapsUri = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;

  const apiKey =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    '';

  if (apiKey) {
    try {
      // Google Places API (New v1) solo con campos esenciales (sin `reviews` para evitar SKU Atmosphere)
      const v1PlaceRes = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=es`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri',
          },
          next: { revalidate: 43200 },
        }
      );
      if (v1PlaceRes.ok) {
        const v1PlaceData = await v1PlaceRes.json();
        if (v1PlaceData && typeof v1PlaceData.rating === 'number') {
          const payload = {
            rating: Number(v1PlaceData.rating.toFixed(1)),
            userRatingCount: v1PlaceData.userRatingCount ?? 102,
            googleMapsUri: v1PlaceData.googleMapsUri || defaultMapsUri,
            source: 'google_places_v1_details',
          };
          ratingCache.set(placeId, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
          return jsonWithCache(payload);
        }
      }

      const v1Res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.rating,places.userRatingCount,places.googleMapsUri',
        },
        body: JSON.stringify({
          textQuery: OFFICIAL_QUERY,
          languageCode: 'es',
        }),
        next: { revalidate: 43200 },
      });

      if (v1Res.ok) {
        const v1Data = await v1Res.json();
        const place = v1Data?.places?.[0];
        if (place && typeof place.rating === 'number') {
          const payload = {
            rating: Number(place.rating.toFixed(1)),
            userRatingCount: place.userRatingCount || null,
            googleMapsUri: place.googleMapsUri || defaultMapsUri,
            source: 'google_places_v1',
          };
          ratingCache.set(placeId, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
          return jsonWithCache(payload);
        }
      }
    } catch (err) {
      console.warn('[google-rating] Places API warning:', err);
    }
  }

  const fallbackPayload = {
    rating: 4.5,
    userRatingCount: 102,
    googleMapsUri: defaultMapsUri,
    source: 'fallback',
  };
  ratingCache.set(placeId, { payload: fallbackPayload, expiresAt: Date.now() + 30 * 60 * 1000 });
  return jsonWithCache(fallbackPayload);
}
