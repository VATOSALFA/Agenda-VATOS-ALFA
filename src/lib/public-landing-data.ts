import { cache } from 'react';
import { getDb } from '@/lib/firebase-server';
import type { TemaTemporadaId, TemporadaAppConfig } from '@/components/shared/seasonal-effects-web-overlay';

export interface PublicLandingData {
  fetchedOnServer: boolean;
  services: any[];
  professionals: any[];
  products: any[];
  empresa: any[];
  locales: any[];
  settingsData: any[];
  categories: any[];
  promotions: any[];
  cortesReales: any[];
  paseAlfaConfig: any | null;
}

export interface ServerCompanyBootstrap {
  name: string;
  description: string;
  icon_url: string | null;
  theme: Record<string, any> | null;
}

/**
 * Recursively converts Firestore Admin SDK types (Timestamp, GeoPoint, DocumentReference, Date)
 * into plain JSON-serializable values safe to pass from Server Components to Client Components.
 */
export function toPlainSerializable(value: any): any {
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  // Firestore Timestamp duck-typing
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }

  // Firestore DocumentReference duck-typing
  if (typeof value.path === 'string' && typeof value.id === 'string' && value.firestore) {
    return value.path;
  }

  // Firestore GeoPoint duck-typing
  if (
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    Object.keys(value).length <= 3
  ) {
    return { latitude: value.latitude, longitude: value.longitude };
  }

  if (Array.isArray(value)) {
    return value.map((item) => toPlainSerializable(item));
  }

  if (t === 'object') {
    if (value instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))) {
      return undefined;
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || typeof v === 'function') continue;
      const serialized = toPlainSerializable(v);
      if (serialized !== undefined) {
        out[k] = serialized;
      }
    }
    return out;
  }

  return undefined;
}

function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      out[key] = val;
    }
  }
  return out as Partial<T>;
}

function projectCortesReales(items: any[]): any[] {
  return items
    .filter((item: any) => item && item.activo !== false && item.mostrarEnWeb !== false)
    .map((item: any) =>
      stripUndefined({
        id: item.id,
        titulo: item.titulo,
        imagenUrl: item.imagenUrl,
        serviceMatchId: item.serviceMatchId,
      })
    );
}

function projectPaseAlfaConfig(raw: any): any | null {
  if (!raw || typeof raw !== 'object') return null;

  const rawPrivs = Array.isArray(raw.beneficios_detallados)
    ? raw.beneficios_detallados
    : Array.isArray(raw.privilegios)
      ? raw.privilegios
      : [];

  const projectedBeneficios = rawPrivs
    .filter((p: any) => p && p.activo !== false && p.mostrarEnWeb !== false)
    .map((p: any) =>
      stripUndefined({
        id: p.id,
        tag: p.tag,
        discount: p.discount,
        titulo: p.titulo,
        descripcion: p.descripcion,
        recompensa: p.recompensa,
        fechaLimite: p.fechaLimite,
        terminos: p.terminos,
        imagenUrl: p.imagenUrl,
        ctaText: p.ctaText,
        proximamente: p.proximamente,
        activo: true,
        mostrarEnWeb: true,
      })
    );

  const hasNivelesCard = projectedBeneficios.some(
    (b: any) =>
      b.id === 'niveles_pase_alfa' ||
      (b.titulo || '').toUpperCase().includes('NIVELES PASE ALFA')
  );

  let nivelesConfig: any | undefined;
  if (raw.niveles_config && typeof raw.niveles_config === 'object') {
    nivelesConfig = hasNivelesCard
      ? stripUndefined({ activo: raw.niveles_config.activo })
      : stripUndefined({
          activo: raw.niveles_config.activo,
          titulo_tarjeta: raw.niveles_config.titulo_tarjeta,
          descripcion_tarjeta: raw.niveles_config.descripcion_tarjeta,
          terminos: raw.niveles_config.terminos,
          imagenUrl: raw.niveles_config.imagenUrl,
        });
  }

  return stripUndefined({
    activo: raw.activo,
    mostrar_en_web: raw.mostrar_en_web,
    titulo: raw.titulo,
    subtitulo: raw.subtitulo,
    instrucciones: raw.instrucciones,
    recompensa: raw.recompensa,
    sellosRequeridos: raw.sellosRequeridos,
    terminos: raw.terminos,
    imagenUrl: raw.imagenUrl,
    play_store_url: raw.play_store_url,
    app_store_url: raw.app_store_url,
    ...(projectedBeneficios.length > 0 ? { beneficios_detallados: projectedBeneficios } : {}),
    ...(nivelesConfig && Object.keys(nivelesConfig).length > 0 ? { niveles_config: nivelesConfig } : {}),
  });
}

