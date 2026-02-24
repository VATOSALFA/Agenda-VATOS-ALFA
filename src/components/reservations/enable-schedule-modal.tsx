
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { addDoc, collection } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
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
    const minutes = ['00', '15', '30', '45'];

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Habilitar Horario Especial</DialogTitle>
                    <DialogDescription>
                        Definir un horario disponible para {initialData?.barberName || 'el profesional'} en este día.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
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

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Habilitar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
