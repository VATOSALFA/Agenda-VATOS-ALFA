import LandingPageClient from './page-client';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Vatos Alfa | La Mejor Barbería en Querétaro (Sombrerete)',
    description: 'Especialistas en cortes de cabello, arreglos de barba y toalla caliente en Querétaro. Visita nuestra sucursal en Sombrerete. ¡Reserva tu cita hoy!',
    openGraph: {
        title: 'Vatos Alfa | La Mejor Barbería en Querétaro (Sombrerete)',
        description: 'Especialistas en cortes de cabello, arreglos de barba y toalla caliente en Querétaro. Visita nuestra sucursal en Sombrerete. ¡Reserva tu cita hoy!',
        url: 'https://vatosalfa.com/',
        siteName: 'VATOS ALFA Barber Shop',
        images: [
            {
                url: 'https://www.vatosalfa.com/logo-vatos-alfa.png',
                width: 800,
                height: 800,
                alt: 'VATOS ALFA Barber Shop',
            }
        ],
        locale: 'es_MX',
        type: 'website',
    }
};

export default function Page() {
    return <LandingPageClient />;
}
