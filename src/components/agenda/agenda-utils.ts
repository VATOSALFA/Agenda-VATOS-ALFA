
export const getStatusColor = (status: string | undefined) => {
    switch (status) {
        case 'Reservado':
            return 'bg-blue-300/80 border-blue-500 text-blue-900';
        case 'Confirmado':
            return 'bg-yellow-300/80 border-yellow-500 text-yellow-900';
        case 'Asiste':
            return 'bg-pink-300/80 border-pink-500 text-pink-900';
        case 'No asiste':
            return 'bg-orange-300/80 border-orange-500 text-orange-900';
        case 'Pendiente': // Legacy
        case 'pending_payment':
            return 'bg-red-300/80 border-red-500 text-red-900';
        case 'Pendiente de Pago': // New standard
            return 'bg-red-300/80 border-red-500 text-red-900';
        case 'deposit_paid':
            return 'bg-orange-300/80 border-orange-500 text-orange-900';
        case 'En espera':
            return 'bg-green-300/80 border-green-500 text-green-900';
        case 'Cancelado':
            return 'bg-gray-300/80 border-gray-500 text-gray-800 line-through';
        default:
            return 'bg-gray-200/80 border-gray-500 text-gray-800';
    }
}

export const formatClientName = (nombre?: string, apellido?: string) => {
    if (!nombre) return 'Cliente Eliminado';

    const nameWords = nombre.trim().split(/\s+/).filter(Boolean);

    // Caso: El nombre ya tiene 2 o más palabras
    if (nameWords.length >= 2) {
        return `${nameWords[0]} ${nameWords[1]}`;
    }

    // Caso: El nombre solo tiene 1 palabra, intentamos usar el apellido
    if (apellido) {
        const lastNameWords = apellido.trim().split(/\s+/).filter(Boolean);
        if (lastNameWords.length > 0) {
            return `${nameWords[0]} ${lastNameWords[0]}`;
        }
    }

    // Caso: Solo hay una palabra en total
    return nameWords[0];
};
