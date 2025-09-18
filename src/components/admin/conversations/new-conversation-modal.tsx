
'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { sendWhatsAppMessage } from '@/ai/flows/send-whatsapp-flow';
import { Combobox } from '@/components/ui/combobox';
import type { Client } from '@/lib/types';


interface NewConversationModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onMessageSent: () => void;
}

const newMessageSchema = z.object({
  clientId: z.string().min(1, 'Debes seleccionar un cliente.'),
  message: z.string().min(1, 'El mensaje no puede estar vacío.'),
});

type NewMessageFormData = z.infer<typeof newMessageSchema>;

export function NewConversationModal({ isOpen, onOpenChange, onMessageSent }: NewConversationModalProps) {
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');

  const form = useForm<NewMessageFormData>({
    resolver: zodResolver(newMessageSchema),
    defaultValues: {
      clientId: '',
      message: '',
    },
  });

  const clientOptions = useMemo(() => {
    return clients.map(client => ({
      value: client.id,
      label: `${client.nombre} ${client.apellido} (${client.telefono})`,
    }));
  }, [clients]);

  const onSubmit = async (data: NewMessageFormData) => {
    setIsSending(true);
    const selectedClient = clients.find(c => c.id === data.clientId);

    if (!selectedClient || !selectedClient.telefono) {
        toast({ variant: 'destructive', title: 'Error', description: 'El cliente seleccionado no tiene un número de teléfono.' });
        setIsSending(false);
        return;
    }

    try {
      const result = await sendWhatsAppMessage({
        to: selectedClient.telefono,
        text: data.message,
      });

      if (result.success) {
        toast({ title: '¡Mensaje enviado!', description: `El mensaje ha sido enviado a ${selectedClient.nombre}.` });
        onMessageSent();
        onOpenChange(false);
        form.reset();
      } else {
        throw new Error(result.error || 'Error desconocido al enviar el mensaje.');
      }
    } catch (error: any) {
      console.error("Error sending new message:", error);
      toast({
        variant: 'destructive',
        title: 'Error de Envío',
        description: error.message || 'No se pudo enviar el mensaje.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Nueva Conversación</DialogTitle>
              <DialogDescription>
                Busca un cliente y envíale un mensaje de WhatsApp.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <Combobox
                      options={clientOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Busca un cliente..."
                      loading={clientsLoading}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mensaje</FormLabel>
                    <FormControl>
                      <Textarea rows={5} placeholder="Escribe tu mensaje aquí..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSending}>
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

    