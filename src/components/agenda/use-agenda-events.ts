import { useMemo, useState, useEffect } from 'react';
import { Reservation, TimeBlock, Client, Profesional, AgendaEvent, SaleItem } from '@/lib/types';
import { getStatusColor } from './agenda-utils';
import { getPendingDepositTiming } from '@/lib/booking-rules';

export function useAgendaEvents(
    reservations: Reservation[],
    timeBlocks: TimeBlock[],
    clients: Client[],
    professionals: Profesional[]
) {
    const [nowMs, setNowMs] = useState<number>(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => {
            setNowMs(Date.now());
        }, 15000);
        return () => clearInterval(timer);
    }, []);

    const allEvents: AgendaEvent[] = useMemo(() => {
        if (!reservations || !timeBlocks || !clients || !professionals) return [];

        const clientMap = new Map(clients.map(c => [c.id, c]));
        const professionalMap = new Map(professionals.map(p => [p.id, p.publicName || p.name]));

        const appointmentEvents: AgendaEvent[] = reservations
            .filter(res => Boolean(res && res.hora_inicio))
            .flatMap(res => {
                const [startH = 0, startM = 0] = (res.hora_inicio || '00:00').split(':').map(Number);
                let endH = startH;
                let endM = startM + 30;
                if (res.hora_fin) {
                    const [eh = 0, em = 0] = res.hora_fin.split(':').map(Number);
                    endH = eh;
                    endM = em;
                } else if ((res as any).duracion || res.duration) {
                    const dur = Number((res as any).duracion || res.duration);
                    const totalMins = startH * 60 + startM + dur;
                    endH = Math.floor(totalMins / 60);
                    endM = totalMins % 60;
                }
                const globalStart = startH + startM / 60;
                const globalEnd = endH + endM / 60;
                const globalDuration = Math.max(0.0833, globalEnd - globalStart);
                const baseCustomer = (res as any).isSandbox
                    ? ((res as any).customer || clientMap.get(res.cliente_id))
                    : (clientMap.get(res.cliente_id) || (res as any).customer);
                const customer = baseCustomer || ((res as any).cliente_nombre ? {
                    id: res.cliente_id || 'sandbox-client',
                    nombre: (res as any).cliente_nombre,
                    telefono: (res as any).cliente_telefono || '',
                    correo: (res as any).cliente_email || ''
                } as unknown as Client : undefined);

                const rawEventDepositPaid = Number(
                    res.anticipo_pagado ||
                    (res as any).anticipoPagado ||
                    (res as any).monto_pagado_real ||
                    (res as any).monto_pagado ||
                    0
                );
                const isDepositPaid = Boolean(
                    (rawEventDepositPaid > 0 || res.pago_estado === 'deposit_paid' || res.pago_estado === 'anticipo_pagado') &&
                    res.pago_estado !== 'pendiente_anticipo' &&
                    res.pago_estado !== 'pending_payment' &&
                    res.pago_estado !== 'Pendiente' &&
                    res.pago_estado !== 'pendiente'
                );

                const timing = getPendingDepositTiming(res, nowMs, 20);
                const isPendingDeposit = timing.isPendingDeposit && !timing.depositExpired;
                const depositMinutesRemaining = timing.depositMinutesRemaining;
                const depositExpired = timing.depositExpired;

                const effectiveStatus = depositExpired
                    ? 'Cancelado'
                    : (isDepositPaid && (!res.estado || res.estado === 'Reservado' || res.estado === 'Pendiente de pago' || res.estado === 'Pendiente de Pago'))
                        ? 'Confirmado'
                        : (isPendingDeposit ? 'Pendiente de pago' : (res.estado || 'Reservado'));

                const isOnlineOrigin = Boolean(
                    res.canal_reserva?.startsWith('web_publica') ||
                    res.origen?.startsWith('web_publica') ||
                    res.canal_reserva?.includes('chatbot') ||
                    res.origen?.includes('chatbot') ||
                    res.canal_reserva?.includes('janet') ||
                    res.origen?.includes('janet') ||
                    res.canal_reserva?.includes('app') ||
                    res.origen?.includes('app')
                );

                const resolveGroupLock = (groupItems: any[]) => {
                    if (res.professional_lock !== undefined) return Boolean(res.professional_lock);
                    const hasExplicitItemLock = groupItems.some((i: any) => i.professional_lock !== undefined);
                    if (hasExplicitItemLock) {
                        return groupItems.some((i: any) => i.professional_lock === true);
                    }
                    return isOnlineOrigin ? true : false;
                };

                if (!res.items || res.items.length === 0) {
                    return [{
                        ...res,
                        estado: effectiveStatus,
                        type: 'appointment' as const,
                        customer: customer,
                        professionalNames: 'N/A',
                        start: globalStart,
                        end: globalEnd,
                        duration: globalDuration,
                        color: getStatusColor(effectiveStatus),
                        professional_lock: res.professional_lock !== undefined ? Boolean(res.professional_lock) : isOnlineOrigin,
                        isPendingDeposit,
                        depositMinutesRemaining,
                        depositExpired,
                        layout: {
                            width: isPendingDeposit ? 50 : 100,
                            left: 0,
                            col: 0,
                            totalCols: 1,
                            isPendingDeposit,
                            depositMinutesRemaining,
                            depositExpired
                        }
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
                        estado: effectiveStatus,
                        type: 'appointment' as const,
                        customer: customer,
                        professionalNames: professionalMap.get(primaryProfId) || 'N/A',
                        target_barber_id: primaryProfId,
                        start: globalStart,
                        end: globalEnd,
                        duration: globalDuration,
                        color: getStatusColor(effectiveStatus),
                        professional_lock: resolveGroupLock(groupItems),
                        isPendingDeposit,
                        depositMinutesRemaining,
                        depositExpired,
                        layout: {
                            width: isPendingDeposit ? 50 : 100,
                            left: 0,
                            col: 0,
                            totalCols: 1,
                            isPendingDeposit,
                            depositMinutesRemaining,
                            depositExpired
                        }
                    }] as unknown as AgendaEvent[];
                }

                // Split into multiple events
                const splitEvents: AgendaEvent[] = [];
                groupedItemsMap.forEach((groupItems) => {
                    const profId = groupItems[0].barbero_id;
                    const itemStartStr = (groupItems[0] as any).hora_inicio;
                    
                    let startVal = globalStart;
                    let endVal = globalEnd;

                    if (itemStartStr && typeof itemStartStr === 'string' && itemStartStr.includes(':')) {
                        const [sh = 0, sm = 0] = itemStartStr.split(':').map(Number);
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
                        estado: effectiveStatus,
                        type: 'appointment' as const,
                        customer: customer,
                        professionalNames: professionalMap.get(profId) || 'N/A',
                        target_barber_id: profId,
                        start: startVal,
                        end: endVal,
                        duration: Math.max(0.0833, endVal - startVal),
                        color: getStatusColor(effectiveStatus),
                        professional_lock: resolveGroupLock(groupItems),
                        isPendingDeposit,
                        depositMinutesRemaining,
                        depositExpired,
                        layout: {
                            width: isPendingDeposit ? 50 : 100,
                            left: 0,
                            col: 0,
                            totalCols: 1,
                            isPendingDeposit,
                            depositMinutesRemaining,
                            depositExpired
                        }
                    } as unknown as AgendaEvent);
                });

                return splitEvents;
            });

        const mappedBlockEvents: AgendaEvent[] = timeBlocks
            .filter(block => Boolean(block && block.hora_inicio))
            .map(block => {
                const [startH = 0, startM = 0] = (block.hora_inicio || '00:00').split(':').map(Number);
                const [endH = startH, endM = startM + 30] = (block.hora_fin || '').includes(':') ? block.hora_fin.split(':').map(Number) : [startH, startM + 30];
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
    }, [reservations, timeBlocks, clients, professionals, nowMs]);

    const eventsWithLayout: AgendaEvent[] = useMemo(() => {
        const DEFAULT_MIN_WIDTH = 22; // 22% left strip width for a single No asiste / Cancelado

        const processedEvents: AgendaEvent[] = allEvents.map(event => {
            const isMinimized = event.type === 'appointment' && (event.estado === 'No asiste' || event.estado === 'Cancelado');
            const isPending = (event as any).isPendingDeposit === true;
            return {
                ...event,
                layout: {
                    width: isMinimized ? DEFAULT_MIN_WIDTH : (isPending ? 50 : 100),
                    left: 0,
                    col: 0,
                    totalCols: 1,
                    isMinimized,
                    isPendingDeposit: isPending,
                    depositMinutesRemaining: (event as any).depositMinutesRemaining,
                    depositExpired: (event as any).depositExpired
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
