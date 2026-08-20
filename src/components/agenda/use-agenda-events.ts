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
            .flatMap(res => {
                const [startH, startM] = res.hora_inicio.split(':').map(Number);
                const [endH, endM] = res.hora_fin.split(':').map(Number);
                const globalStart = startH + startM / 60;
                const globalEnd = endH + endM / 60;
                const globalDuration = Math.max(0.0833, globalEnd - globalStart);
                const customer = clientMap.get(res.cliente_id);

                if (!res.items || res.items.length === 0) {
                    return [{
                        ...res,
                        type: 'appointment' as const,
                        customer: customer,
                        professionalNames: 'N/A',
                        start: globalStart,
                        end: globalEnd,
                        duration: globalDuration,
                        color: getStatusColor(res.estado),
                        layout: { width: 100, left: 0, col: 0, totalCols: 1 }
                    }] as AgendaEvent[];
                }

                // Group items by professional and start time, ignoring product items
                const serviceItems = res.items.filter(item => item.tipo !== 'producto');
                const itemsToProcess = serviceItems.length > 0 ? serviceItems : res.items;

                const groupedItemsMap = new Map<string, typeof itemsToProcess>();
                itemsToProcess.forEach(item => {
                    const startKey = (item as any).hora_inicio || 'global';
                    const key = `${item.barbero_id || 'unassigned'}_${startKey}`;
                    if (!groupedItemsMap.has(key)) {
                        groupedItemsMap.set(key, []);
                    }
                    groupedItemsMap.get(key)!.push(item);
                });

                if (groupedItemsMap.size <= 1) {
                    const groupItems = groupedItemsMap.size === 1 ? Array.from(groupedItemsMap.values())[0] : res.items;
                    const primaryProfId = groupItems[0]?.barbero_id || res.barbero_id;
                    return [{
                        ...res,
                        type: 'appointment' as const,
                        customer: customer,
                        professionalNames: professionalMap.get(primaryProfId) || 'N/A',
                        target_barber_id: primaryProfId,
                        start: globalStart,
                        end: globalEnd,
                        duration: globalDuration,
                        color: getStatusColor(res.estado),
                        layout: { width: 100, left: 0, col: 0, totalCols: 1 }
                    }] as unknown as AgendaEvent[];
                }

                // Split into multiple events
                const splitEvents: AgendaEvent[] = [];
                groupedItemsMap.forEach((groupItems) => {
                    const profId = groupItems[0].barbero_id;
                    const itemStartStr = (groupItems[0] as any).hora_inicio;
                    
                    let startVal = globalStart;
                    let endVal = globalEnd;

                    if (itemStartStr) {
                        const [sh, sm] = itemStartStr.split(':').map(Number);
                        startVal = sh + sm / 60;
                        
                        const totalProfDurationMins = groupItems.reduce((acc, currentItem: any) => acc + (currentItem.duracion || 0), 0);
                        endVal = startVal + totalProfDurationMins / 60;
                    } else {
                        const totalProfDurationMins = groupItems.reduce((acc, currentItem: any) => acc + (currentItem.duracion || 0), 0);
                        const profDurationHours = totalProfDurationMins > 0 ? (totalProfDurationMins / 60) : globalDuration;
                        endVal = globalStart + profDurationHours;
                    }

                    splitEvents.push({
                        ...res,
                        type: 'appointment' as const,
                        customer: customer,
                        professionalNames: professionalMap.get(profId) || 'N/A',
                        target_barber_id: profId,
                        start: startVal,
                        end: endVal,
                        duration: Math.max(0.0833, endVal - startVal),
                        color: getStatusColor(res.estado),
                        professional_lock: groupItems.some((i: any) => i.professional_lock === true),
                        layout: { width: 100, left: 0, col: 0, totalCols: 1 }
                    } as unknown as AgendaEvent);
                });

                return splitEvents;
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
                customer: { nombre: block.motivo } as any,
                start: start,
                end: end,
                duration: Math.max(0.0833, end - start),
                color: isAvailable ? 'bg-background border-dashed border-green-500 z-10' : 'bg-striped-gray border-gray-400 text-gray-600',
                originalType: block.type,
                layout: { width: 100, left: 0, col: 0, totalCols: 1 },
                servicio: isAvailable ? 'Disponible' : 'Bloqueado'
            } as AgendaEvent;
        });

        // Valid blocks filtering: remove 'blocking' blocks if they are overridden by an 'available' block
        const validBlockEvents = mappedBlockEvents.filter(block => {
            if ((block as any).originalType === 'available') return true;

            const isOverridden = mappedBlockEvents.some(other =>
                (other as any).originalType === 'available' &&
                other.barbero_id === block.barbero_id &&
                (other.start < block.end && other.end > block.start)
            );

            return !isOverridden;
        });

        return [...appointmentEvents, ...validBlockEvents];
    }, [reservations, timeBlocks, clients, professionals]);

    const eventsWithLayout: AgendaEvent[] = useMemo(() => {
        const DEFAULT_MIN_WIDTH = 22; // 22% left strip width for a single No asiste / Cancelado

        const processedEvents: AgendaEvent[] = allEvents.map(event => {
            const isMinimized = event.type === 'appointment' && (event.estado === 'No asiste' || event.estado === 'Cancelado');
            return {
                ...event,
                layout: {
                    width: isMinimized ? DEFAULT_MIN_WIDTH : 100,
                    left: 0,
                    col: 0,
                    totalCols: 1,
                    isMinimized
                }
            };
        });

        // 1. Process and layout active (non-minimized) events for standard column width partitioning
        const activeEvents = processedEvents.filter(e => !e.layout.isMinimized);

        for (let i = 0; i < activeEvents.length; i++) {
            const eventA = activeEvents[i];
            const overlappingEvents: AgendaEvent[] = [eventA];

            for (let j = i + 1; j < activeEvents.length; j++) {
                const eventB = activeEvents[j];

                const eventAProfessionals = eventA.type === 'appointment'
                    ? ((eventA as any).target_barber_id ? [(eventA as any).target_barber_id] : (eventA.items ? eventA.items.filter((item: any) => item.tipo !== 'producto').map((item: any) => item.barbero_id) : []))
                    : [eventA.barbero_id];
                const eventBProfessionals = eventB.type === 'appointment'
                    ? ((eventB as any).target_barber_id ? [(eventB as any).target_barber_id] : (eventB.items ? eventB.items.filter((item: any) => item.tipo !== 'producto').map((item: any) => item.barbero_id) : []))
                    : [eventB.barbero_id];

                const hasCommonProfessional = eventAProfessionals.some(p => eventBProfessionals.includes(p));

                const isAAvailable = (eventA as any).originalType === 'available';
                const isBAvailable = (eventB as any).originalType === 'available';

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

        // 2. Process and layout minimized events (No asiste / Cancelado) side-by-side if multiple exist in the same slot
        const minimizedEvents = processedEvents.filter(e => e.layout.isMinimized);

        for (let i = 0; i < minimizedEvents.length; i++) {
            const minA = minimizedEvents[i];
            const overlappingMinEvents: AgendaEvent[] = [minA];

            for (let j = i + 1; j < minimizedEvents.length; j++) {
                const minB = minimizedEvents[j];

                const profsA = minA.type === 'appointment'
                    ? ((minA as any).target_barber_id ? [(minA as any).target_barber_id] : (minA.items ? minA.items.filter((item: any) => item.tipo !== 'producto').map((item: any) => item.barbero_id) : []))
                    : [minA.barbero_id];
                const profsB = minB.type === 'appointment'
                    ? ((minB as any).target_barber_id ? [(minB as any).target_barber_id] : (minB.items ? minB.items.filter((item: any) => item.tipo !== 'producto').map((item: any) => item.barbero_id) : []))
                    : [minB.barbero_id];

                const hasCommonProf = profsA.some(p => profsB.includes(p));

                if (hasCommonProf && minA.start < minB.end && minA.end > minB.start) {
                    overlappingMinEvents.push(minB);
                }
            }

            if (overlappingMinEvents.length > 1) {
                overlappingMinEvents.sort((a, b) => a.start - b.start);

                const count = overlappingMinEvents.length;
                const singleMinColWidth = count === 2 ? 15 : Math.max(10, Math.floor(36 / count));

                const columns: AgendaEvent[][] = [];
                overlappingMinEvents.forEach(event => {
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

                const totalMinCols = columns.length;
                overlappingMinEvents.forEach(event => {
                    event.layout.totalCols = totalMinCols;
                    event.layout.width = singleMinColWidth;
                    event.layout.left = event.layout.col * singleMinColWidth;
                });
            }
        }

        // 3. Adjust active events layout if they overlap with one or more minimized events in the same slot
        activeEvents.forEach(activeEvent => {
            const activeProfs = activeEvent.type === 'appointment'
                ? ((activeEvent as any).target_barber_id ? [(activeEvent as any).target_barber_id] : (activeEvent.items ? activeEvent.items.filter((item: any) => item.tipo !== 'producto').map((item: any) => item.barbero_id) : []))
                : [activeEvent.barbero_id];

            const overlappingMins = minimizedEvents.filter(minEvent => {
                const minProfs = minEvent.type === 'appointment'
                    ? ((minEvent as any).target_barber_id ? [(minEvent as any).target_barber_id] : (minEvent.items ? minEvent.items.filter((item: any) => item.tipo !== 'producto').map((item: any) => item.barbero_id) : []))
                    : [minEvent.barbero_id];

                const sameProf = activeProfs.some(p => minProfs.includes(p));
                return sameProf && activeEvent.start < minEvent.end && activeEvent.end > minEvent.start;
            });

            if (overlappingMins.length > 0) {
                const reservedLeftWidth = Math.max(...overlappingMins.map(m => m.layout.left + m.layout.width));
                const remainingWidthForActive = Math.max(20, 100 - reservedLeftWidth);

                activeEvent.layout.width = (activeEvent.layout.width * remainingWidthForActive) / 100;
                activeEvent.layout.left = reservedLeftWidth + (activeEvent.layout.left * remainingWidthForActive) / 100;
            }
        });

        return processedEvents;
    }, [allEvents]);

    return { allEvents, eventsWithLayout };
}
