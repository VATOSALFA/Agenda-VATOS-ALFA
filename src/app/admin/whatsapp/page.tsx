
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Lightbulb, PlayCircle } from 'lucide-react';
import { TemplateSelectionModal, type Template } from '@/components/admin/whatsapp/template-selection-modal';
import { TemplateEditorModal } from '@/components/admin/whatsapp/template-editor-modal';
import { useToast } from '@/hooks/use-toast';

export default function WhatsappPage() {
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const { toast } = useToast();

  const welcomeMessage = `¡Hola, {Nombre cliente}!\n\n¡Te damos la bienvenida a {Compañía}!\nEstamos emocionados de que hayas elegido nuestros servicios.\n\nTu cita de {Servicio} está reservada para el {Fecha y hora reserva}.\n\n¡Te esperamos!`;
  const reminderMessage = `¡Hola, {Nombre cliente}!\n\nEste es un recordatorio de tu cita para {Servicio} el día {Fecha y hora reserva}.\n\nPor favor, confirma tu asistencia.\n\n¡Nos vemos pronto!`;
  
  const handleSelectAndEdit = (template: Template) => {
    setSelectedTemplate(template);
    setIsEditorModalOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorModalOpen(false);
    // We can keep the selection modal open or close it too.
    // Let's close both for a cleaner UX.
    // If you want to keep the selection modal, remove the next line.
    setIsSelectionModalOpen(false); 
  };
  
  const handleSaveTemplate = (data: { name: string, body: string }) => {
     console.log("Saving template:", data);
     toast({
        title: "Plantilla guardada con éxito",
        description: `La plantilla "${data.name}" ha sido guardada.`,
     });
     handleCloseEditor();
  };


  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Whatsapp</h2>
        </div>

        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertTitle>¡Ahora podrás enviar mensajes personalizados por WhatsApp!</AlertTitle>
          <AlertDescription>
            Configúralos y envíalos de manera personalizada desde la Agenda.
          </AlertDescription>
        </Alert>

        <div className="pt-6">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="p-8 md:p-12 bg-card flex flex-col justify-center">
                <h1 className="text-4xl font-extrabold tracking-tight mb-4 text-primary">
                  ¡Potencia tus mensajes de WhatsApp con nuestras plantillas prediseñadas!
                </h1>
                <p className="text-muted-foreground mb-6 text-lg">
                  Crea mensajes personalizados de manera rápida y efectiva con nuestras plantillas listas para usar. Podrás enviar los mensajes predefinidos desde la reserva a la velocidad del rayo.
                </p>
                <div className="flex items-center gap-4">
                  <Button size="lg" onClick={() => setIsSelectionModalOpen(true)}>Probar plantillas</Button>
                </div>
              </div>
              <div className="p-8 bg-muted/40 flex items-center justify-center">
                <Card className="w-full max-w-sm shadow-2xl">
                  <CardContent className="p-4">
                    <Tabs defaultValue="welcome">
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="welcome">Mensaje de bienvenida</TabsTrigger>
                        <TabsTrigger value="reminder">Recordatorio de cita</TabsTrigger>
                      </TabsList>
                      <TabsContent value="welcome">
                          <div className="bg-background p-4 rounded-lg border min-h-[200px]">
                              <p className="text-sm whitespace-pre-wrap">{welcomeMessage}</p>
                          </div>
                      </TabsContent>
                      <TabsContent value="reminder">
                          <div className="bg-background p-4 rounded-lg border min-h-[200px]">
                              <p className="text-sm whitespace-pre-wrap">{reminderMessage}</p>
                          </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            </div>
          </Card>
        </div>
      </div>
      
      {isSelectionModalOpen && (
        <TemplateSelectionModal
            isOpen={isSelectionModalOpen}
            onClose={() => setIsSelectionModalOpen(false)}
            onSelectAndEdit={handleSelectAndEdit}
        />
      )}

      {isEditorModalOpen && selectedTemplate && (
        <TemplateEditorModal
            isOpen={isEditorModalOpen}
            onClose={handleCloseEditor}
            onSave={handleSaveTemplate}
            template={selectedTemplate}
        />
      )}
    </>
  );
}
