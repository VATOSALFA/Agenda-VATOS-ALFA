
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
}

const predefinedTemplates: Template[] = [
  { id: 'confirmacion', name: 'Mensaje de confirmación', body: '¡Hola, {Nombre cliente}! Tu cita para {Servicio} ha sido confirmada para el {Fecha y hora reserva}. ¡Te esperamos!' },
  { id: 'recordatorio', name: 'Recordatorio de cita', body: '¡No lo olvides, {Nombre cliente}! Mañana a las {Hora reserva} tienes tu cita para {Servicio}. Responde a este mensaje para confirmar tu asistencia.' },
  { id: 'redes_sociales', name: 'Mensaje para redes sociales', body: '¡Hey! ¿Listo para tu próximo corte? Agenda tu cita directamente desde aquí: {Link de reserva}' },
  { id: 'cumpleanos', name: 'Descuento por cumpleaños', body: '¡Feliz cumpleaños, {Nombre cliente}! Para celebrarlo, te ofrecemos un 20% de descuento en tu próximo servicio. ¡Válido por 30 días!' },
  { id: 'agradecimiento', name: 'Agradecimiento post-cita', body: '¡Gracias por visitarnos, {Nombre cliente}! Esperamos que hayas disfrutado tu {Servicio}. ¡Nos vemos pronto!' },
];

interface TemplateSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAndEdit: (template: Template) => void;
}

export function TemplateSelectionModal({ isOpen, onClose, onSelectAndEdit }: TemplateSelectionModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(predefinedTemplates[0]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Plantillas prediseñadas</DialogTitle>
          <DialogDescription>
            Selecciona una plantilla para empezar. Podrás editarla antes de guardarla.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow grid md:grid-cols-3 gap-6 overflow-hidden">
          <div className="md:col-span-1 flex flex-col">
            <h4 className="font-semibold mb-2 text-sm">Plantillas</h4>
            <ScrollArea className="flex-grow border rounded-lg">
                <div className="p-2 space-y-1">
                    {predefinedTemplates.map((template) => (
                    <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template)}
                        className={cn(
                        'w-full text-left p-2 rounded-md text-sm flex items-center gap-3',
                        selectedTemplate.id === template.id
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
          <Button onClick={() => onSelectAndEdit(selectedTemplate)}>Seleccionar y editar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
