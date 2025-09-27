

'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle, Trash2, MessageCircle, Edit, Send } from 'lucide-react';
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
import { TemplateSelectionModal, type Template } from '@/components/admin/whatsapp/template-selection-modal';
import { TemplateEditorModal } from '@/components/admin/whatsapp/template-editor-modal';
import { sendTemplatedWhatsAppMessage } from '@/ai/flows/send-templated-whatsapp-flow';


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

const initialTemplates: Template[] = [
    { id: 'confirmacion', name: 'Mensaje de confirmación', contentSid: 'HX18fff4936a83e0ec91cd5bf3099efaa9', body: '¡Hola, {{1}}! Tu cita para {{2}} con {{4}} ha sido confirmada para el {{3}}. ¡Te esperamos!' },
    { id: 'recordatorio', name: 'Recordatorio de cita', contentSid: 'HX...', body: '¡No lo olvides, {{1}}! Mañana a las {{2}} tienes tu cita para {{3}}. Responde a este mensaje para confirmar tu asistencia.' },
];

export default function WhatsappPage() {
  const [queryKey, setQueryKey] = useState(0);
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);
  const { data: whatsappConfigs, loading: configsLoading } = useFirestoreQuery<WhatsappConfig>('whatsapp_configuraciones', queryKey);
  const [configToDelete, setConfigToDelete] = useState<WhatsappConfig | null>(null);
  const { toast } = useToast();
  
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

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

  const handleOpenEditor = (template: Template) => {
    setEditingTemplate(template);
    setIsEditorModalOpen(true);
    setIsSelectionModalOpen(false);
  }

  const handleSaveTemplate = (data: { name: string, body: string, contentSid: string }) => {
    if (editingTemplate) {
      setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? { ...t, ...data } : t));
      toast({ title: 'Plantilla actualizada' });
    } else {
        const newTemplate = { id: Date.now().toString(), ...data };
        setTemplates(prev => [...prev, newTemplate]);
        toast({ title: 'Plantilla creada' });
    }
    setEditingTemplate(null);
    setIsEditorModalOpen(false);
  }

  const handleSendTest = async () => {
    setIsSendingTest(true);
    try {
      const result = await sendTemplatedWhatsAppMessage({
        to: '5561042575', // Hardcoded test number
        contentSid: 'HX18fff4936a83e0ec91cd5bf3099efaa9', // 'agendada'
        contentVariables: {
          '1': 'Alejandro',
          '2': 'Corte y Barba',
          '3': '25 de Julio a las 15:00',
          '4': 'El Patrón'
        }
      });
      if(result.success) {
        toast({ title: "Mensaje de prueba enviado", description: `SID: ${result.sid}` });
      } else {
        throw new Error(result.error || 'Error desconocido');
      }
    } catch (error: any) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error de envío', description: error.message });
    }
    setIsSendingTest(false);
  };

  const localMap = useMemo(() => new Map(locales.map(l => [l.id, l.name])), [locales]);
  const isLoading = localesLoading || configsLoading;

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Whatsapp</h2>
        </div>

        <Tabs defaultValue="numeros">
            <TabsList>
                <TabsTrigger value="numeros">Números</TabsTrigger>
                <TabsTrigger value="plantillas">Plantillas de Mensajes</TabsTrigger>
            </TabsList>
            <TabsContent value="numeros" className="mt-4">
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
                            <div className="mt-4">
                                <Button onClick={handleSendTest} disabled={isSendingTest}>
                                    {isSendingTest && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Send className="mr-2 h-4 w-4" /> Probar Envío a Twilio
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>
            <TabsContent value="plantillas" className="mt-4">
                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle>Plantillas de Mensajes</CardTitle>
                            <CardDescription>Crea y edita plantillas para tus notificaciones automáticas y campañas.</CardDescription>
                        </div>
                        <Button onClick={() => setIsSelectionModalOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Crear plantilla
                        </Button>
                    </CardHeader>
                    <CardContent>
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre de la plantilla</TableHead>
                                    <TableHead>Content SID</TableHead>
                                    <TableHead>Mensaje</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {templates.map((template) => (
                                    <TableRow key={template.id}>
                                        <TableCell className="font-medium">{template.name}</TableCell>
                                        <TableCell className="font-mono text-xs">{template.contentSid}</TableCell>
                                        <TableCell className="max-w-md truncate text-muted-foreground">{template.body}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => handleOpenEditor(template)}>
                                                <Edit className="mr-2 h-4 w-4" /> Editar
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
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

      <TemplateSelectionModal 
        isOpen={isSelectionModalOpen}
        onClose={() => setIsSelectionModalOpen(false)}
        onSelectAndEdit={handleOpenEditor}
      />
      {editingTemplate && (
          <TemplateEditorModal 
            isOpen={isEditorModalOpen}
            onClose={() => setEditingTemplate(null)}
            onSave={handleSaveTemplate}
            template={editingTemplate}
          />
      )}
    </>
  );
}