export const getServerCompanyBootstrap = cache(async (): Promise<ServerCompanyBootstrap> => {
  const fallback: ServerCompanyBootstrap = {
    name: 'VATOS ALFA Barber Shop',
    description: 'Agenda tu cita con los mejores profesionales.',
    icon_url: null,
    theme: null,
  };

  try {
    const db = getDb();
    const snapshot = await db.collection('empresa').limit(1).get();
    if (snapshot.empty) return fallback;

    const raw = toPlainSerializable(snapshot.docs[0].data()) || {};
    return {
      name: raw.name || fallback.name,
      description: raw.description || fallback.description,
      icon_url: raw.icon_url || null,
      theme: raw.theme || null,
    };
  } catch (error) {
    console.warn('[public-landing-data] Company bootstrap fetch failed (using default):', error);
    return fallback;
  }
});

export const getServerSeasonalConfig = cache(async (): Promise<TemporadaAppConfig | null> => {
  try {
    const db = getDb();
    const snap = await db.collection('configuracion').doc('app_movil').get();
    if (!snap.exists) return null;

    const data = toPlainSerializable(snap.data());
    const raw = data?.temporada_config || data?.pase_alfa?.temporada_config;
    if (!raw) return null;

    const savedTheme: TemaTemporadaId =
      raw.temaForzado === 'buen_fin' || raw.temaForzado === 'aniversario'
        ? 'halloween'
        : raw.temaForzado || 'halloween';

    return {
      activo: raw.activo !== undefined ? Boolean(raw.activo) : true,
      mostrarEnApp: raw.mostrarEnApp !== undefined ? Boolean(raw.mostrarEnApp) : true,
      mostrarEnWeb: raw.mostrarEnWeb !== undefined ? Boolean(raw.mostrarEnWeb) : true,
      mostrarEnAgenda: raw.mostrarEnAgenda !== undefined ? Boolean(raw.mostrarEnAgenda) : true,
      modo: raw.modo === 'manual' ? 'manual' : 'automatico',
      temaForzado: savedTheme,
      intensidad: raw.intensidad === 'normal' ? 'normal' : 'sutil',
    };
  } catch (error) {
    console.warn('[public-landing-data] Seasonal config fetch failed:', error);
    return null;
  }
});

const EMPTY_LANDING_DATA: PublicLandingData = {
  fetchedOnServer: false,
  services: [],
  professionals: [],
  products: [],
  empresa: [],
  locales: [],
  settingsData: [],
  categories: [],
  promotions: [],
  cortesReales: [],
  paseAlfaConfig: null,
};

