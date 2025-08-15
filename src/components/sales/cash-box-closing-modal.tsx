

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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Save, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { cn } from '@/lib/utils';
import { Label } from '../ui/label';

const denominations = [
  { value: 1000, label: '$1,000' },
  { value: 500, label: '$500' },
  { value: 200, label: '$200' },
  { value: 100, label: '$100' },
  { value: 50, label: '$50' },
  { value: 20, label: '$20' },
  { value: 10, label: '$10' },
  { value: 5, label: '$5' },
  { value: 2, label: '$2' },
  { value: 1, label: '$1' },
  { value: 0.5, label: '$0.50' },
];

const closingSchema = z.object({
  monto_entregado: z.coerce.number().min(0, 'El monto debe ser un número positivo.'),
  persona_recibe: z.string().min(1, 'Debes ingresar el nombre de quien recibe.'),
  comentarios: z.string().optional(),
  denominations: z.record(z.coerce.number().min(0).optional()),
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
  
  // This would typically come from local settings
  const [fondoBase, setFondoBase] = useState(1000);

  const form = useForm<ClosingFormData>({
    resolver: zodResolver(closingSchema),
    defaultValues: {
      monto_entregado: 0,
      persona_recibe: '',
      comentarios: '',
      denominations: {},
    },
  });

  const watchedDenominations = form.watch('denominations');

  const totalContado = useMemo(() => {
    if (!watchedDenominations) return 0;
    return Object.entries(watchedDenominations).reduce((acc, [key, count]) => {
      const denominationValue = parseFloat(key);
      const countValue = Number(count) || 0;
      if (isNaN(denominationValue) || isNaN(countValue)) return acc;
      return acc + (denominationValue * countValue);
    }, 0);
  }, [watchedDenominations]);
  
  const diferencia = totalContado - (initialCash + fondoBase);

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
            detalle_conteo: data.denominations,
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


  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Realizar Corte de Caja</DialogTitle>
          <DialogDescription>
             {format(new Date(), "eeee, dd 'de' MMMM 'de' yyyy", { locale: es })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
              <h3 className="font-semibold">Calculadora de Efectivo</h3>
              <ScrollArea className="h-96 border rounded-md">
                <Table>
                    <TableBody>
                        {denominations.map(d => (
                            <TableRow key={d.value}>
                                <TableCell className="font-medium">{d.label}</TableCell>
                                <TableCell><Input type="number" placeholder="0" {...form.register(`denominations.${d.value}`)} /></TableCell>
                                <TableCell className="text-right font-mono">${((watchedDenominations?.[d.value] || 0) * d.value).toLocaleString('es-CL')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
              </ScrollArea>
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between font-bold text-lg"><p>Total Contado:</p> <p>${totalContado.toLocaleString('es-CL')}</p></div>
                  <div className="flex justify-between text-sm"><p>Total en Sistema (Ingresos - Egresos):</p> <p>${initialCash.toLocaleString('es-CL')}</p></div>
                   <div className="flex justify-between text-sm"><p>Fondo Base:</p> <p>${fondoBase.toLocaleString('es-CL')}</p></div>
                  <div className={cn("flex justify-between font-bold text-sm pt-2 border-t", diferencia !== 0 ? 'text-red-500' : 'text-green-500')}>
                      <p>Diferencia:</p> <p>${diferencia.toLocaleString('es-CL')}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                        <FormLabel>Fondo Base en Caja</FormLabel>
                         <Button type="button" variant="ghost" size="sm" onClick={() => (isEditingFondo ? setIsEditingFondo(false) : handleAuthRequest())}>
                            {isEditingFondo ? <Save className="h-4 w-4 mr-2" /> : <Edit className="h-4 w-4 mr-2" />}
                            {isEditingFondo ? 'Guardar' : 'Editar'}
                        </Button>
                    </div>
                    {isEditingFondo ? (
                        <Input type="number" value={fondoBase} onChange={(e) => setFondoBase(Number(e.target.value))} className="mt-2 text-2xl font-bold h-auto p-0 border-0 shadow-none focus-visible:ring-0" />
                    ) : (
                        <p className="text-2xl font-bold">${fondoBase.toLocaleString('es-CL')}</p>
                    )}
                    <p className="text-xs text-muted-foreground">Este monto debe permanecer en caja. Editable por el administrador.</p>
                  </CardContent>
                </Card>
                <FormField
                    control={form.control}
                    name="monto_entregado"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Monto entregado (sin fondo base)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
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
            </div>
            <DialogFooter className="md:col-span-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Corte
                </Button>
            </DialogFooter>
          </form>
        </Form>
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
