
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { FileText } from 'lucide-react';

export interface Template {
  id: string;
  name: string;
  body: string;
  contentSid: string;
}

const predefinedTemplates: Omit<Template, 'id'>[] = [
  { name: 'Mensaje de confirmación', contentSid: 'HX...', body: '¡Hola, {{1}}! Tu cita para {{2}} con {{4}} ha sido confirmada para el {{3}}. ¡Te esperamos!' },
  { name: 'Recordatorio de cita', contentSid: 'HX...', body: '¡No lo olvides, {{1}}! Mañana a las {{2}} tienes tu cita para {{3}}. Responde a este mensaje para confirmar tu asistencia.' },
  { name: 'Mensaje para redes sociales', contentSid: 'HX...', body: '¡Hey! ¿Listo para tu próximo corte? Agenda tu cita directamente desde aquí: {{1}}' },
  { name: 'Descuento por cumpleaños', contentSid: 'HX...', body: '¡Feliz cumpleaños, {{1}}! Para celebrarlo, te ofrecemos un 20% de descuento en tu próximo servicio. ¡Válido por 30 días!' },
  { name: 'Agradecimiento post-cita', contentSid: 'HX...', body: '¡Gracias por visitarnos, {{1}}! Esperamos que hayas disfrutado tu {{2}}. ¡Nos vemos pronto!' },
];


interface TemplateSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAndEdit: (template: Template) => void;
}

export function TemplateSelectionModal({ isOpen, onClose, onSelectAndEdit }: TemplateSelectionModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Omit<Template, 'id'>>(predefinedTemplates[0]);

  const handleSelect = () => {
    const newTemplate: Template = {
      id: Date.now().toString(), // Create a temporary ID
      ...selectedTemplate
    };
    onSelectAndEdit(newTemplate);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Plantillas prediseñadas</DialogTitle>
          <DialogDescription>
            Selecciona una plantilla para empezar. Podrás editarla y agregar el Content SID de Twilio antes de guardarla.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow grid md:grid-cols-3 gap-6 overflow-hidden">
          <div className="md:col-span-1 flex flex-col">
            <h4 className="font-semibold mb-2 text-sm">Plantillas</h4>
            <ScrollArea className="flex-grow border rounded-lg">
                <div className="p-2 space-y-1">
                    {predefinedTemplates.map((template) => (
                    <button
                        key={template.name}
                        onClick={() => setSelectedTemplate(template)}
                        className={cn(
                        'w-full text-left p-2 rounded-md text-sm flex items-center gap-3',
                        selectedTemplate.name === template.name
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'hover:bg-muted'
                        )}
                    >
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        {template.name}
                    </button>
                    ))}
              </div>
            </ScrollArea>
          </div>
          <div className="md:col-span-2 flex flex-col">
             <h4 className="font-semibold mb-2 text-sm">Previsualización del mensaje</h4>
             <Card className="flex-grow bg-muted/50">
                <CardContent className="p-4">
                    <pre className="text-sm whitespace-pre-wrap font-sans">{selectedTemplate.body}</pre>
                </CardContent>
             </Card>
          </div>
        </div>
        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSelect}>Seleccionar y editar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
