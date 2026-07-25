import { Metadata } from 'next';
import BlogClientPage from './blog-client';

export const metadata: Metadata = {
    title: 'Blog de Barbería y Cuidado Masculino en Querétaro | VATOS ALFA',
    description: 'Consejos de expertos en barbería, tendencias de cortes de cabello masculino en Querétaro, guías para el cuidado de la barba en clima seco y tips de bienestar.',
    keywords: [
        'blog barberia queretaro',
        'cortes de cabello hombre queretaro',
        'cuidado de barba queretaro',
        'barber shop sombrerete',
        'tendencias cortes masculino 2026'
    ],
    alternates: {
        canonical: 'https://vatosalfa.com/blog',
    },
    openGraph: {
        title: 'Blog de Barbería y Cuidado Masculino en Querétaro | VATOS ALFA',
        description: 'Consejos de expertos en barbería, tendencias de cortes de cabello masculino en Querétaro y guías para el cuidado de la barba.',
        url: 'https://vatosalfa.com/blog',
        siteName: 'VATOS ALFA Barber Shop',
        type: 'website',
    },
};

export default function BlogLandingPage() {
    return <BlogClientPage />;
}
