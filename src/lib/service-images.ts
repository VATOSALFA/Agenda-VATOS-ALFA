// Helper para determinar si una URL corresponde a las imágenes iniciales por defecto de Firebase Storage (julio 2026)
const isOldDefaultSeedImage = (url?: string): boolean => {
    if (!url) return false;
    return url.includes('1784915') || url.includes('1784922');
};

export const getServiceLocalImage = (serviceName?: string, remoteImages?: string[]): string | null => {
    // Si el usuario subió una imagen personalizada desde la configuración (no es el seed viejo), priorizar siempre la imagen remota
    if (remoteImages && remoteImages.length > 0 && remoteImages[0]) {
        if (!isOldDefaultSeedImage(remoteImages[0])) {
            return remoteImages[0];
        }
    }

    if (!serviceName) {
        return (remoteImages && remoteImages.length > 0) ? remoteImages[0] : null;
    }
    
    const cleanName = serviceName.toLowerCase().trim();

    // 1. Depilación nasal / nariz (subida desde configuración o asset local específico)
    if (cleanName.includes('nasal') || cleanName.includes('nariz')) {
        if (remoteImages && remoteImages.length > 0 && remoteImages[0]) {
            return remoteImages[0];
        }
        return '/services/depilacion-nasal.webp';
    }
    
    // 2. Cortes y lavados
    if (cleanName.includes('corte de cabello') || cleanName.includes('corte de pelo')) {
        return '/services/corte-de-cabello.webp';
    }
    if (cleanName.includes('lavado de cabello') || cleanName.includes('lavado de pelo')) {
        return '/services/lavado-de-cabello.webp';
    }

    // 3. Depilación de ceja con cera (solo si incluye ceja/cejas)
    if ((cleanName.includes('depilación') || cleanName.includes('depilacion') || cleanName.includes('cera')) && (cleanName.includes('ceja') || cleanName.includes('cejas'))) {
        return (remoteImages && remoteImages.length > 0 && remoteImages[0]) ? remoteImages[0] : '/services/depilacion-de-ceja-con-cera.webp';
    }
    if (cleanName.includes('arreglo de ceja') || cleanName.includes('ceja')) {
        return '/services/arreglo-de-ceja.webp';
    }

    // 4. Barba
    if (cleanName.includes('afeitado clásico') || cleanName.includes('afeitado clasico') || (cleanName.includes('barba') && cleanName.includes('toalla')) || cleanName.includes('arreglo de barba, afeitado')) {
        return '/services/arreglo-de-barba-afeitado-clasico.webp';
    }
    if (cleanName.includes('expres') || cleanName.includes('express')) {
        return '/services/arreglo-de-barba-expres.webp';
    }
    if (cleanName.includes('barba')) {
        return '/services/arreglo-de-barba-afeitado-clasico.webp';
    }

    // 5. Diseños y faciales
    if (cleanName.includes('grecas')) {
        return '/services/grecas.webp';
    }
    if (cleanName.includes('facial') || cleanName.includes('masageador') || cleanName.includes('masajeador')) {
        return '/services/facial-completo-con-masageador.webp';
    }

    // Fallback general a URL remota de Firestore si existe
    if (remoteImages && remoteImages.length > 0 && remoteImages[0]) {
        return remoteImages[0];
    }
    return null;
};
