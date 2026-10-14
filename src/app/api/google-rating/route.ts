import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 3600; // Cache 1 hour

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query =
    searchParams.get('query') ||
    'VATOS ALFA Barber Shop Av. Sombrerete 1001, Col. Cipreses, Querétaro';
  const placeId = searchParams.get('placeId') || process.env.GOOGLE_MAPS_PLACE_ID || '';

  const defaultMapsUri = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  const apiKey =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    '';

  // 1. Si hay API Key de Google Places (v1 o Legacy), consultar en tiempo real
  if (apiKey) {
    try {
      if (placeId) {
        const detailsRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
            placeId
          )}&fields=rating,user_ratings_total,url&language=es&key=${encodeURIComponent(apiKey)}`,
          { next: { revalidate: 3600 } }
        );
        if (detailsRes.ok) {
          const detailsJson = await detailsRes.json();
          const result = detailsJson?.result;
          if (result && typeof result.rating === 'number') {
            return NextResponse.json({
              rating: Number(result.rating.toFixed(1)),
              userRatingCount: result.user_ratings_total || null,
              googleMapsUri: result.url || defaultMapsUri,
              source: 'google_places_details',
            });
          }
        }
      }

      // Google Places API (New v1) Text Search
      const v1Res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.rating,places.userRatingCount,places.googleMapsUri',
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'es',
        }),
        next: { revalidate: 3600 },
      });

      if (v1Res.ok) {
        const v1Data = await v1Res.json();
        const place = v1Data?.places?.[0];
        if (place && typeof place.rating === 'number') {
          return NextResponse.json({
            rating: Number(place.rating.toFixed(1)),
            userRatingCount: place.userRatingCount || null,
            googleMapsUri: place.googleMapsUri || defaultMapsUri,
            source: 'google_places_v1',
          });
        }
      }

      // Fallback a Places Text Search clásico
      const textSearchRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(
          query
        )}&inputtype=textquery&fields=rating,user_ratings_total,place_id&key=${encodeURIComponent(apiKey)}`,
        { next: { revalidate: 3600 } }
      );
      if (textSearchRes.ok) {
        const tsData = await textSearchRes.json();
        const candidate = tsData?.candidates?.[0];
        if (candidate && typeof candidate.rating === 'number') {
          return NextResponse.json({
            rating: Number(candidate.rating.toFixed(1)),
            userRatingCount: candidate.user_ratings_total || null,
            googleMapsUri: candidate.place_id
              ? `https://www.google.com/maps/place/?q=place_id:${candidate.place_id}`
              : defaultMapsUri,
            source: 'google_places_find',
          });
        }
      }
    } catch (err) {
      console.warn('[google-rating] Places API warning:', err);
    }
  }

  // 2. Intento de extracción pública desde Google Maps / Search sin API Key
  try {
    const publicRes = await fetch(
      `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=es`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'es-MX,es;q=0.9',
        },
        next: { revalidate: 3600 },
      }
    );

    if (publicRes.ok) {
      const html = await publicRes.text();
      // Buscar patrón de calificación en metadatos o bloque de lugar (ej. "4.9 estrellas" o [4.9, 120])
      const ariaMatch = html.match(/([45]\.\d)\s+estrellas/i) || html.match(/aria-label="([45]\.\d)\s+estrellas/i);
      if (ariaMatch && ariaMatch[1]) {
        const parsedRating = parseFloat(ariaMatch[1]);
        if (!isNaN(parsedRating) && parsedRating >= 1 && parsedRating <= 5) {
          const countMatch = html.match(/(\d+)\s+opiniones/i) || html.match(/(\d+)\s+reseñas/i);
          return NextResponse.json({
            rating: Number(parsedRating.toFixed(1)),
            userRatingCount: countMatch ? parseInt(countMatch[1], 10) : null,
            googleMapsUri: defaultMapsUri,
            source: 'google_maps_public',
          });
        }
      }
    }
  } catch (err) {
    // Ignorar silenciosamente si Google bloquea la petición sin key
  }

  // 3. Fallback institucional seguro
  return NextResponse.json({
    rating: 4.9,
    userRatingCount: null,
    googleMapsUri: defaultMapsUri,
    source: 'fallback',
  });
}