export const getPublicLandingData = cache(async (): Promise<PublicLandingData> => {
  try {
    const db = getDb();

    const [
      serviciosRes,
      profesionalesRes,
      productosRes,
      empresaRes,
      localesRes,
      websiteSettingsRes,
      categoriasRes,
      promocionesRes,
      appMovilRes,
      paseAlfaRes,
      inspiracionRes,
    ] = await Promise.allSettled([
      db.collection('servicios').get(),
      db.collection('profesionales').get(),
      db.collection('productos').get(),
      db.collection('empresa').limit(1).get(),
      db.collection('locales').get(),
      db.collection('settings').doc('website').get(),
      db.collection('categorias_servicios').get(),
      db.collection('promociones').get(),
      db.collection('configuracion').doc('app_movil').get(),
      db.collection('configuracion').doc('pase_alfa').get(),
      db.collection('configuracion').doc('inspiracion_alfa').get(),
    ]);

    const services =
      serviciosRes.status === 'fulfilled'
        ? serviciosRes.value.docs
            .map((d) => ({ id: d.id, data: toPlainSerializable(d.data()) || {} }))
            .filter(({ data: s }) => s.active === true && s.visible_en_web !== false)
            .map(({ id, data: s }) =>
              stripUndefined({
                id,
                name: s.name,
                price: s.price,
                duration: s.duration,
                duracion: s.duracion,
                category: s.category,
                description: s.description,
                order: s.order,
                active: true,
                visible_en_web: true,
                images: s.images,
                ...(s.payment_type === 'online-deposit'
                  ? {
                      payment_type: s.payment_type,
                      payment_amount_type: s.payment_amount_type,
                      payment_amount_value: s.payment_amount_value,
                    }
                  : {}),
              })
            )
        : [];

    // Filter and project professionals strictly to active online-bookable public catalog fields
    const professionals =
      profesionalesRes.status === 'fulfilled'
        ? profesionalesRes.value.docs
            .map((d) => ({ id: d.id, data: toPlainSerializable(d.data()) || {} }))
            .filter(({ data: p }) => p.active === true && !p.deleted && p.acceptsOnline === true)
            .map(({ id, data: p }) =>
              stripUndefined({
                id,
                name: p.name ?? null,
                publicName: p.publicName ?? null,
                avatarUrl: p.avatarUrl ?? null,
                biography: p.biography ?? null,
                bio: p.bio ?? null,
                rating: p.rating ?? null,
                specialties: p.specialties ?? null,
                active: true,
                deleted: false,
                acceptsOnline: true,
                local_id: p.local_id ?? null,
                order: p.order ?? null,
              })
            )
        : [];

    const products =
      productosRes.status === 'fulfilled'
        ? productosRes.value.docs
            .map((d) => ({ id: d.id, data: toPlainSerializable(d.data()) || {} }))
            .filter(({ data: p }) => p.active === true && Number(p.stock) > 0 && p.visible_en_web !== false)
            .map(({ id, data: p }) =>
              stripUndefined({
                id,
                nombre: p.nombre,
                public_price: p.public_price,
                stock: p.stock,
                description: p.description,
                images: p.images,
                active: true,
                visible_en_web: true,
                order: p.order,
                ...(p.payment_type === 'deposit'
                  ? {
                      payment_type: p.payment_type,
                      payment_amount_type: p.payment_amount_type,
                      payment_amount_value: p.payment_amount_value,
                    }
                  : {}),
              })
            )
        : [];

    const empresa =
      empresaRes.status === 'fulfilled'
        ? empresaRes.value.docs.map((d) => {
            const e = toPlainSerializable(d.data()) || {};
            return stripUndefined({
              id: d.id,
              name: e.name,
              slogan: e.slogan,
              description: e.description,
              logo_url: e.logo_url,
              icon_url: e.icon_url,
              phone: e.phone,
            });
          })
        : [];

    const locales =
      localesRes.status === 'fulfilled'
        ? localesRes.value.docs
            .map((d) => ({ id: d.id, data: toPlainSerializable(d.data()) || {} }))
            .filter(({ data: l }) => l.status === 'active')
            .map(({ id, data: l }) =>
              stripUndefined({
                id,
                name: l.name,
                address: l.address,
                phone: l.phone,
                timezone: l.timezone,
                status: 'active',
                schedule: l.schedule,
                googleRating: l.googleRating,
                googleReviewCount: l.googleReviewCount,
                googleMapsUri: l.googleMapsUri,
                placeId: l.placeId,
                google_place_id: l.google_place_id,
              })
            )
        : [];

    let settingsData: any[] = [];
    if (websiteSettingsRes.status === 'fulfilled' && websiteSettingsRes.value.exists) {
      const w = toPlainSerializable(websiteSettingsRes.value.data()) || {};
      settingsData = [
        stripUndefined({
          id: 'website',
          slogan: w.slogan,
          heroDescription: w.heroDescription,
          description: w.description,
          onlineReservations: w.onlineReservations,
          privacyPolicyEnabled: w.privacyPolicyEnabled,
          showAppDownload: w.showAppDownload,
          playStoreUrl: w.playStoreUrl,
          appStoreUrl: w.appStoreUrl,
          googleRating: w.googleRating,
          googleReviewCount: w.googleReviewCount,
          googlePlaceId: w.googlePlaceId,
        }),
      ];
    }

    const categories =
      categoriasRes.status === 'fulfilled'
        ? categoriasRes.value.docs.map((d) => {
            const c = toPlainSerializable(d.data()) || {};
            return {
              id: d.id,
              name: c.name ?? '',
            };
          })
        : [];

    const promotions =
      promocionesRes.status === 'fulfilled'
        ? promocionesRes.value.docs
            .map((d) => ({ id: d.id, data: toPlainSerializable(d.data()) || {} }))
            .filter(({ data: p }) => p.active === true && p.mostrarEnWeb !== false)
            .map(({ id, data: p }) =>
              stripUndefined({
                id,
                name: p.name,
                titulo: p.titulo,
                description: p.description,
                descripcion: p.descripcion,
                imageUrl: p.imageUrl,
                imagenUrl: p.imagenUrl,
                startDate: p.startDate,
                endDate: p.endDate,
                termsAndConditions: p.termsAndConditions,
                terminos: p.terminos,
                active: true,
                mostrarEnWeb: p.mostrarEnWeb,
                es_pase_alfa: p.es_pase_alfa,
                code: p.code,
                discount: p.discount,
              })
            )
        : [];

    let cortesReales: any[] = [];
    let cortesResolved = false;
    let rawPaseAlfa: any | null = null;

    const appData =
      appMovilRes.status === 'fulfilled' && appMovilRes.value.exists
        ? toPlainSerializable(appMovilRes.value.data())
        : null;

    if (appData) {
      if (Array.isArray(appData.inspiracion_alfa_web)) {
        cortesReales = projectCortesReales(appData.inspiracion_alfa_web);
        cortesResolved = true;
      } else if (Array.isArray(appData.inspiracion_alfa) && appData.inspiracion_alfa.length > 0) {
        const projected = projectCortesReales(appData.inspiracion_alfa);
        if (projected.length > 0) {
          cortesReales = projected;
          cortesResolved = true;
        }
      }

      if (appData.pase_alfa) {
        rawPaseAlfa = appData.pase_alfa;
      }
    }

    if (paseAlfaRes.status === 'fulfilled' && paseAlfaRes.value.exists) {
      rawPaseAlfa = toPlainSerializable(paseAlfaRes.value.data());
    }

    const paseAlfaConfig = projectPaseAlfaConfig(rawPaseAlfa);

    if (!cortesResolved && inspiracionRes.status === 'fulfilled' && inspiracionRes.value.exists) {
      const inspData = toPlainSerializable(inspiracionRes.value.data());
      if (Array.isArray(inspData?.items) && inspData.items.length > 0) {
        cortesReales = projectCortesReales(inspData.items);
      }
    }

    const fetchedOnServer =
      serviciosRes.status === 'fulfilled' &&
      profesionalesRes.status === 'fulfilled' &&
      empresaRes.status === 'fulfilled';

    return {
      fetchedOnServer,
      services,
      professionals,
      products,
      empresa,
      locales,
      settingsData,
      categories,
      promotions,
      cortesReales,
      paseAlfaConfig,
    };
  } catch (error) {
    console.warn('[public-landing-data] Error fetching public landing data on server:', error);
    return EMPTY_LANDING_DATA;
  }
});
