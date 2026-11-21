import LandingPageClient from './page-client';
import { Metadata } from 'next';
import { getPublicLandingData, type PublicLandingData } from '@/lib/public-landing-data';

export const revalidate = 60;

export const metadata: Metadata = {
    metadataBase: new URL('https://vatosalfa.com'),
    title: 'VATOS ALFA Querétaro | Barbería Sombrerete',
    description: 'Especialistas en cortes de cabello, desvanecidos (fades), arreglos de barba y ritual de toalla caliente en Querétaro. Sucursal Sombrerete. ¡Reserva tu cita hoy!',
    alternates: {
        canonical: 'https://vatosalfa.com',
    },
    openGraph: {
        title: 'VATOS ALFA Querétaro | Barbería Sombrerete',
        description: 'Especialistas en cortes de cabello, arreglos de barba y toalla caliente en Querétaro. Visita nuestra sucursal en Sombrerete. ¡Reserva tu cita hoy!',
        url: 'https://vatosalfa.com/',
        siteName: 'VATOS ALFA Barber Shop',
        images: [
            {
                url: 'https://vatosalfa.com/logo-vatos-alfa.png',
                width: 800,
                height: 800,
                alt: 'VATOS ALFA Barber Shop',
            }
        ],
        locale: 'es_MX',
        type: 'website',
    }
};

