
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import type { Template } from './template-selection-modal';

interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string, body: string }) => void;
  template: Template;
}

const editorSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.'),
  body: z.string().min(10, 'El mensaje debe tener al menos 10 caracteres.'),
});

type EditorFormData = z.infer<typeof editorSchema>;

const availableTags = [
    '{Nombre cliente}',
    '{Apellido cliente}',
    '{Compañía}',
    '{Servicio}',
    '{Fecha reserva}',
    '{Hora reserva}',
    '{Fecha y hora reserva}',
    '{Link de reserva}',
];

export function TemplateEditorModal({ isOpen, onClose, onSave, template }: TemplateEditorModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const form = useForm<EditorFormData>({
    resolver: zodResolver(editorSchema),
    defaultValues: {
      name: template.name,
      body: template.body,
    },
  });

  const messageBody = form.watch('body');

  useEffect(() => {
    form.reset({ name: template.name, body: template.body });
  }, [template, form]);

  const handleTagClick = (tag: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const newText = text.substring(0, start) + tag + text.substring(end);
      form.setValue('body', newText, { shouldValidate: true });
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }
  };

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
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editando: {template.name}</DialogTitle>
          <DialogDescription>
            Personaliza el mensaje y guárdalo para usarlo más tarde.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow grid md:grid-cols-2 gap-6 overflow-hidden">
            <div className="flex flex-col space-y-4">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre del mensaje</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="body"
                    render={({ field }) => (
                        <FormItem className="flex flex-col flex-grow">
                            <FormLabel>Mensaje</FormLabel>
                            <FormControl>
                                <Textarea {...field} ref={textareaRef} className="flex-grow resize-none"/>
                            </FormControl>
                             <FormMessage />
                        </FormItem>
                    )}
                />
                <div>
                    <FormLabel>Etiquetas</FormLabel>
                    <div className="flex flex-wrap gap-2 pt-2">
                        {availableTags.map(tag => (
                            <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => handleTagClick(tag)}>
                                {tag}
                            </Badge>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex flex-col space-y-4">
                 <h4 className="font-semibold text-sm">Previsualización del mensaje</h4>
                 <Card className="flex-grow bg-muted/50">
                    <CardContent className="p-4">
                        <pre className="text-sm whitespace-pre-wrap font-sans">{messageBody || "Escribe un mensaje para ver la previsualización."}</pre>
                    </CardContent>
                 </Card>
                 <div className="flex items-center gap-2">
                    <Input placeholder="Número de prueba" />
                    <Button variant="secondary" type="button">Enviar mensaje de prueba</Button>
                 </div>
            </div>
          </form>
        </Form>
        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
