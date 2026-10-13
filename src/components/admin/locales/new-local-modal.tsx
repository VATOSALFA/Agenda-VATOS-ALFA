'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, updateDoc, collection, doc, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MapPin, Clock, X, Globe } from 'lucide-react';
import type { Local } from '@/lib/types';
import { db } from '@/firebase';
import { cn } from '@/lib/utils';

const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${minute}`;
});

const daysOfWeek = [
  { id: 'lunes', label: 'Lunes' },
  { id: 'martes', label: 'Martes' },
  { id: 'miercoles', label: 'Miércoles' },
  { id: 'jueves', label: 'Jueves' },
  { id: 'viernes', label: 'Viernes' },
  { id: 'sabado', label: 'Sábado' },
  { id: 'domingo', label: 'Domingo' },
];

const localSchema = z.object({
  name: z.string().min(1, "El nombre es requerido."),
  address: z.string().min(1, "La dirección es requerida."),
  timezone: z.string().min(1, "La zona horaria es requerida."),
  phone: z.string().min(1, "El teléfono es requerido."),
  email: z.string().email("Debe ser un email válido."),
  googleMapsReviewUrl: z.string().optional().or(z.literal('')),
  schedule: z.any(),
  acceptsOnline: z.boolean().default(true),
  delivery: z.boolean().default(false),
  secondaryPhone: z.string().optional(),
  description: z.string().optional(),
});

type LocalFormData = z.infer<typeof localSchema>;

interface NewLocalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocalCreated: () => void;
  local: Local | null;
}

export function NewLocalModal({ isOpen, onClose, onLocalCreated, local }: NewLocalModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!local;

  const form = useForm<LocalFormData>({
    resolver: zodResolver(localSchema),
    defaultValues: {
      name: '',
      address: '',
      timezone: 'America/Mexico_City',
      phone: '',
      email: '',
      googleMapsReviewUrl: '',
      schedule: {
        lunes: { enabled: true, start: '10:00', end: '21:00' },
        martes: { enabled: true, start: '10:00', end: '21:00' },
        miercoles: { enabled: true, start: '10:00', end: '21:00' },
        jueves: { enabled: true, start: '10:00', end: '21:00' },
        viernes: { enabled: true, start: '10:00', end: '21:00' },
        sabado: { enabled: false, start: '10:00', end: '21:00' },
        domingo: { enabled: false, start: '10:00', end: '21:00' },
      },
      acceptsOnline: true,
      delivery: false,
      secondaryPhone: '',
      description: '',
    },
  });

  useEffect(() => {
    if (local) {
      form.reset({
        ...local,
        googleMapsReviewUrl: local.googleMapsReviewUrl || (local as any).google_maps_review_url || '',
      });
    } else {
      form.reset({
        name: '',
        address: '',
        timezone: 'America/Mexico_City',
        phone: '',
        email: '',
        googleMapsReviewUrl: '',
        schedule: {
          lunes: { enabled: true, start: '10:00', end: '21:00' },
          martes: { enabled: true, start: '10:00', end: '21:00' },
          miercoles: { enabled: true, start: '10:00', end: '21:00' },
          jueves: { enabled: true, start: '10:00', end: '21:00' },
          viernes: { enabled: true, start: '10:00', end: '21:00' },
          sabado: { enabled: false, start: '10:00', end: '21:00' },
          domingo: { enabled: false, start: '10:00', end: '21:00' },
        },
        acceptsOnline: true,
        delivery: false,
        secondaryPhone: '',
        description: '',
      });
    }
  }, [local, form]);

  const onSubmit = async (data: LocalFormData) => {
    if (!db) return;
    setIsSubmitting(true);
    try {
      const cleanMapsUrl = (data.googleMapsReviewUrl || '').trim();
      const payload = {
        ...data,
        googleMapsReviewUrl: cleanMapsUrl,
        google_maps_review_url: cleanMapsUrl,
      };

      if (isEditMode && local) {
        const localRef = doc(db, 'locales', local.id);
        await updateDoc(localRef, payload as any);
        toast({ title: "Local actualizado con éxito" });
      } else {
        const dataToSave = {
          ...payload,
          status: 'active',
          creado_en: Timestamp.now(),
        };
        await addDoc(collection(db, 'locales'), dataToSave);
        toast({ title: "Local guardado con éxito" });
      }

      onLocalCreated();
    } catch (error) {
      console.error("Error saving local: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el local. Inténtalo de nuevo.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        hideCloseButton={true}
        className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-card"
      >
        {/* Cabecera Oficial de Modal con Haz de Luz Oblicuo */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="header-light-beam absolute inset-0 pointer-events-none" />
          <div className="flex items-center gap-3 relative z-10">
            <MapPin className="h-5 w-5 text-slate-300 shrink-0" />
            <div>
              <DialogTitle className="text-base font-bold text-white tracking-tight">
                {isEditMode ? 'Editar Sucursal' : 'Nueva Sucursal'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-300">
                {isEditMode ? 'Modifica los datos y horario de atención de la sucursal.' : 'Ingresa la información general y horarios de la nueva sucursal.'}
              </DialogDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 relative z-10"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </Button>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 overflow-y-auto p-4 sm:p-5">
            <div className="space-y-4">
              {/* Información General */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs font-semibold text-foreground">
                    Nombre de la sucursal *
                  </Label>
                  <Input
                    id="name"
                    {...form.register('name')}
                    placeholder="Ej. Sucursal Matriz"
                    className="h-8 text-xs sm:text-sm"
                  />
                  {form.formState.errors.name && (
                    <p className="text-[11px] text-destructive">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="address" className="text-xs font-semibold text-foreground">
                    Dirección *
                  </Label>
                  <Input
                    id="address"
                    {...form.register('address')}
                    placeholder="Calle, Número, Colonia, Ciudad"
                    className="h-8 text-xs sm:text-sm"
                  />
                  {form.formState.errors.address && (
                    <p className="text-[11px] text-destructive">{form.formState.errors.address.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs font-semibold text-foreground">
                    Teléfono de contacto *
                  </Label>
                  <Input
                    id="phone"
                    {...form.register('phone')}
                    placeholder="10 dígitos"
                    className="h-8 text-xs sm:text-sm"
                  />
                  {form.formState.errors.phone && (
                    <p className="text-[11px] text-destructive">{form.formState.errors.phone.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs font-semibold text-foreground">
                    Email de la sucursal *
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    {...form.register('email')}
                    placeholder="sucursal@vatosalfa.com"
                    className="h-8 text-xs sm:text-sm"
                  />
                  {form.formState.errors.email && (
                    <p className="text-[11px] text-destructive">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="timezone" className="text-xs font-semibold text-foreground">
                    Zona horaria *
                  </Label>
                  <Controller
                    name="timezone"
                    control={form.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="America/Mexico_City" className="text-xs">
                            Ciudad de México (America/Mexico_City)
                          </SelectItem>
                          <SelectItem value="America/Tijuana" className="text-xs">
                            Tijuana / Pacífico (America/Tijuana)
                          </SelectItem>
                          <SelectItem value="America/Cancun" className="text-xs">
                            Cancún / Quintana Roo (America/Cancun)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="googleMapsReviewUrl" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                    Enlace de Google Maps (Reseñas)
                  </Label>
                  <Input
                    id="googleMapsReviewUrl"
                    type="url"
                    placeholder="https://maps.app.goo.gl/..."
                    {...form.register('googleMapsReviewUrl')}
                    className="h-8 text-xs font-sans"
                  />
                </div>
              </div>

              {/* Configurador de Horario Semanal Unificado (Regla 2 AGENTS.md) */}
              <div className="space-y-2 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    Horario de Atención Semanal
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    Define los días y horas de servicio
                  </span>
                </div>

                <div className="rounded-xl border border-border/70 divide-y divide-border/50 bg-card overflow-hidden">
                  {daysOfWeek.map((day) => {
                    const isDayEnabled = form.watch(`schedule.${day.id}.enabled`);
                    return (
                      <div
                        key={day.id}
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center justify-between py-2 px-3.5 gap-2 transition-colors",
                          isDayEnabled ? "bg-card" : "bg-muted/20 opacity-75"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-[130px]">
                          <Controller
                            name={`schedule.${day.id}.enabled` as any}
                            control={form.control}
                            render={({ field }) => (
                              <Switch
                                id={`switch-${day.id}`}
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="scale-90"
                              />
                            )}
                          />
                          <Label
                            htmlFor={`switch-${day.id}`}
                            className="text-xs font-semibold cursor-pointer capitalize text-foreground"
                          >
                            {day.label}
                          </Label>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">De</span>
                          <Controller
                            name={`schedule.${day.id}.start` as any}
                            control={form.control}
                            render={({ field }) => (
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                                disabled={!isDayEnabled}
                              >
                                <SelectTrigger className="h-7 w-[85px] text-xs font-sans">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-h-56">
                                  {timeOptions.map((time) => (
                                    <SelectItem key={time} value={time} className="text-xs font-sans">
                                      {time}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          <span className="text-[11px] text-muted-foreground">a</span>
                          <Controller
                            name={`schedule.${day.id}.end` as any}
                            control={form.control}
                            render={({ field }) => (
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                                disabled={!isDayEnabled}
                              >
                                <SelectTrigger className="h-7 w-[85px] text-xs font-sans">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-h-56">
                                  {timeOptions.map((time) => (
                                    <SelectItem key={time} value={time} className="text-xs font-sans">
                                      {time}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="px-5 py-3 border-t border-border/50 bg-muted/10 flex items-center justify-end gap-2 shrink-0">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-xs rounded-lg"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="alfa"
              disabled={isSubmitting}
              className="h-8 px-4 text-xs font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Guardando...
                </>
              ) : (
                isEditMode ? 'Guardar Cambios' : 'Crear Sucursal'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
