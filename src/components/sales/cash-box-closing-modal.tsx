

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc, Timestamp, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useAuth } from '@/contexts/firebase-auth-context';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Edit, Save, AlertTriangle, LogOut, X, ShieldAlert, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { cn, formatMoney, roundMoney } from '@/lib/utils';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { User } from '@/lib/types';


const denominations = [
  { value: 1000, label: '$1,000.00' },
  { value: 500, label: '$500.00' },
  { value: 200, label: '$200.00' },
  { value: 100, label: '$100.00' },
  { value: 50, label: '$50.00' },
  { value: 20, label: '$20.00' },
  { value: 10, label: '$10.00' },
  { value: 5, label: '$5.00' },
  { value: 2, label: '$2.00' },
  { value: 1, label: '$1.00' },
  { value: 0.5, label: '$0.50' },
];

const closingSchema = z.object({
  monto_entregado: z.coerce.number().min(0, 'El monto debe ser un número positivo.'),
  persona_recibe: z.string().min(1, 'Debes ingresar el nombre de quien recibe.'),
  comentarios: z.string().optional(),
});

type ClosingFormData = z.infer<typeof closingSchema>;

interface CashBoxClosingModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onFormSubmit: () => void;
  initialCash: number;
  localId: string;
}

export function CashBoxClosingModal({ isOpen, onOpenChange, onFormSubmit, initialCash, localId }: CashBoxClosingModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingFondo, setIsEditingFondo] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authCode, setAuthCode] = useState('');

  const [fondoBase, setFondoBase] = useState(1000);
  const [isSavingFondo, setIsSavingFondo] = useState(false);
  const [isCalcOpen, setIsCalcOpen] = useState(true);

  // Load base fund from configurations when modal opens
  useEffect(() => {
    async function loadFondoBase() {
      if (!isOpen || !localId) return;
      try {
        const docRef = doc(db, 'configuracion', 'caja');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const localFondo = data?.defaultFondoBaseByLocal?.[localId] ?? data?.defaultFondoBase ?? 1000;
          setFondoBase(localFondo);
        } else {
          setFondoBase(1000);
        }
      } catch (error) {
        console.error("Error loading fondo base:", error);
      }
    }
    loadFondoBase();
  }, [isOpen, localId]);

  const handleSaveFondoBase = async () => {
    setIsSavingFondo(true);
    try {
      const docRef = doc(db, 'configuracion', 'caja');
      await setDoc(docRef, {
        defaultFondoBaseByLocal: {
          [localId]: fondoBase
        }
      }, { merge: true });
      toast({ title: 'Fondo base guardado con éxito.' });
      setIsEditingFondo(false);
    } catch (error) {
      console.error("Error saving fondo base:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el fondo base.' });
    } finally {
      setIsSavingFondo(false);
    }
  };

  const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');

  const initialDenominations = useMemo(() => denominations.reduce((acc, d) => {
    acc[d.value] = '' as any;
    return acc;
  }, {} as Record<string, number>), []);

  const [denominationCounts, setDenominationCounts] = useState<Record<string, number>>(initialDenominations);

  const form = useForm<ClosingFormData>({
    resolver: zodResolver(closingSchema),
    defaultValues: {
      monto_entregado: 0,
      persona_recibe: '',
      comentarios: '',
    },
  });

  const totalContado = useMemo(() => {
    return roundMoney(denominations.reduce((total, d) => {
      const count = denominationCounts[d.value] || 0;
      return total + (count * d.value);
    }, 0));
  }, [denominationCounts, denominations]);

  const diferencia = roundMoney(totalContado - fondoBase - initialCash);

  useEffect(() => {
    if (isOpen) {
      form.reset({
        monto_entregado: 0,
        persona_recibe: '',
        comentarios: '',
      });
      setDenominationCounts(initialDenominations);
    }
  }, [isOpen, form, initialDenominations]);

  useEffect(() => {
    form.setValue('monto_entregado', totalContado);
  }, [totalContado, form]);

  async function onSubmit(data: ClosingFormData) {
    setIsSubmitting(true);
    try {
      const montoNetoEntregado = totalContado - fondoBase;
      await addDoc(collection(db, 'cortes_caja'), {
        fecha_corte: Timestamp.now(),
        persona_entrega_id: user?.uid,
        persona_entrega_nombre: user?.displayName,
        persona_recibe: data.persona_recibe,
        fondo_base: fondoBase,
        monto_entregado: montoNetoEntregado,
        total_calculado: totalContado,
        total_sistema: initialCash,
        diferencia: diferencia,
        comentarios: data.comentarios,
        local_id: localId,
        detalle_conteo: denominationCounts,
      });
      toast({ title: 'Corte de caja guardado con éxito.' });
      onFormSubmit();
      onOpenChange(false);
    } catch (error) {
      console.error("Error guardando corte de caja:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el corte de caja.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleAuthRequest = () => {
    setIsAuthModalOpen(true);
  };

  const handleAuthCodeSubmit = async () => {
    if (!authCode) {
      toast({ variant: 'destructive', title: 'Código requerido' });
      return;
    }
    const authCodeQuery = query(
      collection(db, 'codigos_autorizacion'),
      where('code', '==', authCode),
      where('active', '==', true),
      where('cashbox', '==', true)
    );
    const querySnapshot = await getDocs(authCodeQuery);
    if (querySnapshot.empty) {
      toast({ variant: 'destructive', title: 'Código inválido o sin permiso' });
    } else {
      toast({ title: 'Código correcto' });
      setIsEditingFondo(true);
      setIsAuthModalOpen(false);
    }
    setAuthCode('');
  };

  const handleDenominationChange = (value: number, count: string) => {
    const newCount = parseInt(count, 10);
    setDenominationCounts(prev => ({ ...prev, [value]: isNaN(newCount) ? 0 : newCount }));
  }

  const filteredUsers = useMemo(() => {
    return users.filter(u => u.role === 'Administrador local' || u.role === 'Recepcionista' || u.role === 'Administrador general');
  }, [users]);


  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent hideCloseButton={true} className="sm:max-w-5xl max-h-[92dvh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
          {/* Header Oficial Vatos Alfa */}
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 text-white border-b border-blue-900/40 flex-shrink-0">
            <div className="header-light-beam" />
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LogOut className="h-5 w-5 text-slate-300" />
                <div>
                  <DialogTitle className="font-bold text-base sm:text-lg text-white leading-tight">
                    Realizar Corte de Caja
                  </DialogTitle>
                  <p className="text-xs text-slate-300">
                    {format(new Date(), "HH:mm 'hs.' dd 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-grow overflow-y-auto px-4 sm:px-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="py-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {/* Left Column: Calculadora de Efectivo */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm sm:text-base text-foreground">Calculadora de Efectivo</h3>
                        <span className="text-xs font-bold text-foreground bg-muted/40 px-2 py-0.5 rounded-lg border border-border/60">
                          ${formatMoney(totalContado)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDenominationCounts(initialDenominations)}
                          className="text-xs text-slate-400 hover:text-white transition-colors p-1 flex items-center gap-1"
                          title="Limpiar conteo"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline text-[11px]">Limpiar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCalcOpen(!isCalcOpen)}
                          className="md:hidden text-xs text-blue-400 hover:text-blue-300 font-medium p-1 flex items-center gap-1"
                        >
                          <span>{isCalcOpen ? 'Ocultar' : 'Ver desglose'}</span>
                          {isCalcOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    {isCalcOpen && (
                      <div className="grid grid-cols-2 gap-2">
                        {denominations.map(d => {
                          const count = denominationCounts[d.value] || '';
                          const countNum = Number(count) || 0;
                          const subtotal = d.value * countNum;
                          return (
                            <div
                              key={d.value}
                              className={cn(
                                "flex items-center justify-between gap-1.5 p-2 rounded-xl border transition-all",
                                countNum > 0
                                  ? "border-blue-500/50 bg-blue-500/5 shadow-sm"
                                  : "border-border/50 bg-card/40"
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <Label htmlFor={`den-${d.value}`} className="text-xs font-bold text-foreground cursor-pointer block leading-tight">
                                  {d.label}
                                </Label>
                                <span className="text-[10px] text-muted-foreground block truncate">
                                  = ${formatMoney(subtotal)}
                                </span>
                              </div>
                              <Input
                                id={`den-${d.value}`}
                                type="number"
                                min="0"
                                placeholder="0"
                                value={count}
                                onChange={(e) => handleDenominationChange(d.value, e.target.value)}
                                className="h-8 w-14 text-center font-bold text-xs px-1 rounded-lg border-border/60 bg-background"
                              />
                            </div>
                          );
                        })}
                        {/* 12th card: Limpiar conteo */}
                        <button
                          type="button"
                          onClick={() => setDenominationCounts(initialDenominations)}
                          className="flex items-center justify-center gap-1 p-2 rounded-xl border border-dashed border-border/60 bg-muted/10 text-muted-foreground hover:text-white hover:bg-muted/20 transition-colors text-xs font-medium cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Limpiar todo</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Resumen y Responsables */}
                  <div className="space-y-3.5 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/40 pb-2">
                        <span>Responsable en turno:</span>
                        <span className="font-semibold text-foreground">{user?.displayName || 'Usuario actual'}</span>
                      </div>

                      {/* 2x2 Metric Cards */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* 1. Efectivo Sistema */}
                        <div className="p-2.5 rounded-xl border border-border/60 bg-card/60">
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold block leading-tight">Efectivo Sistema</span>
                          <span className="text-sm sm:text-base font-bold text-foreground block mt-0.5">
                            ${formatMoney(initialCash)}
                          </span>
                        </div>

                        {/* 2. Total Contado */}
                        <div className="p-2.5 rounded-xl border border-border/60 bg-card/60">
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold block leading-tight">Total Contado</span>
                          <span className="text-sm sm:text-base font-bold text-foreground block mt-0.5">
                            ${formatMoney(totalContado)}
                          </span>
                        </div>

                        {/* 3. Fondo Base (con Editar/Guardar) */}
                        <div className="p-2.5 rounded-xl border border-border/60 bg-card/60">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold leading-tight">Fondo Base</span>
                            <button
                              type="button"
                              disabled={isSavingFondo}
                              onClick={() => {
                                if (isEditingFondo) {
                                  handleSaveFondoBase();
                                } else {
                                  handleAuthRequest();
                                }
                              }}
                              className="text-[10px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                            >
                              {isSavingFondo ? '...' : isEditingFondo ? 'Guardar' : 'Editar'}
                            </button>
                          </div>
                          {isEditingFondo ? (
                            <div className="relative mt-1">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                              <Input
                                type="number"
                                value={fondoBase}
                                onChange={(e) => setFondoBase(Number(e.target.value))}
                                className="h-7 pl-5 text-xs font-bold rounded-lg"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <span className="text-sm sm:text-base font-bold text-foreground block mt-0.5">
                              ${formatMoney(fondoBase)}
                            </span>
                          )}
                        </div>

                        {/* 4. Diferencia */}
                        <div className={cn(
                          "p-2.5 rounded-xl border",
                          diferencia === 0
                            ? "border-border/60 bg-card/60"
                            : diferencia > 0
                              ? "border-blue-500/40 bg-blue-500/5"
                              : "border-red-500/40 bg-red-500/5"
                        )}>
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold block leading-tight">Diferencia</span>
                          <span className={cn(
                            "text-sm sm:text-base font-bold block mt-0.5",
                            diferencia === 0
                              ? "text-foreground"
                              : diferencia > 0
                                ? "text-blue-400"
                                : "text-red-400"
                          )}>
                            {diferencia === 0
                              ? '$0.00'
                              : diferencia > 0
                                ? `+$${formatMoney(diferencia)}`
                                : `-$${formatMoney(Math.abs(diferencia))}`}
                          </span>
                          {diferencia !== 0 && (
                            <span className="text-[9px] text-muted-foreground block">
                              {diferencia > 0 ? 'Sobrante en caja' : 'Faltante en caja'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Total a Entregar Banner */}
                      <div className="p-3 sm:p-4 rounded-xl border border-blue-900/50 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-center shadow-lg relative overflow-hidden">
                        <div className="header-light-beam" />
                        <div className="relative z-10">
                          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Total a Entregar (Contado - Fondo)
                          </p>
                          <p className="text-2xl sm:text-3xl font-black text-white mt-0.5 tracking-tight">
                            ${formatMoney(totalContado - fondoBase)}
                          </p>
                        </div>
                      </div>

                      {/* Inputs: Persona recibe & Comentarios */}
                      <FormField
                        control={form.control}
                        name="persona_recibe"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-xs font-semibold">Nombre de quien recibe</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={usersLoading}>
                              <FormControl>
                                <SelectTrigger className="h-9 rounded-xl border-border/60">
                                  <SelectValue placeholder={usersLoading ? 'Cargando...' : 'Selecciona un usuario'} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                {filteredUsers.map((u) => (
                                  <SelectItem key={u.id} value={u.name}>
                                    {u.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="comentarios"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-xs font-semibold">Comentarios</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="(Opcional)" className="h-9 rounded-xl border-border/60 text-xs" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-3 pb-2 border-t border-border/60 bg-muted/10 flex justify-end gap-2.5 flex-shrink-0 -mx-4 sm:-mx-6 px-4 sm:px-6">
                  <Button type="button" variant="outline" className="rounded-xl border-border/60 h-9 sm:h-10 text-xs sm:text-sm font-medium" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="alfa" className="h-9 sm:h-10 rounded-xl px-5 text-xs sm:text-sm font-bold shadow-md" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Corte
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen}>
        <DialogContent hideCloseButton={true} className="p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background max-w-md">
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 text-white border-b border-blue-900/40">
            <div className="header-light-beam" />
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="h-5 w-5 text-slate-300" />
                <div>
                  <DialogTitle className="font-bold text-base text-white leading-tight">
                    Requiere Autorización
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300">
                    Permiso para editar fondo de caja
                  </DialogDescription>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => { setAuthCode(''); setIsAuthModalOpen(false); }}
                className="h-7 w-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <p className="text-xs sm:text-sm text-muted-foreground">
              Para editar el fondo de caja, es necesario un código con permisos de caja.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="auth-code-fondo" className="text-xs font-semibold">Código de Autorización</Label>
              <Input
                id="auth-code-fondo"
                type="password"
                placeholder="••••••••"
                value={authCode}
                onChange={e => setAuthCode(e.target.value)}
                className="rounded-xl h-10 border-border/60 text-center tracking-widest font-mono text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAuthCodeSubmit();
                }}
              />
            </div>
          </div>
          <div className="p-3 sm:p-4 border-t border-border/60 bg-muted/10 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-border/60 hover:bg-white/5 font-medium text-xs h-9"
              onClick={() => { setAuthCode(''); setIsAuthModalOpen(false); }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="alfa"
              size="sm"
              className="h-9 rounded-xl px-4 text-xs font-bold text-white shadow-md"
              onClick={handleAuthCodeSubmit}
            >
              Aceptar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
