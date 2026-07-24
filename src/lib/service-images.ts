export const getServiceLocalImage = (serviceName?: string, remoteImages?: string[]): string | null => {
    if (!serviceName) {
        return (remoteImages && remoteImages.length > 0) ? remoteImages[0] : null;
    }
    
    const cleanName = serviceName.toLowerCase().trim();
    
    if (cleanName.includes('corte de cabello') || cleanName.includes('corte de pelo')) {
        return '/services/corte-de-cabello.webp';
    }
    if (cleanName.includes('lavado de cabello') || cleanName.includes('lavado de pelo')) {
        return '/services/lavado-de-cabello.webp';
    }
    if (cleanName.includes('depilación') || cleanName.includes('depilacion') || cleanName.includes('cera')) {
        return '/services/depilacion-de-ceja-con-cera.webp';
    }
    if (cleanName.includes('arreglo de ceja') || cleanName.includes('ceja')) {
        return '/services/arreglo-de-ceja.webp';
    }
    if (cleanName.includes('afeitado clásico') || cleanName.includes('afeitado clasico') || (cleanName.includes('barba') && cleanName.includes('toalla')) || cleanName.includes('arreglo de barba, afeitado')) {
        return '/services/arreglo-de-barba-afeitado-clasico.webp';
    }
    if (cleanName.includes('expres') || cleanName.includes('express')) {
        return '/services/arreglo-de-barba-expres.webp';
    }
    if (cleanName.includes('barba')) {
        return '/services/arreglo-de-barba-afeitado-clasico.webp';
    }
    if (cleanName.includes('grecas')) {
        return '/services/grecas.webp';
    }
    if (cleanName.includes('facial') || cleanName.includes('masageador') || cleanName.includes('masajeador')) {
        return '/services/facial-completo-con-masageador.webp';
    }

    // Fallback to remote image URL from Firestore if provided
    if (remoteImages && remoteImages.length > 0) {
        return remoteImages[0];
    }
    return null;
};
