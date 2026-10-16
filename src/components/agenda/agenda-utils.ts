
export const getStatusColor = (status: string | undefined) => {
    switch (status) {
        case 'Reservado':
            return 'bg-blue-300/80 border-blue-500 text-blue-900';
        case 'Confirmado':
        case 'deposit_paid':
        case 'anticipo_pagado':
            return 'bg-yellow-300/80 border-yellow-500 text-yellow-900';
        case 'Asiste':
            return 'bg-pink-300/80 border-pink-500 text-pink-900';
        case 'No asiste':
            return 'bg-orange-300/80 border-orange-500 text-orange-900';
        case 'Pendiente': // Legacy
        case 'pending_payment':
        case 'Pendiente de Pago': // New standard
        case 'Pendiente de pago':
        case 'pendiente de pago':
            return 'bg-red-300/80 border-red-500 text-red-900';
        case 'En espera':
            return 'bg-green-300/80 border-green-500 text-green-900';
        case 'Cancelado':
            return 'bg-gray-300/80 border-gray-500 text-gray-800 line-through';
        default:
            return 'bg-gray-200/80 border-gray-500 text-gray-800';
    }
}

export const formatClientName = (nombre?: string, apellido?: string, fallback?: string) => {
    const rawFirst = (nombre || '').trim();
    const rawLast = (apellido || '').trim();

    if (!rawFirst && !rawLast) {
        return fallback !== undefined ? fallback : 'Cargando datos...';
    }

    const nameWords = rawFirst ? rawFirst.split(/\s+/).filter(Boolean) : [];
    const lastNameWords = rawLast ? rawLast.split(/\s+/).filter(Boolean) : [];

    // Caso: El nombre ya tiene 2 o más palabras
    if (nameWords.length >= 2) {
        return `${nameWords[0]} ${nameWords[1]}`;
    }

    // Caso: El nombre solo tiene 1 palabra, intentamos usar el apellido
    if (nameWords.length === 1 && lastNameWords.length > 0) {
        return `${nameWords[0]} ${lastNameWords[0]}`;
    }

    // Caso: Solo hay una palabra en el nombre
    if (nameWords.length === 1) {
        return nameWords[0];
    }

    // Caso: No hubo nombre, pero hay apellido con 2 o más palabras
    if (lastNameWords.length >= 2) {
        return `${lastNameWords[0]} ${lastNameWords[1]}`;
    }

    // Caso: Solo una palabra en el apellido o fallback
    return lastNameWords[0] || (fallback !== undefined ? fallback : 'Cliente');
};

