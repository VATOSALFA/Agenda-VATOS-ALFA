'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, doc, updateDoc, Timestamp, getDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, parseISO, getYear, getMonth, getDate, isValid } from 'date-fns';
import type { Client } from '@/lib/types';
import { spellCheck, type SpellCheckOutput } from '@/ai/flows/spell-check-flow';
import { useDebounce } from 'use-debounce';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { DialogFooter } from '@/components/ui/dialog';
import { User, Mail, Phone, Calendar as CalendarIcon, MessageSquare, Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { es } from 'date-fns/locale';
import { Skeleton } from '../ui/skeleton';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { Calendar } from '@/components/ui/calendar'; 

interface ClientSettings {
    autoClientNumber?: boolean;
    validateEmail?: boolean;
    validatePhone?: boolean;
    customerFields?: Record<string, { use: boolean; required: boolean }>;
}

const createClientSchema = (settings?: ClientSettings) => {
    const fieldSettings = settings?.customerFields || {};
    
    return z.object({
      nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
      apellido: z.string().min(2, 'El apellido debe tener al menos 2 caracteres.'),
      telefono: fieldSettings.phone?.required 
        ? z.string().min(10, 'El teléfono debe tener al menos 10 dígitos.').transform(val => val.replace(/\D/g, ''))
        : z.string().optional().transform(val => val ? val.replace(/\D/g, '') : ''),
      correo: fieldSettings.email?.required
        ? z.string().email('El correo electrónico no es válido.')
        : z.string().email('El correo electrónico no es válido.').optional().or(z.literal('')),
      fecha_nacimiento: z.date().optional().nullable(),
      notas: z.string().optional(),
    });
};

type ClientFormData = z.infer<ReturnType<typeof createClientSchema>>;

interface NewClientFormProps {
  onFormSubmit: (clientId: string) => void;
  client?: Client | null;
}

const SpellingSuggestion = ({ suggestion, onAccept }: { suggestion: SpellCheckOutput, onAccept: (text: string) => void }) => {
    if (!suggestion.hasCorrection) return null;
    return (
        <button type="button" onClick={() => onAccept(suggestion.correctedText)} className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 transition-colors p-1 rounded-md bg-blue-50 hover:bg-blue-100">
            <Sparkles className="h-3 w-3" />
            ¿Quisiste decir: <span className="font-semibold">{suggestion.correctedText}</span>?
        </button>
    )
}

const OptionalLabel = () => <span className="text-xs text-muted-foreground ml-1">(opcional)</span>;


export function NewClientForm({ onFormSubmit, client = null }: NewClientFormProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!client;
  
  const [nombreSuggestion, setNombreSuggestion] = useState<SpellCheckOutput | null>(null);
  const [apellidoSuggestion, setApellidoSuggestion] = useState<SpellCheckOutput | null>(null);
  const [isCheckingNombre, setIsCheckingNombre] = useState(false);
  const [isCheckingApellido, setIsCheckingApellido] = useState(false);
  
  const [clientSettings, setClientSettings] = useState<ClientSettings | null>(null);
  const [agendaSettings, setAgendaSettings] = useState<any | null>(null); // Re-using any for agenda settings
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const clientSchema = useMemo(() => createClientSchema(agendaSettings || undefined), [agendaSettings]);

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
  
  const nombreValue = form.watch('nombre');
  const apellidoValue = form.watch('apellido');
  
  const [debouncedNombre] = useDebounce(nombreValue, 750);
  const [debouncedApellido] = useDebounce(apellidoValue, 750);
  
  useEffect(() => {
    const fetchSettings = async () => {
        if(!db) return;
        setIsLoadingSettings(true);
        const clientSettingsRef = doc(db, 'configuracion', 'clientes');
        const agendaSettingsRef = doc(db, 'configuracion', 'agenda');
        const [clientDocSnap, agendaDocSnap] = await Promise.all([
          getDoc(clientSettingsRef),
          getDoc(agendaSettingsRef)
        ]);

        if (clientDocSnap.exists()) {
            setClientSettings(clientDocSnap.data() as ClientSettings);
        }
        if (agendaDocSnap.exists()) {
            setAgendaSettings(agendaDocSnap.data() as any);
        }
        setIsLoadingSettings(false);
    };
    fetchSettings();
  }, [db]);

  const checkSpelling = useCallback(async (text: string, type: 'nombre' | 'apellido') => {
    if (!text || text.trim().length <= 2) return;
    
    if (type === 'nombre') {
      setIsCheckingNombre(true);
      setNombreSuggestion(null);
    } else {
      setIsCheckingApellido(true);
      setApellidoSuggestion(null);
    }
    
    try {
        const result = await spellCheck(text);
        if (result.hasCorrection) {
            if (type === 'nombre') setNombreSuggestion(result);
            else setApellidoSuggestion(result);
        }
    } catch (error) {
        console.error("Spell check failed:", error);
    } finally {
        if (type === 'nombre') setIsCheckingNombre(false);
        else setIsCheckingApellido(false);
    }
  }, []);
  
  useEffect(() => {
    if (debouncedNombre) {
      checkSpelling(debouncedNombre, 'nombre');
    }
  }, [debouncedNombre, checkSpelling]);
  
  useEffect(() => {
    if (debouncedApellido) {
      checkSpelling(debouncedApellido, 'apellido');
    }
  }, [debouncedApellido, checkSpelling]);

  useEffect(() => {
    if (isEditMode && client) {
      let birthDate: Date | null = null;
      if (client.fecha_nacimiento) {
        if (typeof client.fecha_nacimiento === 'string') {
          birthDate = parseISO(client.fecha_nacimiento);
        } else if ((client.fecha_nacimiento as any).seconds) {
          birthDate = new Date((client.fecha_nacimiento as any).seconds * 1000);
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
    if (!db) {
        toast({ variant: 'destructive', title: 'Error', description: 'La base de datos no está disponible.' });
        setIsSubmitting(false);
        return;
    };
    
    // --- VALIDACIÓN DE DUPLICADOS ---
    if (!isEditMode) { // Solo validar al crear, no al editar
        const queries = [];
        if (clientSettings?.validateEmail && data.correo) {
            queries.push(getDocs(query(collection(db, 'clientes'), where('correo', '==', data.correo))));
        }
        if (clientSettings?.validatePhone && data.telefono) {
            queries.push(getDocs(query(collection(db, 'clientes'), where('telefono', '==', data.telefono))));
        }

        if (queries.length > 0) {
            const results = await Promise.all(queries);
            if(results[0] && !results[0].empty) {
                toast({ variant: 'destructive', title: 'Cliente Duplicado', description: 'Ya existe un cliente con este correo electrónico.'});
                setIsSubmitting(false);
                return;
            }
            if(results[1] && !results[1].empty) {
                toast({ variant: 'destructive', title: 'Cliente Duplicado', description: 'Ya existe un cliente con este número de teléfono.'});
                setIsSubmitting(false);
                return;
            }
        }
    }
    // --- FIN VALIDACIÓN ---

    const dataToSave: Partial<Client> = {
        nombre: data.nombre,
        apellido: data.apellido,
        telefono: data.telefono,
        correo: data.correo,
        notas: data.notas,
        fecha_nacimiento: data.fecha_nacimiento ? format(data.fecha_nacimiento, 'yyyy-MM-dd') : null,
    };

    if (isEditMode && client) {
        const clientRef = doc(db, 'clientes', client.id);
        updateDoc(clientRef, dataToSave).then(() => {
            toast({ title: '¡Cliente Actualizado!', description: `${data.nombre} ${data.apellido} ha sido actualizado.` });
            onFormSubmit(client.id);
            form.reset();
        }).catch((err) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: clientRef.path,
                operation: 'update',
                requestResourceData: dataToSave,
                message: err.message,
            }));
        }).finally(() => {
            setIsSubmitting(false);
        });

    } else {
        const fullData = { ...dataToSave, creado_en: Timestamp.now() };
        const newClientRef = doc(collection(db, 'clientes'));
        setDoc(newClientRef, fullData).then(() => {
            toast({ title: '¡Cliente Creado!', description: `${data.nombre} ${data.apellido} ha sido agregado a la base de datos.` });
            onFormSubmit(newClientRef.id);
            form.reset();
        }).catch((err) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: newClientRef.path,
                operation: 'create',
                requestResourceData: fullData,
                message: err.message,
            }));
        }).finally(() => {
            setIsSubmitting(false);
        });
    }
  }
  
  const handleDatePartChange = (part: 'day' | 'month' | 'year', value: string) => {
    const val = parseInt(value, 10);
    if (isNaN(val)) return;

    const currentDate = form.getValues('fecha_nacimiento') || new Date(2000, 0, 1);
    let newDay = getDate(currentDate);
    let newMonth = getMonth(currentDate);
    let newYear = getYear(currentDate);

    if (part === 'day') newDay = val;
    if (part === 'month') newMonth = Math.max(0, Math.min(11, val - 1)); 
    if (part === 'year') newYear = val;

    const newDate = new Date(newYear, newMonth, newDay);
    if(isValid(newDate)) {
        form.setValue('fecha_nacimiento', newDate, { shouldValidate: true });
    }
  };

  const fieldSettings = agendaSettings?.customerFields;

  if (isLoadingSettings) {
    return (
        <div className="space-y-4 px-1 py-6 max-h-[60vh]">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
        </div>
    )
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
                  <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" /> Nombre <span className="text-red-500 ml-1">*</span></FormLabel>
                  <FormControl><Input placeholder="Juan" {...field} /></FormControl>
                   {isCheckingNombre && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/> Verificando...</div>}
                   {nombreSuggestion && <SpellingSuggestion suggestion={nombreSuggestion} onAccept={(text) => form.setValue('nombre', text)} />}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="apellido"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" /> Apellido <span className="text-red-500 ml-1">*</span></FormLabel>
                  <FormControl><Input placeholder="Pérez" {...field} /></FormControl>
                  {isCheckingApellido && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/> Verificando...</div>}
                  {apellidoSuggestion && <SpellingSuggestion suggestion={apellidoSuggestion} onAccept={(text) => form.setValue('apellido', text)} />}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {fieldSettings?.phone?.use && (
            <FormField
                control={form.control}
                name="telefono"
                render={({ field }) => (
                <FormItem>
                    <FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4" /> Teléfono {fieldSettings.phone.required && <span className="text-red-500 ml-1">*</span>}{!fieldSettings.phone.required && <OptionalLabel />}</FormLabel>
                    <FormControl>
                    <Input placeholder="Ej: 1234567890 (10 dígitos)" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
          )}
          {fieldSettings?.email?.use && (
            <FormField
                control={form.control}
                name="correo"
                render={({ field }) => (
                <FormItem>
                    <FormLabel className="flex items-center"><Mail className="mr-2 h-4 w-4" /> Correo Electrónico {fieldSettings.email.required && <span className="text-red-500 ml-1">*</span>}{!fieldSettings.email.required && <OptionalLabel />}</FormLabel>
                    <FormControl>
                    <Input placeholder="juan.perez@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
          )}
           
           {fieldSettings?.dob?.use && (
           <FormField
            control={form.control}
            name="fecha_nacimiento"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="flex items-center"><CalendarIcon className="mr-2 h-4 w-4" /> Fecha de Nacimiento {(fieldSettings.dob.required && <span className="text-red-500 ml-1">*</span>) || <OptionalLabel />}</FormLabel>
                <Popover modal={true}>
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
                        {field.value ? (
                          <X
                            className="ml-auto h-4 w-4 opacity-50 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              field.onChange(null);
                            }}
                          />
                        ) : (
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        )}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent 
                    className="w-96 p-4 space-y-4" 
                    align="start"
                  >
                    <p className="font-semibold text-center mb-2 text-sm text-muted-foreground">
                        Escribe la fecha o selecciona en el calendario
                    </p>
                    
                    <div className="grid grid-cols-3 gap-2 mb-4">
                        <div>
                            <span className="text-[10px] text-muted-foreground pl-1">Día</span>
                            <Input
                                placeholder="DD"
                                type="number"
                                min="1"
                                max="31"
                                value={field.value ? getDate(field.value) : ''}
                                onChange={(e) => handleDatePartChange('day', e.target.value)}
                            />
                        </div>
                        <div>
                            <span className="text-[10px] text-muted-foreground pl-1">Mes</span>
                            <Input
                                placeholder="MM"
                                type="number"
                                min="1"
                                max="12"
                                value={field.value ? getMonth(field.value) + 1 : ''}
                                onChange={(e) => handleDatePartChange('month', e.target.value)}
                            />
                        </div>
                        <div>
                            <span className="text-[10px] text-muted-foreground pl-1">Año</span>
                            <Input
                                placeholder="AAAA"
                                type="number"
                                min="1900"
                                max={getYear(new Date())}
                                value={field.value ? getYear(field.value) : ''}
                                onChange={(e) => handleDatePartChange('year', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="border-t pt-2">
                        <Calendar 
                            locale={es} 
                            mode="single" 
                            selected={field.value || undefined} 
                            onSelect={field.onChange} 
                            disabled={(date) => date > new Date()} 
                            initialFocus 
                        />
                    </div>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          )}
          
          {fieldSettings?.notes?.use && (
          <FormField
            control={form.control}
            name="notas"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center"><MessageSquare className="mr-2 h-4 w-4" /> Notas {fieldSettings.notes.required && <span className="text-red-500 ml-1">*</span>}{!fieldSettings.notes.required && <OptionalLabel />}</FormLabel>
                <FormControl>
                  <Textarea placeholder="Alergias, preferencias, etc." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          )}
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