function buildDynamicServerJsonLd(data: PublicLandingData) {
  const rawServices = Array.isArray(data.services) ? data.services : [];
  const activeServices = rawServices
    .filter((s: any) => s && s.active !== false && s.deleted !== true && Number(s.price ?? s.precio) > 0)
    .sort((a: any, b: any) => Number(a.order ?? 999) - Number(b.order ?? 999));

  const prices = activeServices.map((s: any) => Number(s.price ?? s.precio)).filter((p) => Number.isFinite(p) && p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 30;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 600;

  const findServicePrice = (keywords: string[], fallback: number) => {
    const match = activeServices.find((s: any) => {
      const name = String(s.name || s.nombre || '').toLowerCase();
      return keywords.every((kw) => name.includes(kw));
    });
    const val = Number(match?.price ?? match?.precio);
    return Number.isFinite(val) && val > 0 ? val : fallback;
  };

  const cortePrice = findServicePrice(['corte', 'cabello'], 140);
  const barbaClasicaPrice = findServicePrice(['barba', 'afeitado'], 165);
  const barbaExpressPrice = findServicePrice(['barba', 'expres'], 100);
  const paqueteCaballeroPrice = findServicePrice(['caballero', 'alfa'], 259);
  const paqueteHeroePrice = findServicePrice(['descanso'], 329);

  const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

  const offerCatalogItems = activeServices.slice(0, 18).map((s: any) => {
    const name = String(s.name || s.nombre || 'Servicio de Barbería').trim();
    const priceNum = Number(s.price ?? s.precio ?? 0);
    const desc = String(s.description || s.descripcion || `Servicio profesional de ${name} en VATOS ALFA Barber Shop Querétaro.`).trim();
    return {
      "@type": "Offer",
      "price": priceNum.toFixed(2),
      "priceCurrency": "MXN",
      "itemOffered": {
        "@type": "Service",
        "name": name,
        "description": desc
      }
    };
  });

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["BarberShop", "HairSalon", "LocalBusiness"],
        "@id": "https://vatosalfa.com/#barbershop",
        "name": "VATOS ALFA Barber Shop",
        "alternateName": ["VATOS ALFA Querétaro", "Barbería VATOS ALFA Sombrerete"],
        "description": "Barbería profesional en Santiago de Querétaro (Sucursal Sombrerete) especializada en cortes de cabello para caballero, desvanecidos (low fade, mid fade, high fade, taper fade, skin fade), diseño y arreglo de barba con ritual de toalla caliente y navaja libre, limpieza facial con vapor y paquetes VIP mediante citas puntuales sin esperas.",
        "image": "https://vatosalfa.com/logo-vatos-alfa.png",
        "logo": "https://vatosalfa.com/logo-vatos-alfa.png",
        "url": "https://vatosalfa.com",
        "telephone": "+524428727279",
        "priceRange": `$${minPrice} - $${maxPrice} MXN`,
        "currenciesAccepted": "MXN",
        "paymentAccepted": "Efectivo, Tarjeta de Crédito, Tarjeta de Débito, Transferencia SPEI, Mercado Pago",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "Av. Sombrerete 1001, Col. Cipreses",
          "addressLocality": "Santiago de Querétaro",
          "addressRegion": "QRO",
          "postalCode": "76125",
          "addressCountry": "MX"
        },
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": 20.6277,
          "longitude": -100.4184
        },
        "areaServed": [
          { "@type": "City", "name": "Santiago de Querétaro" },
          { "@type": "Place", "name": "Sombrerete, Querétaro" },
          { "@type": "Place", "name": "Colonia Cipreses, Querétaro" },
          { "@type": "Place", "name": "Loma Dorada, Querétaro" },
          { "@type": "Place", "name": "Juriquilla, Querétaro" },
          { "@type": "Place", "name": "El Refugio, Querétaro" },
          { "@type": "Place", "name": "Milenio III, Querétaro" }
        ],
        "openingHoursSpecification": [
          {
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
            "opens": "10:00",
            "closes": "20:30"
          },
          {
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": ["Sunday"],
            "opens": "10:00",
            "closes": "16:00"
          }
        ],
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.5",
          "bestRating": "5",
          "ratingCount": "102"
        },
        "potentialAction": {
          "@type": "ReserveAction",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": "https://vatosalfa.com/reservar",
            "inLanguage": "es-MX",
            "actionPlatform": [
              "http://schema.org/DesktopWebPlatform",
              "http://schema.org/MobileWebPlatform",
              "http://schema.org/IOSPlatform",
              "http://schema.org/AndroidPlatform"
            ]
          },
          "result": {
            "@type": "Reservation",
            "name": "Reserva de cita en VATOS ALFA Barber Shop"
          }
        },
        ...(offerCatalogItems.length > 0
          ? {
              "hasOfferCatalog": {
                "@type": "OfferCatalog",
                "name": "Servicios de Barbería y Paquetes VIP VATOS ALFA",
                "itemListElement": offerCatalogItems
              }
            }
          : {}),
        "sameAs": [
          "https://www.facebook.com/vatosalfa",
          "https://www.instagram.com/vatosalfa"
        ]
      },
      {
        "@type": "FAQPage",
        "@id": "https://vatosalfa.com/#faq",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "¿Cuál es la barbería recomendada en Querétaro para corte de cabello, fade y arreglo de barba?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "VATOS ALFA Barber Shop (ubicada en Av. Sombrerete 1001, Col. Cipreses, Santiago de Querétaro) es especialista en cortes de cabello para caballero, desvanecidos (low, mid, high y taper fade), arreglo de barba con ritual de toalla caliente y faciales relajantes, con sistema de citas puntuales sin tiempos de espera en https://vatosalfa.com/reservar."
            }
          },
          {
            "@type": "Question",
            "name": "¿Cuánto cuesta un corte de cabello y el arreglo de barba en VATOS ALFA Barber Shop Querétaro?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": `El corte de cabello tiene una tarifa vigente de ${fmt(cortePrice)}, el arreglo de barba express ${fmt(barbaExpressPrice)}, el ritual completo de barba con toalla caliente ${fmt(barbaClasicaPrice)}, y los paquetes VIP van desde ${fmt(paqueteCaballeroPrice)} (Paquete El Caballero Alfa: corte + barba) hasta ${fmt(paqueteHeroePrice)} (Paquete Héroe en Descanso).`
            }
          },
          {
            "@type": "Question",
            "name": "¿Cómo agendar una cita en VATOS ALFA Barber Shop y qué beneficios tiene el Pase Alfa?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Puedes agendar en segundos desde https://vatosalfa.com/reservar o en la App Móvil VATOS ALFA eligiendo tu barbero, servicio y horario exacto. Además, con el programa de lealtad Pase Alfa acumulas sellos para que tu 10.° corte de cabello sea totalmente gratis y recibes cashback en Alfa Coins en cada visita."
            }
          }
        ]
      }
    ]
  };
}

export default async function Page() {
    const initialData = await getPublicLandingData();
    const dynamicJsonLd = buildDynamicServerJsonLd(initialData);

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(dynamicJsonLd) }}
            />
            <LandingPageClient initialData={initialData} />
        </>
    );
}
