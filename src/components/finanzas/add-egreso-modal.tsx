'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Calendar as CalendarIcon, DollarSign, Edit, User, MessageSquare, Tag, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '../ui/textarea';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Profesional, Local, Egreso, User as AppUser } from '@/lib/types';
import { addDoc, collection, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';


const conceptosCostoFijo = ['Pago de renta', 'Insumos', 'Publicidad', 'Internet'];

const egresoSchema = z.object({
    fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
    monto: z.coerce.number().min(1, 'El monto debe ser mayor a 0.'),
    concepto: z.string().min(1, 'Debes seleccionar un concepto.'),
    concepto_otro: z.string().optional(),
    aQuienId: z.string().min(1, 'Debes seleccionar a quién se le entrega el dinero.'),
    local_id: z.string().min(1, 'Debes seleccionar un local.'),
    comentarios: z.string().optional(),
}).refine(data => {
    if (data.concepto === 'Otro') {
        return data.concepto_otro && data.concepto_otro.trim().length > 0;
    }
    return true;
}, {
    message: 'Por favor, especifica el concepto.',
    path: ['concepto_otro'],
});


type EgresoFormData = z.infer<typeof egresoSchema>;

interface AddEgresoModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onFormSubmit: () => void;
    egreso?: Egreso | null;
}

const adminConcepts = [
    { id: 'pago_renta', label: 'Pago de renta' },
    { id: 'insumos', label: 'Insumos' },
    { id: 'publicidad', label: 'Publicidad' },
    { id: 'internet', label: 'Internet' },
    { id: 'nomina', label: 'Nómina' },
    { id: 'otro', label: 'Otro' },
];

const cashierConcepts = [
    { id: 'entrega_efectivo', label: 'Entrega de efectivo' }
];

