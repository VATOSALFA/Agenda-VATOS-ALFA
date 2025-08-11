
'use client';

import { useState, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, PlusCircle, Trash2, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Local } from '@/lib/types';
import { collection, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';


interface WhatsappConfig {
    id: string;
    name: string;
    phone: string;
    local_id: string;
}

const whatsappSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  phone: z.string().min(10, 'Ingresa un número de teléfono válido'),
  local_id: z.string().min(1, 'Debes seleccionar una sucursal'),
});

type WhatsappFormData = z.infer<typeof whatsappSchema>;

export default function WhatsappPage() {
  const [queryKey, setQueryKey] = useState(0);
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);
  const { data: whatsappConfigs, loading: configsLoading } = useFirestoreQuery<WhatsappConfig>('whatsapp_configuraciones', queryKey);
  const [configToDelete, setConfigToDelete] = useState<WhatsappConfig | null>(null);
  const { toast } = useToast();
  
  const form = useForm<WhatsappFormData>({
    resolver: zodResolver(whatsappSchema),
    defaultValues: { name: '', phone: '', local_id: '' },
  });

  const onSubmit = async (data: WhatsappFormData) => {
    try {
      await addDoc(collection(db, 'whatsapp_configuraciones'), {
        ...data,
        created_at: Timestamp.now(),
      });
      toast({ title: 'Configuración guardada', description: 'El número de WhatsApp ha sido guardado.' });
      form.reset();
      setQueryKey(prev => prev + 1);
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la configuración.' });
    }
  };
  
  const handleDelete = async () => {
    if (!configToDelete) return;
    try {
        await deleteDoc(doc(db, 'whatsapp_configuraciones', configToDelete.id));
        toast({ title: 'Configuración eliminada' });
        setConfigToDelete(null);
        setQueryKey(prev => prev + 1);
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error al eliminar'});
    }
  }

  const localMap = useMemo(() => new Map(locales.map(l => [l.id, l.name])), [locales]);
  const isLoading = localesLoading || configsLoading;

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Whatsapp</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><MessageCircle className="h-6 w-6"/> Conecta tu número</CardTitle>
                    <CardDescription>Agrega un número de WhatsApp y asígnalo a una de tus sucursales para enviar notificaciones.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                             <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nombre</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ej: WhatsApp Sucursal Principal" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Número de WhatsApp</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ej: +521234567890" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="local_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Sucursal</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={localesLoading}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={localesLoading ? 'Cargando...' : 'Seleccionar sucursal'} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                            {locales.map((local) => (
                                                <SelectItem key={local.id} value={local.id}>
                                                {local.name}
                                                </SelectItem>
                                            ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Guardar
                             </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>Números Configurados</CardTitle>
                    <CardDescription>Listado de los números de WhatsApp activos.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Número</TableHead>
                                <TableHead>Sucursal</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                            ) : whatsappConfigs.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay números configurados.</TableCell></TableRow>
                            ) : whatsappConfigs.map(config => (
                                <TableRow key={config.id}>
                                    <TableCell className="font-medium">{config.name}</TableCell>
                                    <TableCell>{config.phone}</TableCell>
                                    <TableCell>{localMap.get(config.local_id) || 'Desconocido'}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setConfigToDelete(config)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

        </div>
      </div>
      
       {configToDelete && (
        <AlertDialog open={!!configToDelete} onOpenChange={() => setConfigToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Se eliminará permanentemente la configuración para el número {configToDelete.phone}.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                        Sí, eliminar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
