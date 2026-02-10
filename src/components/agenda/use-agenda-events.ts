
import { useMemo } from 'react';
import { Reservation, TimeBlock, Client, Profesional, AgendaEvent, SaleItem } from '@/lib/types';
import { getStatusColor } from './agenda-utils';

export function useAgendaEvents(
    reservations: Reservation[],
    timeBlocks: TimeBlock[],
    clients: Client[],
    professionals: Profesional[]
) {

    const allEvents: AgendaEvent[] = useMemo(() => {
        if (!reservations || !timeBlocks || !clients || !professionals) return [];

        const clientMap = new Map(clients.map(c => [c.id, c]));
        const professionalMap = new Map(professionals.map(p => [p.id, p.name]));

        const appointmentEvents: AgendaEvent[] = reservations
            .filter(res => res.estado !== 'Cancelado')
            .map(res => {
                const [startH, startM] = res.hora_inicio.split(':').map(Number);
                const [endH, endM] = res.hora_fin.split(':').map(Number);
                const start = startH + startM / 60;
                const end = endH + endM / 60;

                return {
                    ...res,
                    type: 'appointment' as const,
                    customer: clientMap.get(res.cliente_id),
                    professionalNames: res.items?.map((i: SaleItem) => professionalMap.get(i.barbero_id)).filter(Boolean).join(', ') || 'N/A',
                    start: start,
                    end: end,
                    duration: Math.max(0.0833, end - start),
                    color: getStatusColor(res.estado),
                    layout: { width: 100, left: 0, col: 0, totalCols: 1 }
                };
            });

        const mappedBlockEvents: AgendaEvent[] = timeBlocks.map(block => {
            const [startH, startM] = block.hora_inicio.split(':').map(Number);
            const [endH, endM] = block.hora_fin.split(':').map(Number);
            const start = startH + startM / 60;
            const end = endH + endM / 60;
            const isAvailable = block.type === 'available';

            return {
                ...block,
                type: 'block' as const,
                id: block.id,
                barbero_id: block.barbero_id,
                customer: { nombre: block.motivo } as any, // Cast to any to satisfy Client-ish usage
                // service property doesn't exist on TimeBlock but is used in rendering? Needs checking.
                // In original code: service: isAvailable ? 'Disponible' : 'Bloqueado',
                // But AgendaEvent is a union. Let's cast as necessary or update type.
                // AgendaEvent union has (TimeBlock & ...). TimeBlock doesn't have 'service'.
                // However, the original code added 'service' property.
                // We can add it to the expanding type or just let it be (if TS complains).
                // Let's stick to TS definitions. If TimeBlock doesn't have service, we shouldn't add it unless we extend the type.
                // The original type definition in `agenda-view.tsx` did not explicitly add `service`.
                // Wait, `Reservation` has `servicio`. `TimeBlock` does not.
                // If the rendering code accesses `event.servicio`, it works for Reservation.
                // If it accesses it for Block, it will be undefined unless we add it. 
                // Original code: service: isAvailable ? 'Disponible' : 'Bloqueado',
                // We will add it via type assertion to AgendaEvent which is intersection.
                start: start,
                end: end,
                duration: Math.max(0.0833, end - start),
                color: isAvailable ? 'bg-background border-dashed border-green-500 z-10' : 'bg-striped-gray border-gray-400 text-gray-600',
                originalType: block.type,
                layout: { width: 100, left: 0, col: 0, totalCols: 1 },
                servicio: isAvailable ? 'Disponible' : 'Bloqueado' // Added to match logic
            } as AgendaEvent;
        });

        // Valid blocks filtering: remove 'blocking' blocks if they are overlapped by an 'available' block
        const validBlockEvents = mappedBlockEvents.filter(block => {
            if ((block as any).originalType === 'available') return true;

            // Check if this blocking block is overridden by an available block
            const isOverridden = mappedBlockEvents.some(other =>
                (other as any).originalType === 'available' &&
                other.barbero_id === block.barbero_id &&
                // Check overlap
                (other.start < block.end && other.end > block.start)
            );

            return !isOverridden;
        });

        return [...appointmentEvents, ...validBlockEvents];
    }, [reservations, timeBlocks, clients, professionals]);

    const eventsWithLayout: AgendaEvent[] = useMemo(() => {
        const processedEvents: AgendaEvent[] = allEvents.map(event => ({ ...event, layout: { width: 100, left: 0, col: 0, totalCols: 1 } }));

        for (let i = 0; i < processedEvents.length; i++) {
            const eventA = processedEvents[i];

            const overlappingEvents: AgendaEvent[] = [eventA];

            for (let j = i + 1; j < processedEvents.length; j++) {
                const eventB = processedEvents[j];

                const eventAProfessionals = eventA.type === 'appointment' && eventA.items ? eventA.items.map((item) => item.barbero_id) : [eventA.barbero_id];
                const eventBProfessionals = eventB.type === 'appointment' && eventB.items ? eventB.items.map((item) => item.barbero_id) : [eventB.barbero_id];

                const hasCommonProfessional = eventAProfessionals.some(p => eventBProfessionals.includes(p));

                const isAAvailable = (eventA as any).originalType === 'available';
                const isBAvailable = (eventB as any).originalType === 'available';
                const eitherIsAvailable = isAAvailable || isBAvailable;

                const ignoreCollision = (eventA.type === 'appointment' && isBAvailable) ||
                    (eventB.type === 'appointment' && isAAvailable);

                if (!ignoreCollision && hasCommonProfessional && eventA.start < eventB.end && eventA.end > eventB.start) {
                    overlappingEvents.push(eventB);
                }
            }

            if (overlappingEvents.length > 1) {
                overlappingEvents.sort((a, b) => a.start - b.start);

                const columns: AgendaEvent[][] = [];
                overlappingEvents.forEach(event => {
                    let placed = false;
                    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                        const lastEventInColumn = columns[colIndex][columns[colIndex].length - 1];
                        if (event.start >= lastEventInColumn.end) {
                            columns[colIndex].push(event);
                            event.layout.col = colIndex;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) {
                        columns.push([event]);
                        event.layout.col = columns.length - 1;
                    }
                });

                const totalCols = columns.length;
                overlappingEvents.forEach(event => {
                    event.layout.totalCols = totalCols;
                    event.layout.width = 100 / totalCols;
                    event.layout.left = event.layout.col * event.layout.width;
                });
            }
        }
        return processedEvents;
    }, [allEvents]);

    return { allEvents, eventsWithLayout };
}
