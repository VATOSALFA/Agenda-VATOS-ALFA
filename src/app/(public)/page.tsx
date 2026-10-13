import LandingPageClient from './page-client';
import { Metadata } from 'next';

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

const serverJsonLd = {
  "@context": "https://schema.org",
  "@type": "HairSalon",
  "name": "VATOS ALFA Barber Shop",
  "image": "https://vatosalfa.com/logo-vatos-alfa.png", 
  "url": "https://vatosalfa.com",
  "telephone": "+524428727279",
  "priceRange": "$$",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Av. Sombrerete 1001 Col. Cipreses",
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
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
      ],
      "opens": "10:00",
      "closes": "20:00"
    }
  ],
  "sameAs": [
    "https://www.facebook.com/vatosalfa",
    "https://www.instagram.com/vatosalfa"
  ]
};

export default function Page() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(serverJsonLd) }}
            />
            <LandingPageClient />
        </>
    );
}

