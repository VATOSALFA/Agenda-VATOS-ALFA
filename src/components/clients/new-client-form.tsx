
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
import {
  COUNTRY_PHONE_CODES,
  getCountryPhoneConfig,
  buildStoredPhone,
  parseStoredPhone,
  handlePhoneInputChange,
  isValidPhoneNumber,
} from '@/lib/phone-utils';

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
      ? z.string()
        .transform(val => val.trim())
        .refine(val => isValidPhoneNumber(val), { message: 'Ingresa un número de teléfono válido (10 dígitos en México o con código de país).' })
      : z.string().optional()
        .transform(val => val ? val.trim() : '')
        .refine(val => !val || isValidPhoneNumber(val), { message: 'Ingresa un número de teléfono válido (10 dígitos en México o con código de país).' }),
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
  initialName?: string;
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

export function NewClientForm({ onFormSubmit, onCancel, client = null, initialName = '' }: NewClientFormProps) {
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
  const [phoneCountryCode, setPhoneCountryCode] = useState<string>('+52');
  const [phoneLocalDigits, setPhoneLocalDigits] = useState<string>('');

  const clientSchema = useMemo(() => createClientSchema(agendaSettings || undefined), [agendaSettings]);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    mode: 'onBlur',
    defaultValues: {
      nombre: initialName,
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

    const phone = debouncedPhone?.trim() || '';
    const email = debouncedEmail?.toLowerCase();

    // Reset errors if fields are empty or invalid
    setPhoneError(null);
    setEmailError(null);

    const isPhoneComplete = phone ? isValidPhoneNumber(phone) : false;

    const phoneQuery = clientSettings?.validatePhone && isPhoneComplete
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
      console.log(`Checking spelling for ${type}: "${text}"`);
      const result = await spellCheck(text);
      console.log(`Spell check result for ${type}:`, result);

      if (result.hasCorrection) {
        if (type === 'nombre') setNombreSuggestion(result);
        else setApellidoSuggestion(result);
      } else {
        // If no correction, clear any existing suggestion (important if user corrects manually)
        if (type === 'nombre') setNombreSuggestion(null);
        else setApellidoSuggestion(null);
      }
    } catch (error) { console.error("Spell check failed:", error); }
    finally { if (type === 'nombre') setIsCheckingNombre(false); else setIsCheckingApellido(false); }
  }, []);

  useEffect(() => {
    if ((!isEditMode || form.formState.dirtyFields.nombre) && debouncedNombre) {
      checkSpelling(debouncedNombre, 'nombre');
    }
  }, [debouncedNombre, checkSpelling, isEditMode, form.formState.dirtyFields.nombre]);

  useEffect(() => {
    if ((!isEditMode || form.formState.dirtyFields.apellido) && debouncedApellido) {
      checkSpelling(debouncedApellido, 'apellido');
    }
  }, [debouncedApellido, checkSpelling, isEditMode, form.formState.dirtyFields.apellido]);

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
      const parsedPhone = parseStoredPhone(client.telefono);
      setPhoneCountryCode(parsedPhone.countryCode);
      setPhoneLocalDigits(parsedPhone.localDigits);
      form.reset({
        ...client,
        telefono: buildStoredPhone(parsedPhone.countryCode, parsedPhone.localDigits),
        fecha_nacimiento: birthDate
      });
    } else {
      setPhoneCountryCode('+52');
      setPhoneLocalDigits('');
      form.reset({
        nombre: initialName,
        apellido: '',
        telefono: '',
        correo: '',
        notas: '',
        fecha_nacimiento: undefined,
      });
    }
  }, [client, isEditMode, form, initialName]);

  async function onSubmit(data: ClientFormData) {
    setIsSubmitting(true);
    if (!db) {
      toast({ variant: 'destructive', title: 'Error', description: 'La base de datos no está disponible.' });
      setIsSubmitting(false);
      return;
    };

    if (!isEditMode) {
      let hasError = false;
      if (clientSettings?.validatePhone && data.telefono && isValidPhoneNumber(data.telefono)) {
        const cleanPhone = data.telefono.trim();
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
      updateDoc(clientRef, dataToSave).then(async () => {
        if (data.telefono && data.telefono !== client.telefono) {
          try {
            const resSnap = await getDocs(query(collection(db, 'reservas'), where('cliente_id', '==', client.id)));
            await Promise.all(
              resSnap.docs.map((rDoc) => updateDoc(rDoc.ref, { cliente_telefono: data.telefono }))
            );
          } catch (syncErr) {
            console.warn('Error sincronizando teléfono en reservas del cliente:', syncErr);
          }
        }
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

      // Auto-generate Client Number (If enabled)
      if (clientSettings?.autoClientNumber) {
        try {
          const clientsCol = collection(db, 'clientes');

          // 1. Max String
          const qString = query(clientsCol, orderBy('numero_cliente', 'desc'), limit(1));
          const snapString = await getDocs(qString);

          // 2. Max Number
          const qNumber = query(clientsCol, where('numero_cliente', '>=', 0), orderBy('numero_cliente', 'desc'), limit(1));
          const snapNumber = await getDocs(qNumber);

          let maxVal = 0;

          if (!snapString.empty) {
            const d = snapString.docs[0].data();
            const v = Number(d.numero_cliente);
            if (!isNaN(v)) maxVal = Math.max(maxVal, v);
          }

          if (!snapNumber.empty) {
            const d = snapNumber.docs[0].data();
            const v = Number(d.numero_cliente);
            if (!isNaN(v)) maxVal = Math.max(maxVal, v);
          }

          fullData.numero_cliente = maxVal + 1; // Store as Number
        } catch (err) {
          console.warn("Failed to generate client number:", err);
        }
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3.5">
        <div className="space-y-3 px-0.5">
          {/* Fila 1: Nombre y Apellido */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField control={form.control} name="nombre" render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="flex items-center text-xs font-medium text-foreground">
                  <User className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Nombre <span className="text-red-500 ml-1">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Juan" {...field} className={cn("h-9 text-xs", nombreSuggestion ? "border-red-500 focus-visible:ring-red-500" : "")} />
                </FormControl>
                {(isCheckingNombre || nombreSuggestion || form.formState.errors.nombre) && (
                  <div className="mt-1">
                    {isCheckingNombre && <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando...</div>}
                    {nombreSuggestion && <SpellingSuggestion suggestion={nombreSuggestion} onAccept={(text) => form.setValue('nombre', text)} />}
                    <FormMessage className="text-[11px]" />
                  </div>
                )}
              </FormItem>
            )}
            />
            <FormField control={form.control} name="apellido" render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="flex items-center text-xs font-medium text-foreground">
                  <User className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Apellido <span className="text-red-500 ml-1">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Pérez" {...field} className={cn("h-9 text-xs", apellidoSuggestion ? "border-red-500 focus-visible:ring-red-500" : "")} />
                </FormControl>
                {(isCheckingApellido || apellidoSuggestion || form.formState.errors.apellido) && (
                  <div className="mt-1">
                    {isCheckingApellido && <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando...</div>}
                    {apellidoSuggestion && <SpellingSuggestion suggestion={apellidoSuggestion} onAccept={(text) => form.setValue('apellido', text)} />}
                    <FormMessage className="text-[11px]" />
                  </div>
                )}
              </FormItem>
            )}
            />
          </div>

          {/* Fila 2: Teléfono y Correo Electrónico */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fieldSettings?.phone?.use && (
              <FormField control={form.control} name="telefono" render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="flex items-center text-xs font-medium text-foreground">
                    <Phone className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Teléfono {fieldSettings.phone.required && <span className="text-red-500 ml-1">*</span>}{!fieldSettings.phone.required && <OptionalLabel />}
                  </FormLabel>
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={phoneCountryCode}
                      onValueChange={(newCode) => {
                        const cfg = getCountryPhoneConfig(newCode);
                        const trimmedLocal = phoneLocalDigits.slice(0, cfg.maxDigits);
                        setPhoneCountryCode(newCode);
                        setPhoneLocalDigits(trimmedLocal);
                        field.onChange(buildStoredPhone(newCode, trimmedLocal));
                      }}
                    >
                      <SelectTrigger
                        aria-label="Código de país"
                        className="w-[88px] h-9 px-2 text-xs font-medium shrink-0"
                      >
                        <SelectValue>
                          {getCountryPhoneConfig(phoneCountryCode).label}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-[220px] border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                        {COUNTRY_PHONE_CODES.map((c) => (
                          <SelectItem key={c.code} value={c.code} className="text-xs">
                            {c.flag} {c.code === 'OTHER' ? '+Otro' : c.code} — {c.country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormControl>
                      <Input
                        placeholder={getCountryPhoneConfig(phoneCountryCode).placeholder}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={phoneLocalDigits}
                        className="h-9 text-xs flex-1"
                        onChange={(e) => {
                          const parsed = handlePhoneInputChange(e.target.value, phoneCountryCode);
                          setPhoneCountryCode(parsed.countryCode);
                          setPhoneLocalDigits(parsed.localDigits);
                          field.onChange(parsed.storedPhone);
                        }}
                      />
                    </FormControl>
                  </div>
                  {(isCheckingDuplicates || phoneError || form.formState.errors.telefono) && (
                    <div className="mt-1">
                      {isCheckingDuplicates ? (
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando duplicados...</div>
                      ) : phoneError ? (
                        <p className="text-xs font-medium text-destructive flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" />{phoneError}</p>
                      ) : (
                        <FormMessage className="text-[11px]" />
                      )}
                    </div>
                  )}
                </FormItem>
              )}
              />
            )}

            {fieldSettings?.email?.use && (
              <FormField control={form.control} name="correo" render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="flex items-center text-xs font-medium text-foreground">
                    <Mail className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Correo Electrónico {fieldSettings.email.required && <span className="text-red-500 ml-1">*</span>}{!fieldSettings.email.required && <OptionalLabel />}
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="juan.perez@email.com" {...field} className="h-9 text-xs" />
                  </FormControl>
                  {(isCheckingDuplicates || emailError || form.formState.errors.correo) && (
                    <div className="mt-1">
                      {isCheckingDuplicates ? (
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando duplicados...</div>
                      ) : emailError ? (
                        <p className="text-xs font-medium text-destructive flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" />{emailError}</p>
                      ) : (
                        <FormMessage className="text-[11px]" />
                      )}
                    </div>
                  )}
                </FormItem>
              )}
              />
            )}
          </div>

          {/* Fila 3: Fecha de Nacimiento y Notas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fieldSettings?.dob?.use && (
              <FormField
                control={form.control}
                name="fecha_nacimiento"
                render={({ field }) => (
                  <FormItem className="space-y-1 flex flex-col">
                    <FormLabel className="flex items-center text-xs font-medium text-foreground">
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Fecha de Nacimiento {(fieldSettings.dob.required && <span className="text-red-500 ml-1">*</span>) || <OptionalLabel />}
                    </FormLabel>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full h-9 pl-3 text-left font-normal text-xs rounded-lg",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, 'dd MMMM yyyy', { locale: es }) : <span>Selecciona una fecha</span>}
                            {field.value ? (
                              <X className="ml-auto h-3.5 w-3.5 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); field.onChange(null); }} />
                            ) : (
                              <CalendarIcon className="ml-auto h-3.5 w-3.5 opacity-50" />
                            )}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
                        <p className="font-semibold text-center mb-2 text-xs text-muted-foreground">Fecha de Nacimiento</p>
                        <div className="flex gap-2">
                          {/* DÍA */}
                          <Select
                            onValueChange={(val) => handleDateSelectChange('day', val)}
                            value={field.value ? getDate(field.value).toString() : undefined}
                          >
                            <SelectTrigger className="w-[70px] h-8 text-xs">
                              <SelectValue placeholder="Día" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[200px] border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                              {days.map(d => <SelectItem key={d} value={d.toString()} className="text-xs">{d}</SelectItem>)}
                            </SelectContent>
                          </Select>

                          {/* MES */}
                          <Select
                            onValueChange={(val) => handleDateSelectChange('month', val)}
                            value={field.value ? getMonth(field.value).toString() : undefined}
                          >
                            <SelectTrigger className="w-[110px] h-8 text-xs">
                              <SelectValue placeholder="Mes" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[200px] border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                              {months.map(m => <SelectItem key={m.value} value={m.value.toString()} className="capitalize text-xs">{m.label}</SelectItem>)}
                            </SelectContent>
                          </Select>

                          {/* AÑO */}
                          <Select
                            onValueChange={(val) => handleDateSelectChange('year', val)}
                            value={field.value ? getYear(field.value).toString() : undefined}
                          >
                            <SelectTrigger className="w-[80px] h-8 text-xs">
                              <SelectValue placeholder="Año" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[200px] border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                              {years.map(y => <SelectItem key={y} value={y.toString()} className="text-xs">{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </PopoverContent>
                    </Popover>
                    {form.formState.errors.fecha_nacimiento && <FormMessage className="text-[11px]" />}
                  </FormItem>
                )}
              />
            )}

            {/* Notas */}
            {fieldSettings?.notes?.use && (
              <FormField control={form.control} name="notas" render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="flex items-center text-xs font-medium text-foreground">
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Notas {fieldSettings.notes.required && <span className="text-red-500 ml-1">*</span>}{!fieldSettings.notes.required && <OptionalLabel />}
                  </FormLabel>
                  <FormControl>
                    <Textarea placeholder="Alergias, preferencias, etc." {...field} className="h-9 min-h-[36px] max-h-24 resize-y text-xs py-1.5 px-3 leading-snug" />
                  </FormControl>
                  {form.formState.errors.notas && <FormMessage className="text-[11px]" />}
                </FormItem>
              )}
              />
            )}
          </div>
        </div>

        {/* Footer con botón ajustado al texto */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs font-medium rounded-xl text-slate-400 hover:text-foreground"
              onClick={onCancel}
            >
              Cancelar
            </Button>
          )}
          <Button
            type="submit"
            variant="alfa"
            size="sm"
            disabled={isSaveDisabled}
            className="h-8 px-4 text-xs font-semibold rounded-xl w-auto shrink-0"
          >
            {isSubmitting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              isEditMode ? 'Guardar Cambios' : 'Guardar Cliente'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
