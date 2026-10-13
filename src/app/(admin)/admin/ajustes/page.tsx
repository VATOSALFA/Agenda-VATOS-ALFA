'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2, Settings, Printer, MessageSquare, CalendarClock, HelpCircle } from "lucide-react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { BluetoothPrinter } from '@/lib/printer';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const customerFields = [
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Teléfono' },
  { id: 'dob', label: 'Fecha de Nacimiento' },
  { id: 'address', label: 'Dirección' },
  { id: 'notes', label: 'Notas del Cliente' },
];

interface AjustesSettings {
  ticketPrinterEnabled: boolean;
  ticketPrinterDeviceName: string;
  ticketFooterMessage: string;

  overlappingReservations: boolean;
  simultaneousReservations: boolean;
  resourceOverload: boolean;
  customerFields: Record<string, { use: boolean; required: boolean }>;

  whatsappMessageTemplate: string;
  whatsappReminderTemplate: string;
  whatsappConfirmationAnimation: boolean;
  whatsappReminderAnimation: boolean;
}

export default function AjustesPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);

  const form = useForm<AjustesSettings>({
    defaultValues: {
      ticketPrinterEnabled: false,
      ticketPrinterDeviceName: '',
      ticketFooterMessage: '¡Gracias por su preferencia!',
      overlappingReservations: true,
      simultaneousReservations: true,
      resourceOverload: false,
      customerFields: customerFields.reduce((acc, field) => {
        acc[field.id] = { use: true, required: ['phone'].includes(field.id) };
        return acc;
      }, {} as Record<string, { use: boolean; required: boolean }>),
      whatsappMessageTemplate: '¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\n_Podrá cancelar hasta 3 horas antes. Favor de llegar 5 minutos antes de tu cita._',
      whatsappReminderTemplate: '¡Hola *{nombre}*, te recordamos tu cita para el día de hoy! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n📍 *Ubicación:* {ubicacion}\n\n_¡Te esperamos!_',
      whatsappConfirmationAnimation: true,
      whatsappReminderAnimation: true,
    }
  });

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const pagosRef = doc(db, 'configuracion', 'pagos');
        const pagosSnap = await getDoc(pagosRef);
        const pagosData = pagosSnap.exists() ? pagosSnap.data() : {};

        const agendaRef = doc(db, 'configuracion', 'agenda');
        const agendaSnap = await getDoc(agendaRef);
        const agendaData = agendaSnap.exists() ? agendaSnap.data() : {};

        const whatsappRef = doc(db, 'configuracion', 'whatsapp');
        const whatsappSnap = await getDoc(whatsappRef);
        const whatsappData = whatsappSnap.exists() ? whatsappSnap.data() : {};

        form.reset({
          ticketPrinterEnabled: pagosData.ticketPrinterEnabled ?? false,
          ticketPrinterDeviceName: pagosData.ticketPrinterDeviceName || '',
          ticketFooterMessage: pagosData.ticketFooterMessage || '¡Gracias por su preferencia!',

          overlappingReservations: agendaData.overlappingReservations ?? true,
          simultaneousReservations: agendaData.simultaneousReservations ?? true,
          resourceOverload: agendaData.resourceOverload ?? false,
          customerFields: agendaData.customerFields || customerFields.reduce((acc, field) => {
            acc[field.id] = { use: true, required: ['phone'].includes(field.id) };
            return acc;
          }, {} as Record<string, { use: boolean; required: boolean }>),
          whatsappMessageTemplate: whatsappData.whatsappMessageTemplate || '¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\n_Podrá cancelar hasta 3 horas antes. Favor de llegar 5 minutos antes de tu cita._',
          whatsappReminderTemplate: whatsappData.whatsappReminderTemplate || '¡Hola *{nombre}*, te recordamos tu cita para el día de hoy! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n📍 *Ubicación:* {ubicacion}\n\n_¡Te esperamos!_',
          whatsappConfirmationAnimation: whatsappData.whatsappConfirmationAnimation ?? true,
          whatsappReminderAnimation: whatsappData.whatsappReminderAnimation ?? true,
        });

      } catch (error) {
        console.error("Error loading settings:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las configuraciones.' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [form, toast]);

  const handleConnectPrinter = async () => {
    setIsConnectingPrinter(true);
    try {
      const printer = BluetoothPrinter.getInstance();
      const deviceName = await printer.connect();
      form.setValue('ticketPrinterDeviceName', deviceName);
      form.setValue('ticketPrinterEnabled', true);
      toast({
        title: "Impresora Conectada",
        description: `Se ha vinculado correctamente con: ${deviceName}`,
      });
    } catch (error: any) {
      console.error("Printer connection error:", error);
      toast({
        variant: "destructive",
        title: "Error de conexión",
        description: error.message || "No se pudo conectar con la impresora.",
      });
    } finally {
      setIsConnectingPrinter(false);
    }
  };

  const handleTestPrint = async () => {
    try {
      const printer = BluetoothPrinter.getInstance();
      if (!printer.isConnected()) {
        await printer.connect();
      }
      await printer.print(`
      PRUEBA DE IMPRESION
      -------------------
      Agenda VATOS ALFA
      Sistema Profesional
      -------------------
      Funcionando correctamente.
      \n\n\n`);
      toast({ title: "Imprimiendo..." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const onSubmit = async (data: AjustesSettings) => {
    setIsSubmitting(true);
    try {
      const pagosRef = doc(db, 'configuracion', 'pagos');
      await setDoc(pagosRef, {
        ticketPrinterEnabled: data.ticketPrinterEnabled,
        ticketPrinterDeviceName: data.ticketPrinterDeviceName,
        ticketFooterMessage: data.ticketFooterMessage || '¡Gracias por su preferencia!',
      }, { merge: true });

      const agendaRef = doc(db, 'configuracion', 'agenda');
      await setDoc(agendaRef, {
        overlappingReservations: data.overlappingReservations,
        simultaneousReservations: data.simultaneousReservations,
        resourceOverload: data.resourceOverload,
        customerFields: data.customerFields
      }, { merge: true });

      const whatsappRef = doc(db, 'configuracion', 'whatsapp');
      await setDoc(whatsappRef, {
        whatsappMessageTemplate: data.whatsappMessageTemplate || '',
        whatsappReminderTemplate: data.whatsappReminderTemplate || '',
        whatsappConfirmationAnimation: data.whatsappConfirmationAnimation ?? true,
        whatsappReminderAnimation: data.whatsappReminderAnimation ?? true
      }, { merge: true });

      toast({
        title: "Configuración guardada",
        description: "Los ajustes han sido actualizados correctamente."
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 space-y-4 p-3 sm:p-6 pt-4 sm:pt-6">
      {/* Header oficial con bare icon y botón de guardado alineado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-slate-300 shrink-0" />
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Ajustes Generales</h2>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Configura dispositivos de impresión, notificaciones de WhatsApp y reglas de agenda.
            </p>
          </div>
        </div>

        <Button
          form="ajustes-form"
          type="submit"
          variant="alfa"
          size="sm"
          disabled={isSubmitting || isLoading}
          className="text-xs h-9 w-full sm:w-auto shrink-0"
        >
          {(isSubmitting || isLoading) && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Guardar Configuración
        </Button>
      </div>

      <form id="ajustes-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-4xl">
        <Tabs defaultValue="printer" className="space-y-4">
          <TabsList className="bg-muted/40 p-1 border border-border/60 rounded-xl h-auto flex flex-wrap sm:inline-flex gap-1">
            <TabsTrigger value="printer" className="rounded-lg text-xs py-1.5 px-3.5 gap-2 flex-1 sm:flex-initial">
              <Printer className="h-4 w-4 text-blue-400" />
              <span>Impresora de Tickets</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="rounded-lg text-xs py-1.5 px-3.5 gap-2 flex-1 sm:flex-initial">
              <MessageSquare className="h-4 w-4 text-blue-400" />
              <span>WhatsApp y Recordatorios</span>
            </TabsTrigger>
            <TabsTrigger value="agenda" className="rounded-lg text-xs py-1.5 px-3.5 gap-2 flex-1 sm:flex-initial">
              <CalendarClock className="h-4 w-4 text-blue-400" />
              <span>Campos de Agenda</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: IMPRESORA DE TICKETS */}
          <TabsContent value="printer" className="space-y-4 focus-visible:outline-none">
            <Card className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-4 sm:p-5 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs sm:text-sm font-semibold text-foreground">Habilitar impresión automática</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3 text-xs border-2 border-blue-500 rounded-xl bg-card shadow-xl">
                        Conecta una impresora térmica Bluetooth para expedir tickets de venta físicos automáticamente al cobrar en caja.
                      </PopoverContent>
                    </Popover>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Imprime un ticket al finalizar una venta en efectivo.</p>
                </div>
                <Controller name="ticketPrinterEnabled" control={form.control} render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                )} />
              </div>

              {form.watch('ticketPrinterEnabled') && (
                <Card className="rounded-xl border border-border/60 bg-muted/20">
                  <CardContent className="p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-2.5 w-2.5 rounded-full ${form.watch('ticketPrinterDeviceName') ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-500'}`} />
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs text-foreground">Dispositivo Vinculado</span>
                        <span className="text-[11px] text-muted-foreground">{form.watch('ticketPrinterDeviceName') || 'Ninguno'}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button type="button" variant="outline" size="sm" onClick={handleTestPrint} disabled={!form.watch('ticketPrinterDeviceName')} className="h-8 text-xs border-border/60">
                        Prueba
                      </Button>
                      <Button type="button" variant="alfa" size="sm" onClick={handleConnectPrinter} disabled={isConnectingPrinter} className="h-8 text-xs">
                        {isConnectingPrinter && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        {form.watch('ticketPrinterDeviceName') ? 'Cambiar Impresora' : 'Buscar Impresora'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Mensaje de pie de página</Label>
                <Controller name="ticketFooterMessage" control={form.control} render={({ field }) => (
                  <Textarea {...field} placeholder="¡Gracias por su preferencia!\nVisítanos de nuevo" className="min-h-[70px] text-xs bg-background border-border/60 font-sans leading-relaxed" />
                )} />
                <p className="text-[10px] text-muted-foreground">Este mensaje aparecerá al final de cada ticket impreso. Puedes usar <b>Enter</b> para saltos de línea.</p>
              </div>
            </Card>
          </TabsContent>

          {/* TAB 2: MENSAJES DE WHATSAPP */}
          <TabsContent value="whatsapp" className="space-y-4 focus-visible:outline-none">
            <Card className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-4 sm:p-5 space-y-6">
              {/* Confirmación */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-semibold text-foreground">Mensaje de Confirmación de Cita</h4>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                        <HelpCircle className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 text-xs border-2 border-blue-500 rounded-xl bg-card shadow-xl">
                      Plantilla sugerida al confirmar una cita recién agendada con el cliente.
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Plantilla del mensaje</Label>
                    <Controller
                      name="whatsappMessageTemplate"
                      control={form.control}
                      render={({ field }) => (
                        <Textarea
                          {...field}
                          rows={7}
                          className="font-sans text-xs bg-background border-border/60 leading-relaxed"
                        />
                      )}
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[10px] text-muted-foreground w-full">Variables disponibles (haz clic para insertar):</span>
                      {['{nombre}', '{servicios}', '{fecha}', '{hora}', '{profesional}', '{ubicacion}'].map(tag => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="cursor-pointer border-border/60 hover:border-blue-500/50 hover:bg-blue-500/10 text-[10px] py-0 px-2 h-5 font-mono"
                          onClick={() => {
                            const val = form.getValues('whatsappMessageTemplate') || '';
                            form.setValue('whatsappMessageTemplate', val + tag);
                          }}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#1e2428] p-3.5 rounded-xl border border-border/60 flex flex-col justify-between">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider text-center mb-2">Vista Previa WhatsApp</div>
                    <div className="bg-[#054740] text-slate-100 p-2.5 rounded-lg shadow max-w-[95%] self-end">
                      <div
                        className="text-xs whitespace-pre-wrap font-sans leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: (form.watch('whatsappMessageTemplate') || '')
                            .replace(/{nombre}/g, 'Juan Pérez')
                            .replace(/{servicios}/g, 'Corte Clásico')
                            .replace(/{fecha}/g, 'Lunes, 12 Octubre')
                            .replace(/{hora}/g, '10:00 AM')
                            .replace(/{profesional}/g, 'Carlos Barbero')
                            .replace(/{ubicacion}/g, 'VATOS ALFA Suc. Principal')
                            .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                            .replace(/_(.*?)_/g, '<em>$1</em>')
                            .replace(/~(.*?)~/g, '<del>$1</del>')
                        }}
                      />
                      <span className="text-[9px] text-slate-400 block text-right mt-1">12:00</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recordatorio */}
              <div className="space-y-3 pt-4 border-t border-border/40">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-semibold text-foreground">Mensaje de Recordatorio del Mismo Día</h4>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                        <HelpCircle className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 text-xs border-2 border-blue-500 rounded-xl bg-card shadow-xl">
                      Plantilla sugerida para recordar al cliente su cita unas horas antes del turno.
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Plantilla del mensaje</Label>
                    <Controller
                      name="whatsappReminderTemplate"
                      control={form.control}
                      render={({ field }) => (
                        <Textarea
                          {...field}
                          rows={6}
                          className="font-sans text-xs bg-background border-border/60 leading-relaxed"
                        />
                      )}
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[10px] text-muted-foreground w-full">Variables disponibles:</span>
                      {['{nombre}', '{servicios}', '{fecha}', '{hora}', '{profesional}', '{ubicacion}'].map(tag => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="cursor-pointer border-border/60 hover:border-blue-500/50 hover:bg-blue-500/10 text-[10px] py-0 px-2 h-5 font-mono"
                          onClick={() => {
                            const val = form.getValues('whatsappReminderTemplate') || '';
                            form.setValue('whatsappReminderTemplate', val + tag);
                          }}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#1e2428] p-3.5 rounded-xl border border-border/60 flex flex-col justify-between">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider text-center mb-2">Vista Previa Recordatorio</div>
                    <div className="bg-[#054740] text-slate-100 p-2.5 rounded-lg shadow max-w-[95%] self-end">
                      <div
                        className="text-xs whitespace-pre-wrap font-sans leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: (form.watch('whatsappReminderTemplate') || '')
                            .replace(/{nombre}/g, 'Juan Pérez')
                            .replace(/{servicios}/g, 'Corte Clásico')
                            .replace(/{fecha}/g, 'Lunes, 12 Octubre')
                            .replace(/{hora}/g, '10:00 AM')
                            .replace(/{profesional}/g, 'Carlos Barbero')
                            .replace(/{ubicacion}/g, 'VATOS ALFA Suc. Principal')
                            .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                            .replace(/_(.*?)_/g, '<em>$1</em>')
                            .replace(/~(.*?)~/g, '<del>$1</del>')
                        }}
                      />
                      <span className="text-[9px] text-slate-400 block text-right mt-1">09:00</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alertas Visuales */}
              <div className="space-y-3 pt-4 border-t border-border/40">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-semibold text-foreground">Alertas Visuales en Agenda</h4>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                        <HelpCircle className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 text-xs border-2 border-blue-500 rounded-xl bg-card shadow-xl">
                      Configura animaciones sutiles de recordatorio en los bloques de cita que tienen mensajes pendientes por enviar.
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2 max-w-xl">
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-muted/10">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-semibold text-foreground">Alerta de Confirmación Pendiente</Label>
                      <p className="text-[11px] text-muted-foreground">Animar la cita si no se ha enviado el mensaje de confirmación.</p>
                    </div>
                    <Controller name="whatsappConfirmationAnimation" control={form.control} render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    )} />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-muted/10">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-semibold text-foreground">Alerta de Recordatorio Pendiente</Label>
                      <p className="text-[11px] text-muted-foreground">Animar la cita si no se ha enviado el mensaje de recordatorio.</p>
                    </div>
                    <Controller name="whatsappReminderAnimation" control={form.control} render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    )} />
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* TAB 3: CAMPOS DE AGENDA */}
          <TabsContent value="agenda" className="space-y-4 focus-visible:outline-none">
            <Card className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-4 sm:p-5 space-y-4">
              {isLoading ? (
                <div className="p-2"><Skeleton className="h-32 w-full rounded-xl" /></div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-foreground">Campos Obligatorios de Clientes</h4>
                    <p className="text-xs text-muted-foreground">Define qué datos se solicitan y cuáles son estrictamente obligatorios al crear citas localmente.</p>
                  </div>
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                          <TableHead className="py-1 px-3 text-xs font-semibold">Dato del cliente</TableHead>
                          <TableHead className="py-1 px-3 text-xs font-semibold text-center">Usar en agenda</TableHead>
                          <TableHead className="py-1 px-3 text-xs font-semibold text-center">Obligatorio</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerFields.map(field => (
                          <TableRow key={field.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                            <TableCell className="py-1.5 px-3 text-xs font-medium">{field.label}</TableCell>
                            <TableCell className="py-1.5 px-3 text-center">
                              <Controller
                                name={`customerFields.${field.id}.use`}
                                control={form.control}
                                render={({ field: switchField }) => (
                                  <Switch checked={switchField.value} onCheckedChange={switchField.onChange} />
                                )}
                              />
                            </TableCell>
                            <TableCell className="py-1.5 px-3 text-center">
                              <Controller
                                name={`customerFields.${field.id}.required`}
                                control={form.control}
                                render={({ field: switchField }) => (
                                  <Switch
                                    checked={switchField.value}
                                    onCheckedChange={switchField.onChange}
                                    disabled={!form.watch(`customerFields.${field.id}.use`)}
                                  />
                                )}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Botón inferior complementario */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant="alfa"
            size="sm"
            disabled={isSubmitting || isLoading}
            className="text-xs h-9 w-full sm:w-auto"
          >
            {(isSubmitting || isLoading) && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Guardar Configuración
          </Button>
        </div>
      </form>
    </div>
  );
}
