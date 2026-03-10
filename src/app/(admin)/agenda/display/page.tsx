'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { format, addMinutes, isToday, set, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { where } from 'firebase/firestore';
import Image from 'next/image';
import { Clock, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useLocal } from '@/contexts/local-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useAgendaEvents } from '@/components/agenda/use-agenda-events';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchParams } from 'next/navigation';
import type { Profesional, Client, Service as ServiceType, ScheduleDay, Reservation, Local, TimeBlock, SaleItem, User as AppUser, Product, AgendaEvent } from '@/lib/types';

interface EmpresaSettings {
    receipt_logo_url?: string;
}

const ROW_HEIGHT = 56; // Slightly taller for TV readability

const useCurrentTime = () => {
    const [time, setTime] = useState<Date | null>(null);
    useEffect(() => {
        setTime(new Date());
        const timer = setInterval(() => setTime(new Date()), 30000); // Update every 30s
        return () => clearInterval(timer);
    }, []);
    return time;
};

const subtractIntervals = (base: { start: number, end: number }, subtractions: { start: number, end: number }[]) => {
    let result = [base];
    for (const sub of subtractions) {
        const nextResult = [];
        for (const res of result) {
            const start = Math.max(res.start, sub.start);
            const end = Math.min(res.end, sub.end);
            if (start < end) {
                if (res.start < start) nextResult.push({ start: res.start, end: start });
                if (end < res.end) nextResult.push({ start: end, end: res.end });
            } else {
                nextResult.push(res);
            }
        }
        result = nextResult;
    }
    return result;
};

export const dynamic = 'force-dynamic';

