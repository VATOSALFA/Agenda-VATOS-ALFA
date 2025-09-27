
'use client';

import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import type { Template } from './template-selection-modal';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';


interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; body: string; contentSid: string }) => void;
  template: Template;
}

const editorSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  body: z.string().min(1, 'El cuerpo del mensaje no puede estar vacío.'),
  contentSid: z.string().regex(/^HX[a-f0-9]{32}$/, 'Debe ser un Content SID válido de Twilio (ej. HX...).'),
});

type EditorFormData = z.infer<typeof editorSchema>;

const dataTags = {
    'Datos de la reserva': [
        '[[Nombre cliente]]', '[[Apellido cliente]]', '[[Profesional]]', '[[Nombre servicio]]', '[[Precio reserva]]', '[[Duración]]', '[[Fecha y hora reserva]]', '[[Link de pago]]'
    ],
    'Datos del local': [
        '[[Nombre local]]', '[[Ubicación local]]', '[[Teléfono local]]', '[[Email local]]'
    ],
    'Datos de la compañía': [
        '[[Compañía]]', '[[Sitio de agendamiento]]', '[[Instagram]]', '[[Facebook]]', '[[Tu página web]]'
    ]
}

const emojis = {
    'Emojis': ['✂️', '💈', '💇‍♂️', '💇‍♀️', '✨', '👍', '✅', '📅', '⏰', '📍', '💰', '💳', '👋', '🙏', '😎', '🔥', '💯', '👉', '👈', '➡️', '⬅️', '🔝', '💥', '🧔', '👨‍🦱', '👨‍🦰', '👨‍🦳', '👑', '💀']
}

const sampleData: Record<string, string> = {
    '[[Nombre cliente]]': 'Juan',
    '[[Apellido cliente]]': 'Pérez',
    '[[Profesional]]': 'El Patrón',
    '[[Nombre servicio]]': 'Corte y Barba',
    '[[Precio reserva]]': '$500.00',
    '[[Duración]]': '60 min',
    '[[Fecha y hora reserva]]': '15/08/2024 a las 16:00',
    '[[Link de pago]]': 'https://pagos.vatosalfa.com/pay123',
    '[[Nombre local]]': 'Sucursal Condesa',
    '[[Ubicación local]]': 'Av. Amsterdam 123, Condesa',
    '[[Teléfono local]]': '+52 55 1234 5678',
    '[[Email local]]': 'condesa@vatosalfa.com',
    '[[Compañía]]': 'VATOS ALFA Barber Shop',
    '[[Sitio de agendamiento]]': 'https://vatosalfa.com/agenda',
    '[[Instagram]]': '@vatosalfa',
    '[[Facebook]]': '/vatosalfa.bs',
    '[[Tu página web]]': 'https://vatosalfa.com'
};


export function TemplateEditorModal({ isOpen, onClose, onSave, template }: TemplateEditorModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const form = useForm<EditorFormData>({
    resolver: zodResolver(editorSchema),
    defaultValues: {
      name: template.name,
      body: template.body,
      contentSid: template.contentSid?.startsWith('HX') ? template.contentSid : '',
    },
  });
  
  const messageBody = form.watch('body');

  useEffect(() => {
    form.reset({
        name: template.name,
        body: template.body,
        contentSid: template.contentSid?.startsWith('HX') ? template.contentSid : '',
    });
  }, [template, form]);

  const handleTagClick = (tag: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const newText = `${text.substring(0, start)}${tag}${text.substring(end)}`;
      form.setValue('body', newText, { shouldValidate: true });
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }
  };
  
  const generatePreview = () => {
    let preview = messageBody;
    for (const key in sampleData) {
        preview = preview.replace(new RegExp(key.replace(/\[/g, '\\[').replace(/\]/g, '\\]'), 'g'), sampleData[key]);
    }
    return preview;
  }

  const onSubmit = (data: EditorFormData) => {
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
        onSave(data);
        setIsSubmitting(false);
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editando: {template.name}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col space-y-4 overflow-hidden">
            <div className="grid md:grid-cols-3 gap-6 flex-grow overflow-hidden">
                {/* Left Column */}
                <div className="md:col-span-2 flex flex-col space-y-4 overflow-hidden">
                    <div className="flex-shrink-0">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nombre del mensaje <span className="text-destructive">*</span></FormLabel>
                                    <FormControl><Input {...field} placeholder="El nombre se usará para reconocer el mensaje en la agenda" /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    
                    <ScrollArea className="flex-grow pr-2">
                        <div className="space-y-2">
                           <div className="space-y-2">
                                <Label>Personaliza el mensaje <span className="text-destructive">*</span></Label>
                                <p className="text-xs text-muted-foreground">Escribe en el cuadro de texto y haz clic en las tarjetas para agregar datos pre-cargados de la cita a tu mensaje personalizado.</p>
                            </div>
                            <Accordion type="multiple" className="w-full space-y-2">
                                {Object.entries(dataTags).map(([category, tags]) => (
                                    <AccordionItem value={category} key={category} className="border rounded-lg bg-card/50">
                                        <AccordionTrigger className="px-4 py-3 hover:no-underline">{category}</AccordionTrigger>
                                        <AccordionContent>
                                            <div className="flex flex-wrap gap-2 pt-1 px-4 pb-4">
                                                {tags.map(tag => (
                                                    <Button key={tag} type="button" variant="outline" size="sm" className="text-xs" onClick={() => handleTagClick(tag)}>
                                                        {tag.replace(/\[|\]/g, '')}
                                                    </Button>
                                                ))}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                                {Object.entries(emojis).map(([category, tags]) => (
                                    <AccordionItem value={category} key={category} className="border rounded-lg bg-card/50">
                                        <AccordionTrigger className="px-4 py-3 hover:no-underline">{category}</AccordionTrigger>
                                        <AccordionContent>
                                            <div className="flex flex-wrap gap-1 pt-1 px-4 pb-4">
                                                {tags.map(tag => (
                                                    <Button key={tag} type="button" variant="ghost" size="icon" className="text-xl" onClick={() => handleTagClick(tag)}>
                                                        {tag}
                                                    </Button>
                                                ))}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                             <FormField
                                control={form.control}
                                name="body"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col flex-grow pt-2">
                                        <FormControl>
                                            <Textarea {...field} ref={textareaRef} className="flex-grow resize-none min-h-[150px]"/>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </ScrollArea>
                     <div className="flex-shrink-0">
                        <FormField
                            control={form.control}
                            name="contentSid"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Content SID (de Twilio) <span className="text-destructive">*</span></FormLabel>
                                    <FormControl><Input {...field} placeholder="HX..." /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                {/* Right Column */}
                 <div className="md:col-span-1 flex flex-col space-y-2">
                     <h4 className="font-semibold text-sm">Previsualización del mensaje</h4>
                     <Card className="flex-grow bg-muted/50">
                        <CardContent className="p-4">
                            <pre className="text-sm whitespace-pre-wrap font-sans">{generatePreview() || "Escribe un mensaje para ver la previsualización."}</pre>
                        </CardContent>
                     </Card>
                     <div className="flex justify-end">
                        <Button type="button" variant="ghost">Enviar mensaje de prueba</Button>
                     </div>
                </div>
            </div>
            <DialogFooter className="pt-4 border-t flex-shrink-0">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
