
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
import { normalizeBirthdayToISO } from '@/lib/benefit-security';

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
  const { db, user } = useAuth();
  const canViewPhone = useMemo(() => {
    if (user?.role === 'Administrador general' || user?.role === 'Administrador local') return true;
    return Boolean(user?.permissions?.includes('ver_numero_telefono'));
  }, [user]);

  const canEditClient = useMemo(() => {
    if (user?.role === 'Administrador general' || user?.role === 'Administrador local') return true;
    return Boolean(user?.permissions?.includes('editar_clientes'));
  }, [user]);
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
  const [dayVal, setDayVal] = useState<string | undefined>(undefined);
  const [monthVal, setMonthVal] = useState<string | undefined>(undefined);
  const [yearVal, setYearVal] = useState<string | undefined>(undefined);

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
    const phoneDigits = phone.replace(/\D/g, '');
    const phoneLast10 = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '';
    const phoneVariants = phoneLast10
      ? Array.from(new Set([phone, phoneLast10, `+52${phoneLast10}`, `52${phoneLast10}`]))
      : (phone ? [phone] : []);

    const shouldValidatePhone = clientSettings ? clientSettings.validatePhone !== false : true;
    const shouldValidateEmail = clientSettings ? clientSettings.validateEmail !== false : true;

    const phoneQuery = shouldValidatePhone && isPhoneComplete && phoneVariants.length > 0
      ? query(collection(db, 'clientes'), where('telefono', 'in', phoneVariants))
      : null;

    const emailQuery = shouldValidateEmail && email && email.length >= 5
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
      const rawBday = client.fecha_nacimiento || (client as any).cumpleanos || null;
      if (rawBday) {
        const normalizedIso = normalizeBirthdayToISO(rawBday);
        if (normalizedIso) {
          birthDate = parseISO(normalizedIso);
        } else if (typeof rawBday === 'string') {
          const parsed = parseISO(rawBday);
          if (isValid(parsed)) birthDate = parsed;
        } else if ((rawBday as any).seconds) {
          birthDate = new Date((rawBday as any).seconds * 1000);
        }
      }
      const parsedPhone = parseStoredPhone(client.telefono);
      setPhoneCountryCode(parsedPhone.countryCode);
      setPhoneLocalDigits(canViewPhone ? parsedPhone.localDigits : '••••••••••');
      if (birthDate && isValid(birthDate)) {
        setDayVal(getDate(birthDate).toString());
        setMonthVal(getMonth(birthDate).toString());
        setYearVal(getYear(birthDate).toString());
      } else {
        setDayVal(undefined);
        setMonthVal(undefined);
        setYearVal(undefined);
      }
      form.reset({
        ...client,
        telefono: client.telefono || '',
        fecha_nacimiento: birthDate
      });
    } else {
      setPhoneCountryCode('+52');
      setPhoneLocalDigits('');
      setDayVal(undefined);
      setMonthVal(undefined);
      setYearVal(undefined);
      form.reset({
        nombre: initialName,
        apellido: '',
        telefono: '',
        correo: '',
        notas: '',
        fecha_nacimiento: undefined,
      });
    }
  }, [client, isEditMode, form, initialName, canViewPhone]);

  async function onSubmit(data: ClientFormData) {
    setIsSubmitting(true);
    if (!db) {
      toast({ variant: 'destructive', title: 'Error', description: 'La base de datos no está disponible.' });
      setIsSubmitting(false);
      return;
    };

    const shouldValidatePhone = clientSettings ? clientSettings.validatePhone !== false : true;
    const shouldValidateEmail = clientSettings ? clientSettings.validateEmail !== false : true;
    const trimmedPhone = (data.telefono || '').trim();
    const trimmedEmail = (data.correo || '').trim().toLowerCase();

    if (shouldValidatePhone && trimmedPhone && isValidPhoneNumber(trimmedPhone) && (!isEditMode || trimmedPhone !== (client?.telefono || '').trim())) {
      const digits = trimmedPhone.replace(/\D/g, '');
      const last10 = digits.length >= 10 ? digits.slice(-10) : '';
      const variants = last10
        ? Array.from(new Set([trimmedPhone, last10, `+52${last10}`, `52${last10}`]))
        : [trimmedPhone];
      const q = query(collection(db, 'clientes'), where('telefono', 'in', variants));
      const snap = await getDocs(q);
      const hasDup = snap.docs.some((d) => !isEditMode || d.id !== client?.id);
      if (hasDup) {
        setPhoneError('Este número ya está registrado.');
        toast({
          variant: 'destructive',
          title: 'Teléfono duplicado',
          description: 'Ya existe un cliente registrado con este número de celular.',
        });
        setIsSubmitting(false);
        return;
      }
    }

    if (!isEditMode && shouldValidateEmail && trimmedEmail && trimmedEmail.length > 5) {
      const q = query(collection(db, 'clientes'), where('correo', '==', trimmedEmail));
      if (!(await getDocs(q)).empty) {
        setEmailError('Este correo electrónico ya está registrado.');
        setIsSubmitting(false);
        return;
      }
    }


    const isoBirthStr = data.fecha_nacimiento ? format(data.fecha_nacimiento, 'yyyy-MM-dd') : null;
    const dataToSave: Partial<Client> & Record<string, any> = {
      nombre: (data.nombre || '').trim(),
      apellido: (data.apellido || '').trim(),
      telefono: (isEditMode && !canViewPhone && client) ? (client.telefono || '') : trimmedPhone,
      correo: trimmedEmail,
      notas: (data.notas || '').trim(),
      fecha_nacimiento: isoBirthStr,
      cumpleanos: isoBirthStr,
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
        if (err?.code === 'permission-denied') {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: clientRef.path,
            operation: 'update',
            requestResourceData: dataToSave,
            message: err.message,
          }));
        }
        toast({ title: 'Error al actualizar', description: err?.message || 'No se pudo actualizar el cliente.', variant: 'destructive' });
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
        if (err?.code === 'permission-denied') {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: newClientRef.path,
            operation: 'create',
            requestResourceData: fullData,
            message: err.message,
          }));
        }
        toast({ title: 'Error al crear cliente', description: err?.message || 'No se pudo crear el cliente.', variant: 'destructive' });
      }).finally(() => { setIsSubmitting(false); });
    }
  }

  // --- LÓGICA DE FECHA DE NACIMIENTO (Selectores Directos sin Popover) ---
  const currentDaysCount = useMemo(() => {
    const m = monthVal !== undefined ? parseInt(monthVal, 10) : 0;
    const y = yearVal !== undefined ? parseInt(yearVal, 10) : 2000;
    return getDaysInMonth(new Date(y, m));
  }, [monthVal, yearVal]);

  const currentDaysList = useMemo(() => {
    return Array.from({ length: currentDaysCount }, (_, i) => i + 1);
  }, [currentDaysCount]);

  const handleDatePartChange = (part: 'day' | 'month' | 'year', val: string) => {
    const nextDay = part === 'day' ? val : dayVal;
    const nextMonth = part === 'month' ? val : monthVal;
    const nextYear = part === 'year' ? val : yearVal;

    if (part === 'day') setDayVal(val);
    if (part === 'month') setMonthVal(val);
    if (part === 'year') setYearVal(val);

    if (nextDay && nextMonth) {
      const d = parseInt(nextDay, 10);
      const m = parseInt(nextMonth, 10);
      const y = nextYear ? parseInt(nextYear, 10) : (yearVal ? parseInt(yearVal, 10) : 2000);

      const daysInM = getDaysInMonth(new Date(y, m));
      const validD = Math.min(d, daysInM);
      if (validD !== d && part !== 'day') {
        setDayVal(validD.toString());
      }
      const newDate = new Date(y, m, validD);
      if (isValid(newDate)) {
        form.setValue('fecha_nacimiento', newDate, { shouldValidate: true });
      }
    }
  };

  const handleClearDate = () => {
    setDayVal(undefined);
    setMonthVal(undefined);
    setYearVal(undefined);
    form.setValue('fecha_nacimiento', null, { shouldValidate: true });
  };

  const fieldSettings = agendaSettings?.customerFields;
  const isSaveDisabled = isSubmitting || isCheckingDuplicates || !!phoneError || !!emailError || !form.formState.isValid;

  if (isEditMode && !canEditClient) {
    return (
      <div className="py-8 px-4 text-center space-y-4">
        <div className="flex justify-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Acceso no autorizado</h3>
          <p className="text-xs text-muted-foreground mt-1">
            No tienes permisos para editar clientes. Contacta a un administrador para solicitar el permiso correspondiente.
          </p>
        </div>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cerrar
          </Button>
        )}
      </div>
    );
  }

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
                      disabled={isEditMode && !canViewPhone}
                      value={phoneCountryCode}
                      onValueChange={(newCode) => {
                        if (isEditMode && !canViewPhone) return;
                        const cfg = getCountryPhoneConfig(newCode);
                        const trimmedLocal = phoneLocalDigits.slice(0, cfg.maxDigits);
                        setPhoneCountryCode(newCode);
                        setPhoneLocalDigits(trimmedLocal);
                        field.onChange(buildStoredPhone(newCode, trimmedLocal));
                      }}
                    >
                      <SelectTrigger
                        aria-label="Código de país"
                        disabled={isEditMode && !canViewPhone}
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
                        value={isEditMode && !canViewPhone ? '••••••••••' : phoneLocalDigits}
                        disabled={isEditMode && !canViewPhone}
                        readOnly={isEditMode && !canViewPhone}
                        className="h-9 text-xs flex-1"
                        onChange={(e) => {
                          if (isEditMode && !canViewPhone) return;
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
                    <FormLabel className="flex items-center justify-between text-xs font-medium text-foreground">
                      <span className="flex items-center">
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Fecha de Nacimiento {(fieldSettings.dob.required && <span className="text-red-500 ml-1">*</span>) || <OptionalLabel />}
                      </span>
                      {field.value && isValid(field.value) && (
                        <span className="text-[10px] text-blue-400 font-medium capitalize truncate max-w-[140px]">
                          {format(field.value, "d 'de' MMM, yyyy", { locale: es })}
                        </span>
                      )}
                    </FormLabel>
                    <div className="flex items-center gap-1.5">
                      {/* DÍA */}
                      <Select
                        value={dayVal}
                        onValueChange={(val) => handleDatePartChange('day', val)}
                      >
                        <SelectTrigger className="w-[68px] h-9 text-xs shrink-0">
                          <SelectValue placeholder="Día" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[220px] border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                          {currentDaysList.map((d) => (
                            <SelectItem key={d} value={d.toString()} className="text-xs">
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* MES */}
                      <Select
                        value={monthVal}
                        onValueChange={(val) => handleDatePartChange('month', val)}
                      >
                        <SelectTrigger className="flex-1 min-w-[95px] h-9 text-xs">
                          <SelectValue placeholder="Mes" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[220px] border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                          {months.map((m) => (
                            <SelectItem key={m.value} value={m.value.toString()} className="capitalize text-xs">
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* AÑO */}
                      <Select
                        value={yearVal}
                        onValueChange={(val) => handleDatePartChange('year', val)}
                      >
                        <SelectTrigger className="w-[78px] h-9 text-xs shrink-0">
                          <SelectValue placeholder="Año" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[220px] border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                          {years.map((y) => (
                            <SelectItem key={y} value={y.toString()} className="text-xs">
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Quitar fecha */}
                      {(dayVal || monthVal || yearVal) && (
                        <button
                          type="button"
                          onClick={handleClearDate}
                          className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
                          title="Quitar fecha"
                          aria-label="Quitar fecha"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
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