export function AddEgresoModal({ isOpen, onOpenChange, onFormSubmit, egreso }: AddEgresoModalProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { selectedLocalId } = useLocal();
    const { user } = useAuth();
    const isEditMode = !!egreso;

    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    const { data: users, loading: usersLoading } = useFirestoreQuery<AppUser>('usuarios');

    const isAdmin = user?.role === 'Administrador general' || user?.role === 'Administrador local';

    const conceptosDisponibles = isAdmin ? adminConcepts : cashierConcepts;

    const form = useForm<EgresoFormData>({
        resolver: zodResolver(egresoSchema),
        defaultValues: {
            fecha: new Date(),
            monto: '' as any,
            concepto: '',
            aQuienId: '',
            local_id: '',
            comentarios: '',
        },
    });

    const conceptoSeleccionado = form.watch('concepto');
    const localSeleccionadoId = form.watch('local_id');

    const destinatariosDisponibles = useMemo(() => {
        if (usersLoading || !users) return [];

        // Filtramos usuarios según el local seleccionado
        // Incluimos:
        // 1. Usuarios asignados explícitamente al local seleccionado
        // 2. Administradores Generales (siempre visibles para opciones de pago)

        const filteredUsers = users.filter(u => {
            // Si es admin general, incluirlo siempre
            if (u.role === 'Administrador general') return true;
            // Si coincide con el local seleccionado
            if (u.local_id === localSeleccionadoId) return true;
            return false;
        });

        if (isAdmin) return filteredUsers;

        // Si NO es admin (cajera/recepcionista), restringimos más si es necesario.
        // En este caso, la lógica anterior permitía ver Admins Generales y Locales.
        // Mantengamos esa lógica sobre la lista ya filtrada (que tiene a local staff + admins generales).

        return filteredUsers.filter(u =>
            (u.role === 'Administrador general') ||
            (u.role === 'Administrador local' && u.local_id === localSeleccionadoId)
            // ¿Deberían poder pagarle a Staff? Normalmente egresos de caja son a admins o dueños,
            // pero si es nomina, tal vez a staff. 
            // La petición original no restringía, pero la lógica anterior de 'non-admin' restringía a admins.
            // Asumiré que cajeras solo entregan dinero a supervisores (Admins).
        );

    }, [isAdmin, users, localSeleccionadoId, usersLoading]);

    useEffect(() => {
        const subscription = form.watch((value, { name }) => {
            if (name === 'concepto') {
                const esCostoFijo = conceptosCostoFijo.includes(value.concepto!);
                if (esCostoFijo) {
                    form.setValue('aQuienId', 'costos_fijos');
                } else {
                    // Reset if it was previously set to costos_fijos or on any other change
                    if (form.getValues('aQuienId') === 'costos_fijos') {
                        form.setValue('aQuienId', '');
                    }
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [form]);

    useEffect(() => {
        if (isOpen) {
            if (isEditMode && egreso) {
                const fechaEgreso = egreso.fecha instanceof Timestamp
                    ? egreso.fecha.toDate()
                    : (egreso.fecha instanceof Date ? egreso.fecha : new Date());

                const isPredefinedConcept = conceptosDisponibles.some(c => c.label === egreso.concepto);

                form.reset({
                    ...egreso,
                    monto: egreso.monto,
                    fecha: fechaEgreso,
                    concepto: isPredefinedConcept ? egreso.concepto : 'Otro',
                    concepto_otro: isPredefinedConcept ? '' : egreso.concepto,
                    aQuienId: egreso.aQuienId || '',
                });
            } else {
                form.reset({
                    fecha: new Date(),
                    monto: '' as any,
                    concepto: !isAdmin ? 'Entrega de efectivo' : '',
                    aQuienId: '',
                    comentarios: '',
                    concepto_otro: '',
                    local_id: selectedLocalId || (locales && locales.length > 0 ? locales[0].id : ''),
                });
            }
        }
    }, [isOpen, egreso, isEditMode, form, locales, selectedLocalId, isAdmin, conceptosDisponibles]);


    async function onSubmit(data: EgresoFormData) {
        setIsSubmitting(true);
        const finalConcepto = data.concepto === 'Otro' ? data.concepto_otro : data.concepto;

        const destinatarioSeleccionado = destinatariosDisponibles.find(d => d.id === data.aQuienId);

        const aQuienValue = data.aQuienId === 'costos_fijos'
            ? 'Costos fijos'
            : (destinatarioSeleccionado ? destinatarioSeleccionado.name : 'Desconocido');

        const dataToSave = {
            fecha: Timestamp.fromDate(data.fecha),
            monto: data.monto,
            concepto: finalConcepto,
            aQuien: aQuienValue, // Guardamos el nombre
            aQuienId: data.aQuienId, // Guardamos el ID por referencia
            local_id: data.local_id,
            comentarios: data.comentarios,
            persona_entrega_id: user?.uid,
            persona_entrega_nombre: user?.displayName
        };

        try {
            if (isEditMode && egreso) {
                const egresoRef = doc(db, 'egresos', egreso.id);
                await updateDoc(egresoRef, dataToSave);
                toast({ title: 'Egreso actualizado' });
            } else {
                await addDoc(collection(db, 'egresos'), dataToSave);
                toast({ title: 'Egreso guardado' });
            }

            onFormSubmit();
        } catch (error) {
            console.error('Error al registrar egreso:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo guardar el egreso. Inténtalo de nuevo.',
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    const esCostoFijo = conceptosCostoFijo.includes(conceptoSeleccionado);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <DialogHeader>
                            <DialogTitle>{isEditMode ? "Editar Egreso" : "Registrar Salida de Dinero"}</DialogTitle>
                            <DialogDescription>
                                Registra gastos, pagos a proveedores, nóminas o retiros de caja.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-5 px-1 py-6 max-h-[75vh] overflow-y-auto">

                            {/* Fila 1: Monto y Fecha */}
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="monto"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><DollarSign className="mr-1 h-3 w-3" /> Monto</FormLabel>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">$</span>
                                                <FormControl>
                                                    <Input type="number" className="pl-7 font-semibold text-lg" placeholder="0.00" {...field} value={field.value || ''} />
                                                </FormControl>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="fecha"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><CalendarIcon className="mr-1 h-3 w-3" /> Fecha</FormLabel>
                                            <Popover modal={true}>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                            {field.value ? format(field.value, 'PPP', { locale: es }) : <span>Selecciona fecha</span>}
                                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                        </Button>
                                                    </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar
                                                        locale={es}
                                                        mode="single"
                                                        selected={field.value}
                                                        onSelect={(date) => {
                                                            if (date) {
                                                                const current = field.value || new Date();
                                                                date.setHours(current.getHours(), current.getMinutes(), current.getSeconds());
                                                                field.onChange(date);
                                                            } else {
                                                                field.onChange(date);
                                                            }
                                                        }}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Fila 2: Local */}
                            <FormField
                                control={form.control}
                                name="local_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><Store className="mr-1 h-3 w-3" /> Local / Sucursal</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={localesLoading || !isAdmin}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecciona el local" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {locales?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Fila 3: Concepto */}
                            <FormField
                                control={form.control}
                                name="concepto"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><Tag className="mr-1 h-3 w-3" /> Concepto</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecciona el motivo del egreso" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {conceptosDisponibles.map(c => (
                                                    <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Fila 3.5: Concepto Otro (Condicional) */}
                            {conceptoSeleccionado === 'Otro' && isAdmin && (
                                <FormField
                                    control={form.control}
                                    name="concepto_otro"
                                    render={({ field }) => (
                                        <FormItem className="animate-in fade-in slide-in-from-top-2 duration-300">
                                            <FormControl>
                                                <Input placeholder="Especifique el concepto..." {...field} autoFocus />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {/* Fila 4: Destinatario */}
                            <FormField
                                control={form.control}
                                name="aQuienId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><User className="mr-1 h-3 w-3" /> Destinatario / Receptor</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={esCostoFijo || usersLoading}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={esCostoFijo ? 'N/A (Costo Fijo)' : (usersLoading ? 'Cargando...' : 'Selecciona a quién se le entrega')} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {destinatariosDisponibles.map(p => {
                                                    const shortRole = p.role === 'Administrador general' ? 'Admin General'
                                                        : p.role === 'Administrador local' ? 'Admin Local'
                                                            : p.role?.includes('Recepcionista') ? 'Recepcionista'
                                                                : p.role?.includes('Staff') ? 'Staff'
                                                                    : p.role || 'Usuario';

                                                    return (
                                                        <SelectItem key={p.id} value={p.id}>
                                                            {p.name} <span className="text-muted-foreground text-xs">({shortRole})</span>
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Fila 5: Comentarios */}
                            <FormField
                                control={form.control}
                                name="comentarios"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><MessageSquare className="mr-1 h-3 w-3" /> Comentarios</FormLabel>
                                        <FormControl><Textarea className="resize-none" rows={2} placeholder="Detalles opcionales..." {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Entrega (Solo lectura) */}
                            <div className="text-xs text-muted-foreground text-right pt-2 border-t mt-4">
                                Registrado por: <span className="font-semibold">{user?.displayName || 'Usuario Actual'}</span>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar Egreso
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}