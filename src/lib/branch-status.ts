export interface BranchOperationalStatus {
    isOpen: boolean;
    statusLabel: string;
    actionLabel: string;
    fullBadgeText: string;
    nextOpenText?: string;
}

export function formatTime12h(timeStr?: string): string {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const minStr = m < 10 ? `0${m}` : `${m}`;
    return `${hour12}:${minStr} ${period}`;
}

export function parseTimeToMinutes(timeStr?: string): number {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

const DAYS_OF_WEEK = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DAY_LABELS: Record<string, string> = {
    domingo: 'Domingo',
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
};

export function getBranchOperationalStatus(local: any, now: Date = new Date()): BranchOperationalStatus {
    if (!local || !local.schedule) {
        return {
            isOpen: false,
            statusLabel: 'Horario no disponible',
            actionLabel: 'Consultar sucursal',
            fullBadgeText: 'Horario no disponible',
        };
    }

    const timeZone = local.timezone || 'America/Mexico_City';
    let nowInZone: Date;
    try {
        nowInZone = new Date(now.toLocaleString('en-US', { timeZone }));
    } catch {
        nowInZone = now;
    }

    const dayIndex = nowInZone.getDay();
    const currentMinutes = nowInZone.getHours() * 60 + nowInZone.getMinutes();
    const todayKey = DAYS_OF_WEEK[dayIndex];
    const todaySchedule = local.schedule[todayKey];

    const findNextOpenDay = () => {
        for (let offset = 1; offset <= 7; offset++) {
            const idx = (dayIndex + offset) % 7;
            const key = DAYS_OF_WEEK[idx];
            const sched = local.schedule[key];
            if (sched && sched.enabled && sched.start) {
                return {
                    isTomorrow: offset === 1,
                    dayLabel: DAY_LABELS[key],
                    start12h: formatTime12h(sched.start),
                };
            }
        }
        return null;
    };

    // Caso 1: Hoy está habilitado
    if (todaySchedule && todaySchedule.enabled && todaySchedule.start && todaySchedule.end) {
        const startMins = parseTimeToMinutes(todaySchedule.start);
        const endMins = parseTimeToMinutes(todaySchedule.end);

        // Aún no abre hoy
        if (currentMinutes < startMins) {
            const openTime = formatTime12h(todaySchedule.start);
            return {
                isOpen: false,
                statusLabel: 'Cerrado',
                actionLabel: `Abre a las ${openTime}`,
                fullBadgeText: `Cerrado • Abre a las ${openTime}`,
            };
        }

        // Abierto en este momento
        if (currentMinutes >= startMins && currentMinutes < endMins) {
            const closeTime = formatTime12h(todaySchedule.end);
            return {
                isOpen: true,
                statusLabel: 'Abierto Ahora',
                actionLabel: `Cierra a las ${closeTime}`,
                fullBadgeText: `Abierto Ahora • Cierra a las ${closeTime}`,
            };
        }

        // Ya cerró hoy
        const nextOpen = findNextOpenDay();
        if (nextOpen) {
            const nextWhen = nextOpen.isTomorrow
                ? `Abre mañana a las ${nextOpen.start12h}`
                : `Abre el ${nextOpen.dayLabel} a las ${nextOpen.start12h}`;
            return {
                isOpen: false,
                statusLabel: 'Cerrado',
                actionLabel: nextWhen,
                fullBadgeText: `Cerrado • ${nextWhen}`,
            };
        }
    }

    // Caso 2: Hoy no abre o no tiene horario configurado
    const nextOpen = findNextOpenDay();
    if (nextOpen) {
        const nextWhen = nextOpen.isTomorrow
            ? `Abre mañana a las ${nextOpen.start12h}`
            : `Abre el ${nextOpen.dayLabel} a las ${nextOpen.start12h}`;
        return {
            isOpen: false,
            statusLabel: 'Cerrado',
            actionLabel: nextWhen,
            fullBadgeText: `Cerrado • ${nextWhen}`,
        };
    }

    return {
        isOpen: false,
        statusLabel: 'Cerrado',
        actionLabel: 'Horario especial',
        fullBadgeText: 'Cerrado hoy',
    };
}
