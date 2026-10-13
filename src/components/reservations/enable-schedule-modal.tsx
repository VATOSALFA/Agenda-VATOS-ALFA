
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { addDoc, collection } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CalendarCheck, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface EnableScheduleModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onFormSubmit: () => void;
    initialData: {
        barbero_id: string;
        fecha: Date;
        hora_inicio?: string; // Estimated click time
        barberName?: string;
        local_id?: string;
    } | null;
}

export function EnableScheduleModal({ isOpen, onOpenChange, onFormSubmit, initialData }: EnableScheduleModalProps) {
    const { db } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [startHour, setStartHour] = useState('12');
    const [startMinute, setStartMinute] = useState('00');
    const [endHour, setEndHour] = useState('13');
    const [endMinute, setEndMinute] = useState('00');

    useEffect(() => {
        if (isOpen && initialData) {
            if (initialData.hora_inicio) {
                const [h, m] = initialData.hora_inicio.split(':');
                setStartHour(h);
                setStartMinute(m);
                // Default 1 hour duration
                setEndHour(String(parseInt(h) + 1).padStart(2, '0'));
                setEndMinute(m);
            } else {
                setStartHour('12');
                setStartMinute('00');
                setEndHour('13');
                setEndMinute('00');
            }
        } else if (!isOpen) {
            // Agresivo reseteo de interactividad si Radix UI deja el scroll o puntero bloqueado por conflicto Modal+Select
            const cleanup = () => {
                document.body.style.pointerEvents = "";
                document.body.style.overflow = "";
                document.body.style.paddingRight = "";
            };
            setTimeout(cleanup, 100);
            setTimeout(cleanup, 300);
            setTimeout(cleanup, 600);
        }
    }, [isOpen, initialData]);

    const handleSubmit = async () => {
        if (!db || !initialData) return;

        const start = `${startHour}:${startMinute}`;
        const end = `${endHour}:${endMinute}`;

        if (parseInt(startHour) > parseInt(endHour) || (startHour === endHour && parseInt(startMinute) >= parseInt(endMinute))) {
            toast({
                variant: 'destructive',
                title: 'Hora inválida',
                description: 'La hora de fin debe ser posterior a la hora de inicio.'
            });
            return;
        }

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'bloqueos_horario'), {
                barbero_id: initialData.barbero_id,
                local_id: initialData.local_id, // Added local_id
                fecha: format(initialData.fecha, 'yyyy-MM-dd'),
                hora_inicio: start,
                hora_fin: end,
                motivo: 'Horario Habilitado',
                type: 'available', // SPECIAL TYPE
                created_at: new Date()
            });

            toast({
                title: 'Horario Habilitado',
                description: `Se ha habilitado el horario de ${start} a ${end}.`
            });
            onFormSubmit();
            onOpenChange(false);
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo guardar el horario.'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent 
                hideCloseButton={true}
                className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background flex flex-col"
            >
                {/* CABECERA OFICIAL VATOS ALFA */}
                <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
                    {/* Haz de luz animado en diagonal */}
                    <div className="header-light-beam" aria-hidden="true" />

                    <div className="relative z-10 flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                            <CalendarCheck className="h-5 w-5 text-slate-300 shrink-0" />
                            <div>
                                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                    Habilitar Horario Especial
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                                    Definir horario disponible para {initialData?.barberName || 'el profesional'}.
                                </DialogDescription>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="p-1 text-slate-300 hover:text-white transition-colors"
                            aria-label="Cerrar modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Hora Inicio</Label>
                            <div className="flex gap-2">
                                <Select value={startHour} onValueChange={setStartHour}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {hours.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={startMinute} onValueChange={setStartMinute}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {minutes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Hora Fin</Label>
                            <div className="flex gap-2">
                                <Select value={endHour} onValueChange={setEndHour}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {hours.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={endMinute} onValueChange={setEndMinute}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {minutes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="px-5 pb-5 pt-0">
                    <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="btn-vatos-alfa rounded-xl font-bold">
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Habilitar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
