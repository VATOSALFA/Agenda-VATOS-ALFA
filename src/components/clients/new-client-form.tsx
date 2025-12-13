
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, doc, updateDoc, Timestamp, getDoc, setDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, parseISO, getYear, getMonth, getDate, isValid, getDaysInMonth } from 'date-fns';
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
import { User, Mail, Phone, Calendar as CalendarIcon, MessageSquare, Loader2, Sparkles, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { es } from 'date-fns/locale';
import { Skeleton } from '../ui/skeleton';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  onCancel?: () => void;
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

// Generadores de listas para fechas
const currentYear = getYear(new Date());
const years = Array.from({ length: 100 }, (_, i) => currentYear - i); // Últimos 100 años
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }), // Nombres de meses en español
}));
const days = Array.from({ length: 31 }, (_, i) => i + 1);

export function NewClientForm({ onFormSubmit, onCancel, client = null }: NewClientFormProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!client;

  const [nombreSuggestion, setNombreSuggestion] = useState<SpellCheckOutput | null>(null);
  const [apellidoSuggestion, setApellidoSuggestion] = useState<SpellCheckOutput | null>(null);
  const [isCheckingNombre, setIsCheckingNombre] = useState(false);
  const [isCheckingApellido, setIsCheckingApellido] = useState(false);

  const [clientSettings, setClientSettings] = useState<ClientSettings | null>(null);
  const [agendaSettings, setAgendaSettings] = useState<any | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const clientSchema = useMemo(() => createClientSchema(agendaSettings || undefined), [agendaSettings]);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    mode: 'onBlur',
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
  const phoneValue = form.watch('telefono');
  const emailValue = form.watch('correo');

  const [debouncedNombre] = useDebounce(nombreValue, 750);
  const [debouncedApellido] = useDebounce(apellidoValue, 750);
  const [debouncedPhone] = useDebounce(phoneValue, 500);
  const [debouncedEmail] = useDebounce(emailValue, 500);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!db) return;
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

  const checkDuplicates = useCallback(async () => {
    if (isEditMode || !db) return;

    const phone = debouncedPhone?.replace(/\D/g, '');
    const email = debouncedEmail?.toLowerCase();

    // Reset errors if fields are empty or too short
    setPhoneError(null);
    if (!phone || phone.length < 10) setPhoneError(null);

    setEmailError(null);
    if (!email || email.length < 5) setEmailError(null);

    const phoneQuery = clientSettings?.validatePhone && phone && phone.length >= 10
      ? query(collection(db, 'clientes'), where('telefono', '==', phone))
      : null;

    const emailQuery = clientSettings?.validateEmail && email && email.length >= 5
      ? query(collection(db, 'clientes'), where('correo', '==', email))
      : null;

    if (!phoneQuery && !emailQuery) {
      setIsCheckingDuplicates(false);
      return;
    }

    setIsCheckingDuplicates(true);

    try {
      const [phoneResults, emailResults] = await Promise.all([
        phoneQuery ? getDocs(phoneQuery) : Promise.resolve(null),
        emailQuery ? getDocs(emailQuery) : Promise.resolve(null),
      ]);

      if (phoneResults && !phoneResults.empty) setPhoneError('Este número ya está registrado.');
      if (emailResults && !emailResults.empty) setEmailError('Este correo electrónico ya está registrado.');

    } catch (error) {
      console.error("Error checking duplicates:", error);
    } finally {
      setIsCheckingDuplicates(false);
    }
  }, [db, isEditMode, debouncedPhone, debouncedEmail, clientSettings]);

  useEffect(() => {
    checkDuplicates();
  }, [checkDuplicates]);

  const checkSpelling = useCallback(async (text: string, type: 'nombre' | 'apellido') => {
    if (!text || text.trim().length <= 2) return;
    if (type === 'nombre') { setIsCheckingNombre(true); setNombreSuggestion(null); }
    else { setIsCheckingApellido(true); setApellidoSuggestion(null); }
    try {
      const result = await spellCheck(text);
      if (result.hasCorrection) {
        if (type === 'nombre') setNombreSuggestion(result);
        else setApellidoSuggestion(result);
      }
    } catch (error) { console.error("Spell check failed:", error); }
    finally { if (type === 'nombre') setIsCheckingNombre(false); else setIsCheckingApellido(false); }
  }, []);

  useEffect(() => { if (debouncedNombre) checkSpelling(debouncedNombre, 'nombre'); }, [debouncedNombre, checkSpelling]);
  useEffect(() => { if (debouncedApellido) checkSpelling(debouncedApellido, 'apellido'); }, [debouncedApellido, checkSpelling]);

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

    if (!isEditMode) {
      let hasError = false;
      if (clientSettings?.validatePhone && data.telefono && data.telefono.length >= 10) {
        const cleanPhone = data.telefono.replace(/\D/g, '');
        const q = query(collection(db, 'clientes'), where('telefono', '==', cleanPhone));
        if (!(await getDocs(q)).empty) {
          setPhoneError('Este número ya está registrado.');
          hasError = true;
        }
      }
      if (clientSettings?.validateEmail && data.correo && data.correo.length > 5) {
        const emailLower = data.correo.toLowerCase();
        const q = query(collection(db, 'clientes'), where('correo', '==', emailLower));
        if (!(await getDocs(q)).empty) {
          setEmailError('Este correo electrónico ya está registrado.');
          hasError = true;
        }
      }
      if (hasError) {
        setIsSubmitting(false);
        return;
      }
    }


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
      }).finally(() => { setIsSubmitting(false); });

    } else {
      const fullData: any = { ...dataToSave, creado_en: Timestamp.now() };

      if (clientSettings?.autoClientNumber) {
        const q = query(collection(db, 'clientes'), orderBy('numero_cliente', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        let lastClientNumber = 0;
        if (!querySnapshot.empty) {
          const lastClient = querySnapshot.docs[0].data();
          if (lastClient.numero_cliente && !isNaN(Number(lastClient.numero_cliente))) {
            lastClientNumber = Number(lastClient.numero_cliente);
          }
        }
        fullData.numero_cliente = String(lastClientNumber + 1);
      }

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
      }).finally(() => { setIsSubmitting(false); });
    }
  }

  // --- LÓGICA DE FECHA (Selectores Desplegables) ---
  const handleDateSelectChange = (key: 'day' | 'month' | 'year', value: string) => {
    const val = parseInt(value, 10);
    const currentDate = form.getValues('fecha_nacimiento') || new Date(2000, 0, 1);

    let newDay = getDate(currentDate);
    let newMonth = getMonth(currentDate);
    let newYear = getYear(currentDate);

    if (key === 'day') newDay = val;
    if (key === 'month') newMonth = val;
    if (key === 'year') newYear = val;

    // Ajustar si el día excede los días del nuevo mes
    const daysInNewMonth = getDaysInMonth(new Date(newYear, newMonth));
    if (newDay > daysInNewMonth) newDay = daysInNewMonth;

    const newDate = new Date(newYear, newMonth, newDay);
    if (isValid(newDate)) {
      form.setValue('fecha_nacimiento', newDate, { shouldValidate: true });
    }
  };

  const fieldSettings = agendaSettings?.customerFields;
  const isSaveDisabled = isSubmitting || isCheckingDuplicates || !!phoneError || !!emailError || !form.formState.isValid;

  if (isLoadingSettings) {
    return (
      <div className="space-y-4 px-1 py-6 max-h-[60vh]">
        <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4 px-1 max-h-[60vh] overflow-y-auto">
          {/* Nombre y Apellido */}
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="nombre" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" /> Nombre <span className="text-red-500 ml-1">*</span></FormLabel>
                <FormControl><Input placeholder="Juan" {...field} /></FormControl>
                <div className="min-h-[24px]">
                  {isCheckingNombre && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando...</div>}
                  {nombreSuggestion && <SpellingSuggestion suggestion={nombreSuggestion} onAccept={(text) => form.setValue('nombre', text)} />}
                  <FormMessage />
                </div>
              </FormItem>
            )}
            />
            <FormField control={form.control} name="apellido" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" /> Apellido <span className="text-red-500 ml-1">*</span></FormLabel>
                <FormControl><Input placeholder="Pérez" {...field} /></FormControl>
                <div className="min-h-[24px]">
                  {isCheckingApellido && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando...</div>}
                  {apellidoSuggestion && <SpellingSuggestion suggestion={apellidoSuggestion} onAccept={(text) => form.setValue('apellido', text)} />}
                  <FormMessage />
                </div>
              </FormItem>
            )}
            />
          </div>

          {/* Teléfono */}
          {fieldSettings?.phone?.use && (
            <FormField control={form.control} name="telefono" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4" /> Teléfono {fieldSettings.phone.required && <span className="text-red-500 ml-1">*</span>}{!fieldSettings.phone.required && <OptionalLabel />}</FormLabel>
                <FormControl><Input placeholder="Ej: 1234567890 (10 dígitos)" {...field} /></FormControl>
                <div className="min-h-[24px] mt-1">
                  {isCheckingDuplicates ? (<div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando duplicados...</div>) : phoneError ? (<p className="text-sm font-medium text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4" />{phoneError}</p>) : (<FormMessage />)}
                </div>
              </FormItem>
            )}
            />
          )}

          {/* Correo */}
          {fieldSettings?.email?.use && (
            <FormField control={form.control} name="correo" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center"><Mail className="mr-2 h-4 w-4" /> Correo Electrónico {fieldSettings.email.required && <span className="text-red-500 ml-1">*</span>}{!fieldSettings.email.required && <OptionalLabel />}</FormLabel>
                <FormControl><Input placeholder="juan.perez@email.com" {...field} /></FormControl>
                <div className="min-h-[24px] mt-1">
                  {isCheckingDuplicates ? (<div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando duplicados...</div>) : emailError ? (<p className="text-sm font-medium text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4" />{emailError}</p>) : (<FormMessage />)}
                </div>
              </FormItem>
            )}
            />
          )}

          {/* Fecha de Nacimiento (Selectores) */}
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
                          {field.value ? format(field.value, 'dd MMMM yyyy', { locale: es }) : <span>Selecciona una fecha</span>}
                          {field.value ? (
                            <X className="ml-auto h-4 w-4 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); field.onChange(null); }} />
                          ) : (
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4" align="start">
                      <p className="font-semibold text-center mb-3 text-sm text-muted-foreground">Fecha de Nacimiento</p>
                      <div className="flex gap-2">
                        {/* DÍA */}
                        <Select
                          onValueChange={(val) => handleDateSelectChange('day', val)}
                          value={field.value ? getDate(field.value).toString() : undefined}
                        >
                          <SelectTrigger className="w-[70px]">
                            <SelectValue placeholder="Día" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {days.map(d => <SelectItem key={d} value={d.toString()}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>

                        {/* MES */}
                        <Select
                          onValueChange={(val) => handleDateSelectChange('month', val)}
                          value={field.value ? getMonth(field.value).toString() : undefined}
                        >
                          <SelectTrigger className="w-[110px]">
                            <SelectValue placeholder="Mes" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {months.map(m => <SelectItem key={m.value} value={m.value.toString()} className="capitalize">{m.label}</SelectItem>)}
                          </SelectContent>
                        </Select>

                        {/* AÑO */}
                        <Select
                          onValueChange={(val) => handleDateSelectChange('year', val)}
                          value={field.value ? getYear(field.value).toString() : undefined}
                        >
                          <SelectTrigger className="w-[80px]">
                            <SelectValue placeholder="Año" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="min-h-[24px]"><FormMessage /></div>
                </FormItem>
              )}
            />
          )}

          {/* Notas */}
          {fieldSettings?.notes?.use && (
            <FormField control={form.control} name="notas" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center"><MessageSquare className="mr-2 h-4 w-4" /> Notas {fieldSettings.notes.required && <span className="text-red-500 ml-1">*</span>}{!fieldSettings.notes.required && <OptionalLabel />}</FormLabel>
                <FormControl><Textarea placeholder="Alergias, preferencias, etc." {...field} /></FormControl>
                <div className="min-h-[24px]"><FormMessage /></div>
              </FormItem>
            )}
            />
          )}
        </div>

        <DialogFooter className="flex-row gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={isSaveDisabled} className="w-full sm:w-auto">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditMode ? 'Guardar Cambios' : 'Guardar Cliente')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
