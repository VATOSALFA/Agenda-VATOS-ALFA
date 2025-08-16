
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/firebase-auth-context';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Edit, Save, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';

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
}

export function CashBoxClosingModal({ isOpen, onOpenChange, onFormSubmit, initialCash }: CashBoxClosingModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingFondo, setIsEditingFondo] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authCode, setAuthCode] = useState('');
  
  const [fondoBase, setFondoBase] = useState(1000);
  
  const initialDenominations = useMemo(() => denominations.reduce((acc, d) => {
    acc[d.value] = 0;
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
    return denominations.reduce((total, d) => {
      const count = denominationCounts[d.value] || 0;
      return total + (count * d.value);
    }, 0);
  }, [denominationCounts, denominations]);
  
  const diferencia = totalContado - fondoBase - initialCash;

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

  async function onSubmit(data: ClosingFormData) {
    setIsSubmitting(true);
    try {
        await addDoc(collection(db, 'cortes_caja'), {
            fecha_corte: Timestamp.now(),
            persona_entrega_id: user?.uid,
            persona_entrega_nombre: user?.displayName,
            persona_recibe: data.persona_recibe,
            fondo_base: fondoBase,
            monto_entregado: data.monto_entregado,
            total_calculado: totalContado,
            total_sistema: initialCash,
            diferencia: diferencia,
            comentarios: data.comentarios,
            detalle_conteo: denominationCounts,
        });
        toast({ title: 'Corte de caja guardado con éxito.' });
        onFormSubmit();
        onOpenChange(false);
    } catch (error) {
        console.error("Error guardando corte de caja:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el corte de caja.'});
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
    const newCount = parseInt(count, 10) || 0;
    setDenominationCounts(prev => ({...prev, [value]: newCount}));
  }


  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Realizar Corte de Caja</DialogTitle>
          <DialogDescription>
             {format(new Date(), "eeee, dd 'de' MMMM 'de' yyyy", { locale: es })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-hidden">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="py-4 h-full flex flex-col">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-grow overflow-hidden">
                    {/* Left Column */}
                    <div className="space-y-4 flex flex-col h-full">
                        <h3 className="font-semibold flex-shrink-0">Calculadora de Efectivo</h3>
                         <div className="flex-grow border rounded-lg overflow-hidden flex flex-col">
                            <ScrollArea>
                                <div className="p-4 space-y-3">
                                  {denominations.map(d => (
                                    <div key={d.value} className="grid grid-cols-3 gap-2 items-center">
                                      <Label htmlFor={`den-${d.value}`} className="text-right">{d.label}</Label>
                                      <Input 
                                        id={`den-${d.value}`}
                                        type="number"
                                        placeholder="0" 
                                        value={denominationCounts[d.value] || ''}
                                        onChange={(e) => handleDenominationChange(d.value, e.target.value)}
                                        className="h-8 text-center" 
                                      />
                                      <p className="font-medium text-sm text-center">= ${(d.value * (denominationCounts[d.value] || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                  ))}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-4 flex flex-col">
                        <div className="space-y-2">
                            <FormLabel className="flex justify-between items-center">
                                <span>Fondo base en caja</span>
                                <Button type="button" variant="ghost" size="sm" onClick={() => (isEditingFondo ? setIsEditingFondo(false) : handleAuthRequest())}>
                                    {isEditingFondo ? <Save className="h-4 w-4 mr-2" /> : <Edit className="h-4 w-4 mr-2" />}
                                    {isEditingFondo ? 'Guardar' : 'Editar'}
                                </Button>
                            </FormLabel>
                            {isEditingFondo ? (
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <Input type="number" value={fondoBase} onChange={(e) => setFondoBase(Number(e.target.value))} className="pl-6" />
                                </div>
                            ) : (
                                <p className="font-semibold text-lg">$ {fondoBase.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                            )}
                        </div>
                        <FormField
                            control={form.control}
                            name="monto_entregado"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Monto entregado (sin fondo base)</FormLabel>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <FormControl><Input type="number" {...field} className="pl-6" /></FormControl>
                                </div>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="persona_recibe"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Nombre de quien recibe</FormLabel>
                                <FormControl><Input {...field} /></FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="comentarios"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Comentarios</FormLabel>
                                <FormControl><Input {...field} placeholder="(Opcional)" /></FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="space-y-2 pt-4 border-t flex-shrink-0">
                          <div className="flex justify-between items-center text-sm font-semibold">
                            <p>Total Contado</p>
                            <p>${totalContado.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <p>Efectivo en caja (Sistema)</p>
                            <p>${initialCash.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <p>Fondo Base</p>
                            <p>- ${fondoBase.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                          </div>
                           <div className={cn("flex justify-between items-center font-bold text-sm pt-2 border-t", diferencia !== 0 ? 'text-red-500' : 'text-green-500')}>
                              <p>Diferencia</p>
                              <p>{diferencia < 0 ? '-' : ''}${Math.abs(diferencia).toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                          </div>
                        </div>
                    </div>
                </div>
                <DialogFooter className="pt-8 border-t flex-shrink-0">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Corte
                    </Button>
                </DialogFooter>
              </form>
            </Form>
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-yellow-500" />
                    Requiere Autorización
                </AlertDialogTitle>
                <AlertDialogDescription>
                    Para editar el fondo de caja, es necesario un código con permisos de caja.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
                <Label htmlFor="auth-code-fondo">Código de Autorización</Label>
                <Input id="auth-code-fondo" type="password" placeholder="Ingrese el código" value={authCode} onChange={e => setAuthCode(e.target.value)} />
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setAuthCode('')}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleAuthCodeSubmit}>Aceptar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
