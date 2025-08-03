
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import type { Client } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { DialogFooter } from '@/components/ui/dialog';
import { User, Mail, Phone, Calendar as CalendarIcon, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { es } from 'date-fns/locale';

const clientSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
  apellido: z.string().min(2, 'El apellido debe tener al menos 2 caracteres.'),
  telefono: z.string().min(8, 'El número de teléfono es requerido.'),
  correo: z.string().email('El correo electrónico no es válido.').optional().or(z.literal('')),
  fecha_nacimiento: z.date().optional(),
  notas: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface NewClientFormProps {
  onFormSubmit: (clientId: string) => void;
  client?: Client | null;
}

export function NewClientForm({ onFormSubmit, client = null }: NewClientFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!client;

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      nombre: '',
      apellido: '',
      telefono: '',
      correo: '',
      notas: '',
    },
  });

  useEffect(() => {
    if (isEditMode && client) {
      let birthDate = undefined;
      if (client.fecha_nacimiento) {
        if (typeof client.fecha_nacimiento === 'string') {
          birthDate = parseISO(client.fecha_nacimiento);
        } else if (client.fecha_nacimiento.seconds) {
          birthDate = new Date(client.fecha_nacimiento.seconds * 1000);
        }
      }
      form.reset({
        ...client,
        fecha_nacimiento: birthDate
      });
    } else {
      form.reset({
        nombre: '',
        apellido: '',
        telefono: '',
        correo: '',
        notas: '',
        fecha_nacimiento: undefined,
      });
    }
  }, [client, isEditMode, form]);

  async function onSubmit(data: ClientFormData) {
    setIsSubmitting(true);
    try {
      const dataToSave = {
        ...data,
        fecha_nacimiento: data.fecha_nacimiento ? format(data.fecha_nacimiento, 'yyyy-MM-dd') : null,
      };

      if (isEditMode && client) {
        const clientRef = doc(db, 'clientes', client.id);
        await updateDoc(clientRef, dataToSave);
        toast({
          title: '¡Cliente Actualizado!',
          description: `${data.nombre} ${data.apellido} ha sido actualizado.`,
        });
        onFormSubmit(client.id);
      } else {
        const docRef = await addDoc(collection(db, 'clientes'), {
          ...dataToSave,
          creado_en: Timestamp.now(),
        });
        toast({
          title: '¡Cliente Creado!',
          description: `${data.nombre} ${data.apellido} ha sido agregado a la base de datos.`,
        });
        onFormSubmit(docRef.id);
      }
      form.reset();

    } catch (error) {
      console.error('Error saving client: ', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el cliente. Inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4 px-1 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" /> Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Juan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="apellido"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" /> Apellido</FormLabel>
                  <FormControl>
                    <Input placeholder="Pérez" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="telefono"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4" /> Teléfono</FormLabel>
                <FormControl>
                  <Input placeholder="+56 9 1234 5678" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="correo"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center"><Mail className="mr-2 h-4 w-4" /> Correo Electrónico (Opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="juan.perez@email.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="fecha_nacimiento"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="flex items-center"><CalendarIcon className="mr-2 h-4 w-4" /> Fecha de Nacimiento (Opcional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? format(field.value, 'PPP', { locale: es }) : <span>Selecciona una fecha</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      locale={es}
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      captionLayout="dropdown-buttons"
                      fromYear={1950}
                      toYear={new Date().getFullYear()}
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notas"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center"><MessageSquare className="mr-2 h-4 w-4" /> Notas (Opcional)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Alergias, preferencias, etc." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditMode ? 'Guardar Cambios' : 'Guardar Cliente')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