export default function AgendaDisplayPage() {
    const [date, setDate] = useState<Date>(new Date());

    // Auto-change day at midnight
    useEffect(() => {
        const checkDay = setInterval(() => {
            const now = new Date();
            if (now.getDate() !== date.getDate() || now.getMonth() !== date.getMonth()) {
                setDate(now);
            }
        }, 30000); // Check every 30s
        return () => clearInterval(checkDay);
    }, [date]);

    const searchParams = useSearchParams();
    const urlLocalId = searchParams.get('local_id');

    const { selectedLocalId, setSelectedLocalId } = useLocal();
    const { user, db } = useAuth();

    // Using URL local_id if present, otherwise context local_id
    const effectiveLocalId = urlLocalId || selectedLocalId;
    const currentTime = useCurrentTime();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [hasScrolled, setHasScrolled] = useState(false);

    // Queries
    const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');
    const { data: clients } = useFirestoreQuery<Client>('clientes');
    const { data: services } = useFirestoreQuery<ServiceType>('servicios');
    const { data: locales } = useFirestoreQuery<Local>('locales');
    const { data: empresaData } = useFirestoreQuery<EmpresaSettings>('empresa', 'main', where('__name__', '==', 'main'));
    const { data: users } = useFirestoreQuery<AppUser>('usuarios');
    const logoUrl = empresaData?.[0]?.receipt_logo_url;

    // Set local
    useEffect(() => {
        if (urlLocalId && urlLocalId !== selectedLocalId) {
            setSelectedLocalId(urlLocalId);
        } else if (user?.local_id) {
            if (selectedLocalId !== user.local_id) setSelectedLocalId(user.local_id);
        } else if (!effectiveLocalId && locales.length > 0) {
            setSelectedLocalId(locales[0].id);
        }
    }, [urlLocalId, locales, selectedLocalId, setSelectedLocalId, user, effectiveLocalId]);

    const selectedLocal = useMemo(() => {
        if (!effectiveLocalId || locales.length === 0) return null;
        return locales.find(l => l.id === effectiveLocalId) || locales[0];
    }, [effectiveLocalId, locales]);

    const slotDurationMinutes = 60;

    const { timeSlots, startHour, endHour } = useMemo(() => {
        if (!selectedLocal || !selectedLocal.schedule) {
            return { timeSlots: [], startHour: 10, endHour: 21 };
        }
        const dayOfWeek = format(date, 'eeee', { locale: es }).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const daySchedule = selectedLocal.schedule[dayOfWeek as keyof typeof selectedLocal.schedule] || selectedLocal.schedule.lunes;

        if (!daySchedule.enabled) {
            return { timeSlots: [], startHour: 10, endHour: 21 };
        }

        const [startH, startM] = daySchedule.start.split(':').map(Number);
        const [endH, endM] = daySchedule.end.split(':').map(Number);

        const slots = [];
        let currentSlotTime = set(new Date(), { hours: startH, minutes: startM, seconds: 0 });
        const endTime = set(new Date(), { hours: endH, minutes: endM, seconds: 0 });

        while (currentSlotTime < endTime) {
            slots.push(format(currentSlotTime, 'HH:mm'));
            currentSlotTime = addMinutes(currentSlotTime, slotDurationMinutes);
        }
        slots.push(format(endTime, 'HH:mm'));

        return { timeSlots: slots, startHour: startH, endHour: endH };
    }, [date, selectedLocal, slotDurationMinutes]);

    // Reservations query
    const reservationsQueryConstraint = useMemo(() => {
        if (!effectiveLocalId) return undefined;
        return [
            where('fecha', '==', format(date, 'yyyy-MM-dd')),
            where('local_id', '==', effectiveLocalId)
        ];
    }, [date, effectiveLocalId]);

    const reservationsQueryKey = useMemo(() => `display-reservations-${format(date, 'yyyy-MM-dd')}-${effectiveLocalId}`, [date, effectiveLocalId]);
    const blocksQueryKey = useMemo(() => `display-blocks-${format(date, 'yyyy-MM-dd')}-${effectiveLocalId}`, [date, effectiveLocalId]);

    const { data: reservations } = useFirestoreQuery<Reservation>('reservas', reservationsQueryKey, ...(reservationsQueryConstraint || []));
    const { data: timeBlocks } = useFirestoreQuery<TimeBlock>('bloqueos_horario', blocksQueryKey, ...(reservationsQueryConstraint || []));

    const filteredProfessionals = useMemo(() => {
        return professionals
            .filter(p => !p.deleted && p.local_id === effectiveLocalId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    }, [professionals, effectiveLocalId]);

    const { eventsWithLayout } = useAgendaEvents(reservations, timeBlocks, clients, filteredProfessionals);

    const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

    const getProfessionalAvatar = (profesional: Profesional): string | undefined => {
        return profesional.avatarUrl;
    };

    const selectedDateFormatted = format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });

    const calculatePosition = (startDecimal: number, durationDecimal: number) => {
        const pixelsPerMinute = ROW_HEIGHT / slotDurationMinutes;
        const minutesFromAgendaStart = (startDecimal - startHour) * 60;
        const top = minutesFromAgendaStart * pixelsPerMinute;
        const height = durationDecimal * 60 * pixelsPerMinute;
        return { top: `${top}px`, height: `${height}px` };
    };

    const currentTimeTop = useMemo(() => {
        if (!currentTime || !isToday(date) || startHour === undefined) return -1;
        const totalMinutesNow = currentTime.getHours() * 60 + currentTime.getMinutes();
        const totalMinutesStart = startHour * 60;
        if (totalMinutesNow < totalMinutesStart || totalMinutesNow > endHour * 60) return -1;
        const elapsedMinutes = totalMinutesNow - totalMinutesStart;
        const pixelsPerMinute = ROW_HEIGHT / slotDurationMinutes;
        return elapsedMinutes * pixelsPerMinute;
    }, [currentTime, date, startHour, endHour, slotDurationMinutes]);

    const formatHour = (hour: number) => {
        const h = Math.floor(hour);
        const m = Math.round((hour % 1) * 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const getDaySchedule = (barber: Profesional): ScheduleDay | null => {
        if (!barber.schedule) return null;
        const dayOfWeek = format(date, 'eeee', { locale: es })
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
        return barber.schedule[dayOfWeek as keyof typeof barber.schedule];
    };

    // Auto-scroll to current time
    useEffect(() => {
        if (currentTimeTop > 0 && scrollRef.current && !hasScrolled) {
            const scrollTarget = Math.max(0, currentTimeTop - 200);
            scrollRef.current.scrollTo({ top: scrollTarget, behavior: 'smooth' });
            setHasScrolled(true);
        }
    }, [currentTimeTop, hasScrolled]);

    const currentTimeFormatted = currentTime ? format(currentTime, 'HH:mm') : '';

    return (
        <div className="h-screen w-screen flex flex-col bg-muted/40 text-gray-900 overflow-hidden">
            {/* Header Bar */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
                <div className="flex items-center gap-5">
                    {logoUrl && (
                        <Image
                            src={logoUrl}
                            alt="Logo"
                            width={120}
                            height={60}
                            className="object-contain h-[50px] w-auto"
                        />
                    )}
                    <div>
                        <h1 className="text-2xl font-bold capitalize tracking-tight text-gray-900">{selectedDateFormatted}</h1>
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                            <Store className="w-4 h-4" /> {selectedLocal?.name || 'Cargando...'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-100 rounded-full px-4 py-2">
                        <Clock className="w-5 h-5 text-blue-500" />
                        <span className="text-2xl font-mono font-bold tabular-nums text-gray-900">{currentTimeFormatted}</span>
                    </div>
                </div>
            </div>

            {/* Professional Headers - Sticky */}
            <div className="flex-shrink-0 grid gap-1 bg-white border-b shadow-sm px-1"
                style={{ gridTemplateColumns: `80px repeat(${filteredProfessionals.length}, minmax(180px, 1fr))` }}>
                <div className="border-r" /> {/* Spacer for time column */}
                {filteredProfessionals.map(barber => (
                    <div key={barber.id} className="py-4 flex flex-col items-center justify-center">
                        <Avatar className="h-[80px] w-[80px] rounded-xl ring-2 ring-primary/20">
                            <AvatarImage src={getProfessionalAvatar(barber)} alt={barber.name} />
                            <AvatarFallback className="rounded-xl bg-primary/10 text-primary text-lg font-bold">
                                {barber.name ? barber.name.substring(0, 2) : '??'}
                            </AvatarFallback>
                        </Avatar>
                        <p className="font-semibold text-lg text-center mt-2 text-gray-900">{barber.name}</p>
                    </div>
                ))}
            </div>

            {/* Scrollable Agenda Grid */}
            <div className="flex-grow overflow-auto" ref={scrollRef}>
                <div className="grid gap-1 pb-8 px-1"
                    style={{ gridTemplateColumns: `80px repeat(${filteredProfessionals.length}, minmax(180px, 1fr))` }}>
                    {/* Time Column */}
                    <div className="flex-shrink-0 sticky left-0 z-10 bg-muted/40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div className="flex flex-col">
                            {timeSlots.slice(0, -1).map((time, index) => (
                                <div key={index} style={{ height: `${ROW_HEIGHT}px` }} className="border-b border-r bg-muted/40 flex items-center justify-center">
                                    <span className="text-sm text-muted-foreground font-semibold">{time}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Professional Columns */}
                    {filteredProfessionals.map((barber) => {
                        const daySchedule = getDaySchedule(barber);
                        const isWorking = daySchedule && daySchedule.enabled;

                        let barberStartHour = startHour;
                        let barberEndHour = endHour;
                        if (isWorking) {
                            const [startH, startM] = daySchedule.start.split(':').map(Number);
                            const [endH, endM] = daySchedule.end.split(':').map(Number);
                            barberStartHour = startH + (startM / 60);
                            barberEndHour = endH + (endM / 60);
                        }

                        const pixelsPerMinute = ROW_HEIGHT / slotDurationMinutes;

                        const availableIntervals = eventsWithLayout
                            .filter(e => e.type === 'block' && e.originalType === 'available' && e.barbero_id === barber.id)
                            .map(e => ({ start: e.start, end: e.end }));

                        let preShiftSegments: { start: number, end: number }[] = [];
                        if (isWorking && barberStartHour > startHour) {
                            preShiftSegments = subtractIntervals({ start: startHour, end: barberStartHour }, availableIntervals);
                        }

                        let postShiftSegments: { start: number, end: number }[] = [];
                        if (isWorking && barberEndHour < endHour) {
                            postShiftSegments = subtractIntervals({ start: barberEndHour, end: endHour }, availableIntervals);
                        }

                        let nonWorkingSegments: { start: number, end: number }[] = [];
                        if (!isWorking) {
                            nonWorkingSegments = subtractIntervals({ start: startHour, end: endHour }, availableIntervals);
                        }

                        const breakSegments = (isWorking && daySchedule?.breaks) ? daySchedule.breaks.flatMap((brk: any) => {
                            const [sH, sM] = brk.start.split(':').map(Number);
                            const [eH, eM] = brk.end.split(':').map(Number);
                            return subtractIntervals({ start: sH + sM / 60, end: eH + eM / 60 }, availableIntervals);
                        }) : [];

                        return (
                            <div key={barber.id} className="relative">
                                <div className="relative h-full">
                                    {/* Background cells */}
                                    <div className="flex flex-col">
                                        {timeSlots.slice(0, -1).map((time, index) => (
                                            <div key={index} style={{ height: `${ROW_HEIGHT}px` }} className="bg-white border-b border-r" />
                                        ))}
                                    </div>

                                    {/* Current time line */}
                                    {currentTimeTop > -1 && (
                                        <div className="absolute w-full h-0.5 bg-red-500 z-20 shadow-[0_0_8px_rgba(239,68,68,0.6)]" style={{ top: `${currentTimeTop}px` }}>
                                            <div className="absolute -left-1 -top-1 w-3 h-3 rounded-full bg-red-500" />
                                        </div>
                                    )}

                                    {/* Non-working segments */}
                                    {nonWorkingSegments.map((seg, i) => {
                                        const minutesFromStart = (seg.start - startHour) * 60;
                                        const top = minutesFromStart * pixelsPerMinute;
                                        const height = (seg.end - seg.start) * 60 * pixelsPerMinute;
                                        return (
                                            <div key={`nw-${i}`} className="absolute w-full bg-gray-100 flex items-center justify-center"
                                                style={{ top: `${top}px`, height: `${height}px` }}>
                                                <p className="text-xs text-gray-500 font-medium">Día no laboral</p>
                                            </div>
                                        );
                                    })}

                                    {/* Pre-shift */}
                                    {preShiftSegments.map((seg, i) => {
                                        const minutesFromStart = (seg.start - startHour) * 60;
                                        const top = minutesFromStart * pixelsPerMinute;
                                        const height = (seg.end - seg.start) * 60 * pixelsPerMinute;
                                        return (
                                            <div key={`pre-${i}`} className="absolute w-full bg-gray-100 flex items-center justify-center"
                                                style={{ top: `${top}px`, height: `${height}px` }}>
                                                <p className="text-xs text-gray-500 font-medium">No disponible</p>
                                            </div>
                                        );
                                    })}

                                    {/* Post-shift */}
                                    {postShiftSegments.map((seg, i) => {
                                        const minutesFromStart = (seg.start - startHour) * 60;
                                        const top = minutesFromStart * pixelsPerMinute;
                                        const height = (seg.end - seg.start) * 60 * pixelsPerMinute;
                                        return (
                                            <div key={`post-${i}`} className="absolute w-full bg-gray-100 flex items-center justify-center"
                                                style={{ top: `${top}px`, height: `${height}px` }}>
                                                <p className="text-xs text-gray-500 font-medium">No disponible</p>
                                            </div>
                                        );
                                    })}

                                    {/* Breaks */}
                                    {breakSegments.map((seg, i) => {
                                        const minutesFromStart = (seg.start - startHour) * 60;
                                        const top = minutesFromStart * pixelsPerMinute;
                                        const height = (seg.end - seg.start) * 60 * pixelsPerMinute;
                                        return (
                                            <div key={`break-${i}`} className="absolute w-full bg-gray-200/50 flex items-center justify-center"
                                                style={{ top: `${top}px`, height: `${height}px` }}>
                                                <p className="text-xs text-gray-500 font-medium">Descanso</p>
                                            </div>
                                        );
                                    })}

                                    {/* Events */}
                                    {eventsWithLayout
                                        .filter(event =>
                                            ((event.type === 'block' && event.barbero_id === barber.id) ||
                                                (event.type === 'appointment' && event.items?.some((i: SaleItem) => i.barbero_id === barber.id))) &&
                                            (event as any).originalType !== 'available'
                                        )
                                        .map((event: AgendaEvent) => (
                                            <div
                                                key={event.id}
                                                className={cn(
                                                    "absolute rounded-lg border-l-4 flex items-center text-left p-2.5 overflow-hidden select-none",
                                                    event.color,
                                                    event.type === 'appointment' ? 'z-20' : 'z-10'
                                                )}
                                                style={{ ...calculatePosition(event.start, event.duration), width: `calc(${event.layout.width}% - 4px)`, left: `${event.layout.left}%` }}
                                            >
                                                <div className="flex-grow overflow-hidden">
                                                    <p className="font-bold text-lg truncate leading-tight">
                                                        {event.type === 'appointment'
                                                            ? (event.customer?.nombre || 'Cliente')
                                                            : event.motivo}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
