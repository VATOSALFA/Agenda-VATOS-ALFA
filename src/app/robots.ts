import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/admin/', '/api/', '/settings/', '/sales/'],
        },
        sitemap: 'https://vatosalfa.com/sitemap.xml',
    };
}
